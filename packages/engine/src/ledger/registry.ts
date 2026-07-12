import { assertNoSplitVisibility, validatePayload, type PayloadSchema, type ValidationResult } from "./schema.js";

export type DefaultVisibilityLevel = "public" | "table" | "referee";

export interface KindDefinition {
  kind: string;
  defaultVisibility: DefaultVisibilityLevel;
  payload: PayloadSchema;
  /** Each group: exactly one field in the group must be present (e.g. presence.declared's station|hex). */
  exactlyOneOf?: readonly (readonly string[])[];
}

export interface KindRegistry {
  has(kind: string): boolean;
  get(kind: string): KindDefinition | undefined;
  validate(kind: string, payload: Record<string, unknown>): ValidationResult;
}

export function createKindRegistry(definitions: readonly KindDefinition[]): KindRegistry {
  const byKind = new Map<string, KindDefinition>();
  for (const def of definitions) {
    assertNoSplitVisibility(def.payload);
    if (byKind.has(def.kind)) {
      throw new Error(`duplicate kind registration: "${def.kind}"`);
    }
    byKind.set(def.kind, def);
  }

  return {
    has(kind) {
      return byKind.has(kind);
    },
    get(kind) {
      return byKind.get(kind);
    },
    validate(kind, payload) {
      const def = byKind.get(kind);
      if (!def) {
        return { ok: false, errors: [`unregistered kind "${kind}"`] };
      }
      return validatePayload(def.payload, payload, def.exactlyOneOf);
    },
  };
}
