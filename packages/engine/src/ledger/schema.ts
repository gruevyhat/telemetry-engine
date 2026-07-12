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

export function validatePayload(schema: PayloadSchema, payload: Record<string, unknown>): ValidationResult {
  const errors: string[] = [];

  for (const [field, fieldSchema] of Object.entries(schema)) {
    const value = payload[field];
    if (value === undefined) {
      if (!fieldSchema.optional) {
        errors.push(`missing required field "${field}"`);
      }
      continue;
    }
    if (!matchesType(fieldSchema.type, value)) {
      errors.push(`field "${field}" expected ${fieldSchema.type}, got ${typeof value}`);
    }
  }

  for (const field of Object.keys(payload)) {
    if (!(field in schema)) {
      errors.push(`unexpected field "${field}" (payloads are exact, Spec §2 fact-kinds-v0)`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * [fact-kinds-v0.md §3] Split-visibility payloads are forbidden — a payload field may never
 * carry its own visibility. FieldSchema's type has no visibility key, so this only fires when
 * a schema is constructed from untyped data (e.g. future content-loaded catalogs).
 */
export function assertNoSplitVisibility(schema: PayloadSchema): void {
  for (const [field, fieldSchema] of Object.entries(schema)) {
    if ("visibility" in (fieldSchema as unknown as Record<string, unknown>)) {
      throw new Error(
        `payload field "${field}" declares its own visibility; split-visibility payloads are forbidden ` +
          `(fact-kinds-v0.md §3) — emit two facts linked by causes instead.`,
      );
    }
  }
}
