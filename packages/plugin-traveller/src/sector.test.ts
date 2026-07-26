import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  importSector,
  restoreSector,
  type SectorImportResult,
  type TravellerSector,
} from "./sector.js";

/**
 * [M3-04] Lead-authored acceptance tests. The implementation may not modify this file.
 *
 * `importSector(sectorId, source)` parses one complete SEC document. A malformed record rejects
 * the import as a typed result so a caller can leave previously stored data intact. A successful
 * result exposes a serializable `record` for the engine's setting-neutral sector store plus a
 * distance function that returns `'unknown'` unless both endpoints exist in that loaded record.
 * `restoreSector(record)` rehydrates the same behavior without parsing or fetching.
 */

const fixture = readFileSync(new URL("../fixtures/fictional-sector.sec", import.meta.url), "utf8");

function expectSuccess(result: SectorImportResult): TravellerSector {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected a valid sector import");
  return result.sector;
}

describe("stored Traveller sector", () => {
  it("imports the fictional SEC fixture into a stable serializable record", () => {
    const first = expectSuccess(importSector("fictional-alpha", fixture));
    const second = expectSuccess(importSector("fictional-alpha", fixture));

    expect(first.record.sectorId).toBe("fictional-alpha");
    expect(first.record.worlds).toHaveLength(5);
    expect(first.record.worlds[0]?.name).toBe("Cinder Wake");
    expect(first.record.contentHash).toMatch(/^sec:/);
    expect(second.record).toEqual(first.record);
    expect(JSON.stringify(second.record)).toBe(JSON.stringify(first.record));
  });

  it("restores byte-identical worlds and identical distance answers", () => {
    const imported = expectSuccess(importSector("fictional-alpha", fixture));
    const serialized = JSON.stringify(imported.record);
    const restored = restoreSector(JSON.parse(serialized) as typeof imported.record);

    expect(JSON.stringify(restored.record.worlds)).toBe(JSON.stringify(imported.record.worlds));
    expect(restored.distance("0101", "0202")).toBe(imported.distance("0101", "0202"));
    expect(restored.distance("0101", "0202")).toBe(1);
    expect(restored.distance("0101", "9999")).toBe("unknown");
    expect(restored.distance("9999", "0101")).toBe("unknown");
  });

  it("rejects a malformed SEC document without returning partial data", () => {
    const result = importSector("fictional-alpha", `${fixture}\nnot a valid SEC record`);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected a rejected sector import");
    expect(result.error.code).toBe("invalid-sector");
    expect(result.error.errors).toEqual([
      {
        lineNumber: 10,
        code: "malformed-row",
        line: "not a valid SEC record",
      },
    ]);
    expect("sector" in result).toBe(false);
  });
});
