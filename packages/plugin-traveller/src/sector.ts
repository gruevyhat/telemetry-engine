import { distance as hexDistance } from "./hex.js";
import { parseSec, type SecParseError, type SecWorld } from "./sec.js";

const SECTOR_SCHEMA_VERSION = 1 as const;

export interface TravellerSectorRecord {
  readonly schemaVersion: typeof SECTOR_SCHEMA_VERSION;
  readonly sectorId: string;
  readonly contentHash: string;
  readonly worlds: readonly SecWorld[];
}

export interface TravellerSector {
  readonly record: TravellerSectorRecord;
  distance(from: string, to: string): number | "unknown";
}

export type SectorImportResult =
  | { readonly ok: true; readonly sector: TravellerSector }
  | {
      readonly ok: false;
      readonly error: {
        readonly code: "invalid-sector";
        readonly errors: readonly SecParseError[];
      };
    };

function stableHash(source: string): string {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }

  return [first, second]
    .map((part) => (part >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

function validateRecord(record: TravellerSectorRecord): void {
  if (record.schemaVersion !== SECTOR_SCHEMA_VERSION) {
    throw new Error(
      `Cannot load sector schema version ${String(record.schemaVersion)}. ` +
        `This build supports sector schema version ${SECTOR_SCHEMA_VERSION}.`,
    );
  }
  if (record.sectorId === "" || record.contentHash === "" || !Array.isArray(record.worlds)) {
    throw new Error("Stored sector data is malformed.");
  }
}

export function restoreSector(record: TravellerSectorRecord): TravellerSector {
  validateRecord(record);
  const loadedHexes = new Set(record.worlds.map((world) => world.hex));

  return {
    record,
    distance(from, to) {
      if (!loadedHexes.has(from) || !loadedHexes.has(to)) {
        return "unknown";
      }
      return hexDistance(from, to);
    },
  };
}

export function importSector(sectorId: string, source: string): SectorImportResult {
  const parsed = parseSec(source);
  if (parsed.errors.length > 0 || sectorId.trim() === "") {
    const errors =
      sectorId.trim() === ""
        ? [{ lineNumber: 0, code: "malformed-row" as const, line: "" }, ...parsed.errors]
        : parsed.errors;
    return { ok: false, error: { code: "invalid-sector", errors } };
  }

  return {
    ok: true,
    sector: restoreSector({
      schemaVersion: SECTOR_SCHEMA_VERSION,
      sectorId,
      contentHash: `sec:${stableHash(source)}`,
      worlds: parsed.worlds,
    }),
  };
}
