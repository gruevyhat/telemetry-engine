export type FieldType = "string" | "number" | "boolean" | "array" | "object" | "unknown";

export interface FieldSchema {
  type: FieldType;
  optional?: boolean;
}

export type PayloadSchema = Record<string, FieldSchema>;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function matchesType(type: FieldType, value: unknown): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "unknown":
      return true;
  }
}

export function validatePayload(_schema: PayloadSchema, _payload: Record<string, unknown>): ValidationResult {
  return { ok: true, errors: [] };
}

/**
 * [fact-kinds-v0.md §3] Split-visibility payloads are forbidden — a payload field may never
 * carry its own visibility. FieldSchema's type has no visibility key, so this only fires when
 * a schema is constructed from untyped data (e.g. future content-loaded catalogs).
 */
export function assertNoSplitVisibility(_schema: PayloadSchema): void {
  // not yet implemented
}
