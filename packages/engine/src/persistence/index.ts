import type { Fact } from "../ledger/types.js";

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type SeedState = Readonly<Record<string, JsonValue>>;
export type ContentHashes = Readonly<Record<string, string>>;

/** The complete portable campaign record required by Spec §18. */
/** Explicit legacy shape retained only as the input to M2's one-way v1 migration. */
export interface LegacySaveV1 {
  readonly schemaVersion: number;
  readonly seedState: SeedState;
  readonly facts: readonly Fact[];
  readonly contentHashes: ContentHashes;
}

export interface ContentHashWarning {
  readonly code: "content-hash-mismatch";
  readonly paths: readonly string[];
  readonly message: string;
}

export interface LoadLegacyV1Options<S> {
  readonly schemaVersion: number;
  readonly contentHashes: ContentHashes;
  /**
   * Rebuilds and validates all derived state. A thrown validation error aborts the load rather
   * than allowing the campaign's shared memory to be accepted on a best-effort basis.
   */
  readonly replay: (facts: readonly Fact[], seedState: SeedState) => S;
}

export interface LoadedSave<S> {
  readonly save: LegacySaveV1;
  readonly state: S;
  readonly warnings: readonly ContentHashWarning[];
}

export function schemaVersionMismatchMessage(saved: number, supported: number): string {
  return `Cannot load save schema version ${saved}. This build supports schema version ${supported}.`;
}

/** Export is deliberately one JSON blob so the same artifact can be saved or sent asynchronously. */
export function exportLegacyV1Save(save: LegacySaveV1): string {
  return JSON.stringify(save);
}

/**
 * Parses a save, enforces the reducer schema boundary, then always replays it. A content change
 * is visible to the caller but does not skip validation under the current content.
 */
export function loadLegacyV1Save<S>(serialized: string, options: LoadLegacyV1Options<S>): LoadedSave<S> {
  const save = parseSave(serialized);

  if (save.schemaVersion !== options.schemaVersion) {
    throw new Error(schemaVersionMismatchMessage(save.schemaVersion, options.schemaVersion));
  }

  const mismatchedPaths = contentHashMismatches(save.contentHashes, options.contentHashes);
  const state = options.replay(save.facts, save.seedState);
  const warnings: readonly ContentHashWarning[] =
    mismatchedPaths.length === 0
      ? []
      : [
          {
            code: "content-hash-mismatch",
            paths: mismatchedPaths,
            message:
              "Content changed since this campaign was saved. Replay validation used the current content.",
          },
        ];

  return { save, state, warnings };
}

export * from "./secure.js";

function parseSave(serialized: string): LegacySaveV1 {
  let value: unknown;
  try {
    value = JSON.parse(serialized);
  } catch (error) {
    throw new Error("Cannot load save because it is not valid JSON.", { cause: error });
  }

  if (!isRecord(value)) {
    throw invalidSave();
  }

  if (!Number.isInteger(value.schemaVersion)) {
    throw invalidSave();
  }
  if (!isJsonRecord(value.seedState)) {
    throw invalidSave();
  }
  if (!Array.isArray(value.facts)) {
    throw invalidSave();
  }
  if (!isStringRecord(value.contentHashes)) {
    throw invalidSave();
  }

  return value as unknown as LegacySaveV1;
}

function contentHashMismatches(saved: ContentHashes, current: ContentHashes): readonly string[] {
  const paths = new Set([...Object.keys(saved), ...Object.keys(current)]);
  return [...paths].filter((path) => saved[path] !== current[path]).sort();
}

function invalidSave(): Error {
  return new Error(
    "Cannot load save because it must contain schemaVersion, seedState, facts, and contentHashes.",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}

function isJsonRecord(value: unknown): value is Record<string, JsonValue> {
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return isRecord(value) && Object.values(value).every(isJsonValue);
}
