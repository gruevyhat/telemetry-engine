type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
type JsonObject = { readonly [key: string]: JsonValue };

export type ImportedCrewMember = {
  readonly crewMemberId: string;
  readonly name: string;
  readonly career: string | undefined;
  readonly sourceHash: string;
  readonly attributes: Readonly<Record<string, number>>;
  readonly skills: Readonly<Record<string, number>>;
};

export type CharacterImportError = {
  readonly code: "invalid-character";
  readonly field: string;
};

export type ImportedCharacter = {
  readonly crewMember: ImportedCrewMember;
  readonly source: JsonObject;
};

export type CharacterImportResult =
  | { readonly ok: true; readonly value: ImportedCharacter }
  | { readonly ok: false; readonly error: CharacterImportError };

const REQUIRED_CHARACTERISTICS = ["str", "dex", "end_stat", "int_stat", "edu", "soc"] as const;
const OPTIONAL_CHARACTERISTICS = ["chr", "mor", "lck"] as const;

function invalid(field: string): CharacterImportResult {
  return { ok: false, error: { code: "invalid-character", field } };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneJson(value: unknown, ancestors: Set<object>): JsonValue | undefined {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== "object" || ancestors.has(value)) {
    return undefined;
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const copy: JsonValue[] = [];
      for (const entry of value) {
        const cloned = cloneJson(entry, ancestors);
        if (cloned === undefined) return undefined;
        copy.push(cloned);
      }
      return copy;
    }
    if (!isPlainObject(value)) return undefined;

    const copy: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      const cloned = cloneJson(entry, ancestors);
      if (cloned === undefined) return undefined;
      copy[key] = cloned;
    }
    return copy;
  } finally {
    ancestors.delete(value);
  }
}

function freezeJson(value: JsonValue): JsonValue {
  if (typeof value !== "object" || value === null) return value;
  for (const child of Object.values(value)) freezeJson(child);
  return Object.freeze(value);
}

function canonicalize(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Readonly<Record<string, JsonValue>>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key] as JsonValue)}`)
    .join(",")}}`;
}

function stableHash(value: JsonValue): string {
  const text = canonicalize(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }

  return [first, second]
    .map((part) => (part >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function characteristicModifier(value: number): number {
  if (value <= 0) return -3;
  if (value <= 2) return -2;
  if (value <= 5) return -1;
  if (value <= 8) return 0;
  if (value <= 11) return 1;
  if (value <= 14) return 2;
  return 3;
}

export function importCharacter(raw: unknown): CharacterImportResult {
  if (!isPlainObject(raw)) return invalid("character");
  if (typeof raw.name !== "string" || raw.name.trim() === "") return invalid("name");

  const attributes: Record<string, number> = {};
  for (const field of REQUIRED_CHARACTERISTICS) {
    if (!validNumber(raw[field])) return invalid(field);
    attributes[field] = raw[field];
  }
  for (const field of OPTIONAL_CHARACTERISTICS) {
    const value = raw[field];
    if (value === undefined || value === null) continue;
    if (!validNumber(value)) return invalid(field);
    attributes[field] = value;
  }

  const skills: Record<string, number> = {};
  if (raw.skills !== undefined) {
    if (!Array.isArray(raw.skills)) return invalid("skills");
    for (const [index, skill] of raw.skills.entries()) {
      if (!isPlainObject(skill) || typeof skill.name !== "string") {
        return invalid(`skills[${index}].name`);
      }
      if (!validNumber(skill.level)) return invalid(`skills[${index}].level`);
      skills[skill.name] = skill.level;
    }
  }

  if (raw.career !== undefined && raw.career !== null && typeof raw.career !== "string") {
    return invalid("career");
  }

  const source = cloneJson(raw, new Set());
  if (source === undefined || !isPlainObject(source)) return invalid("character");
  const frozenSource = freezeJson(source) as JsonObject;
  const sourceHash = `travtools-json:${stableHash(frozenSource)}`;

  return {
    ok: true,
    value: {
      crewMember: {
        crewMemberId: `crew:${sourceHash}`,
        name: raw.name,
        career: typeof raw.career === "string" ? raw.career : undefined,
        sourceHash,
        attributes,
        skills,
      },
      source: frozenSource,
    },
  };
}

export function exportCharacter(imported: ImportedCharacter): JsonObject {
  return cloneJson(imported.source, new Set()) as JsonObject;
}
