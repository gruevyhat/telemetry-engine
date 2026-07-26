import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CrewMember } from "@telemetry/engine";
import {
  characteristicModifier,
  exportCharacter,
  importCharacter,
  type CharacterImportResult,
  type ImportedCharacter,
} from "./character.js";

/**
 * [M3-07] Lead-authored acceptance tests. The worker implements `./character.ts` and the
 * fictional JSON fixtures, and does not modify this file.
 *
 * ## Contract
 *
 * `importCharacter(raw)` returns a result union and never returns a partial crew member:
 *
 * - success: `{ ok: true, value: ImportedCharacter }`
 * - failure: `{ ok: false, error: { code: "invalid-character", field: string } }`
 *
 * `ImportedCharacter` contains the engine-facing `crewMember` and an immutable copy of the
 * source object used by `exportCharacter`. Keeping the source beside the projection is what makes
 * exact round-trip possible without adding plugin-specific fields to the engine's `CrewMember`.
 * `exportCharacter(imported)` returns a fresh JSON-compatible object deep-equal to the input.
 *
 * The source hash and crew-member id are deterministic for the same source payload; this packet
 * does not prescribe a hash algorithm. M3-08 relies on stable identity, not a particular digest.
 */

const fixtureUrls = [
  new URL("../fixtures/characters/fictional-merchant.json", import.meta.url),
  new URL("../fixtures/characters/fictional-scout.json", import.meta.url),
] as const;

const fixtures: readonly unknown[] = fixtureUrls.map((url) => JSON.parse(readFileSync(url, "utf8")));

const standardCharacteristics = {
  str: 7,
  dex: 8,
  end_stat: 6,
  int_stat: 9,
  edu: 10,
  soc: 5,
};

function expectSuccess(result: CharacterImportResult): ImportedCharacter {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`expected successful import, got ${result.error.field}`);
  return result.value;
}

describe("travtools character import", () => {
  it("round-trips every fictional fixture without losing or inventing fields", () => {
    for (const fixture of fixtures) {
      const imported = expectSuccess(importCharacter(fixture));
      expect(exportCharacter(imported)).toEqual(fixture);
      expect(exportCharacter(imported)).not.toBe(fixture);
    }
  });

  it("imports a minimal character with required characteristics and no optional fields", () => {
    const raw = { name: "Mara Venn", ...standardCharacteristics };
    const imported = expectSuccess(importCharacter(raw));

    const member: CrewMember = imported.crewMember;
    expect(member.name).toBe("Mara Venn");
    expect(member.career).toBeUndefined();
    expect(member.attributes).toEqual(standardCharacteristics);
    expect(member.skills).toEqual({});
    expect(member.sourceHash).not.toBe("");
    expect(member.crewMemberId).not.toBe("");
    expect(exportCharacter(imported)).toEqual(raw);
  });

  it("preserves unknown fields through round-trip", () => {
    const raw = {
      id: "fictional-extra-fields",
      name: "Kei Orison",
      ...standardCharacteristics,
      skills: [],
      future_extension: { issuer: "invented", flags: [true, false] },
    };

    const imported = expectSuccess(importCharacter(raw));
    expect(exportCharacter(imported)).toEqual(raw);
  });

  it("imports skills as-is without renaming, clamping, or reordering", () => {
    const raw = {
      name: "Tallis Grey",
      ...standardCharacteristics,
      skills: [
        { name: "Broker", level: -1 },
        { name: "Gun Combat (Slug)", level: 5 },
        { name: "Pilot", level: 0 },
      ],
    };

    const imported = expectSuccess(importCharacter(raw));
    expect(Object.entries(imported.crewMember.skills)).toEqual([
      ["Broker", -1],
      ["Gun Combat (Slug)", 5],
      ["Pilot", 0],
    ]);
    expect(exportCharacter(imported)).toEqual(raw);
  });

  it("derives characteristic modifiers from the standard 2d6 bands", () => {
    const cases = [
      [0, -3],
      [1, -2],
      [2, -2],
      [3, -1],
      [5, -1],
      [6, 0],
      [8, 0],
      [9, 1],
      [11, 1],
      [12, 2],
      [14, 2],
      [15, 3],
      [20, 3],
    ] as const;

    for (const [value, modifier] of cases) {
      expect(characteristicModifier(value)).toBe(modifier);
    }
  });

  it("names the offending field for malformed input and never returns a partial value", () => {
    const malformed = [
      [{ ...standardCharacteristics }, "name"],
      [{ name: "String Strength", ...standardCharacteristics, str: "7" }, "str"],
      [{ name: "Object Skills", ...standardCharacteristics, skills: {} }, "skills"],
    ] as const;

    for (const [raw, field] of malformed) {
      const result = importCharacter(raw);
      expect(result).toEqual({ ok: false, error: { code: "invalid-character", field } });
      expect("value" in result).toBe(false);
    }
  });

  it("is pure and derives stable identities from the same payload", () => {
    const raw = {
      id: "fictional-stable-id",
      name: "Sable Niko",
      ...standardCharacteristics,
      career: "merchant",
      skills: [{ name: "Broker", level: 2 }],
    };
    const before = JSON.stringify(raw);

    const first = expectSuccess(importCharacter(raw));
    const second = expectSuccess(importCharacter(raw));

    expect(second).toEqual(first);
    expect(second.crewMember.sourceHash).toBe(first.crewMember.sourceHash);
    expect(second.crewMember.crewMemberId).toBe(first.crewMember.crewMemberId);
    expect(JSON.stringify(raw)).toBe(before);
  });
});
