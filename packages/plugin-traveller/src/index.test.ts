import { describe, expect, it } from "vitest";
import { distance } from "./hex.js";
import { importCharacter } from "./character.js";
import { careerEdges } from "./edges.js";
import { check } from "./dice.js";
import { persona } from "./persona.js";
import { travellerPlugin } from "./index.js";

/**
 * M3-11 acceptance tests — lead-authored and lead-implemented (frontier work). Everything that
 * doesn't need the engine's `Plugin` type in scope lives here; `tests/integration/
 * m3-plugin-assembly.test.ts` covers `Plugin` conformance plus the M3-09 commit seam.
 */

describe("travellerPlugin assembly [M3-11, Spec §15]", () => {
  it("has the expected id and re-exports the already-tested careerEdges/persona/dice objects unchanged", () => {
    expect(travellerPlugin.id).toBe("traveller");
    expect(travellerPlugin.careerEdges).toBe(careerEdges);
    expect(travellerPlugin.persona).toBe(persona);
    expect(travellerPlugin.dice.check).toBe(check);
  });

  it("importCharacter is the same function M3-07 exports directly — assembly adds no behavior", () => {
    expect(travellerPlugin.importCharacter).toBe(importCharacter);
  });

  it("travel.distance matches M3-01's hex.ts directly: real parsecs for well-formed hexes, 'unknown' for an unparseable one", () => {
    expect(travellerPlugin.travel.distance("0101", "0202")).toBe(distance("0101", "0202"));
    expect(travellerPlugin.travel.distance("not-a-hex", "0202")).toBe("unknown");
  });

  it("stalenessWeeks matches Spec §7.2: one week of staleness per parsec", () => {
    expect(travellerPlugin.travel.stalenessWeeks(3)).toBe(3);
    expect(travellerPlugin.travel.stalenessWeeks(0)).toBe(0);
  });

  it("characterSchema declares the required/optional characteristics and a non-empty skill/career list", () => {
    const ids = travellerPlugin.characterSchema.attributes.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining(["str", "dex", "end_stat", "int_stat", "edu", "soc"]));
    expect(travellerPlugin.characterSchema.skillIds.length).toBeGreaterThan(0);
    expect(travellerPlugin.characterSchema.careerIds).toContain("Merchant");
  });

  it("economy declares a currency and at least one original (non-rulebook) good", () => {
    expect(travellerPlugin.economy.currency).toBe("credits");
    expect(travellerPlugin.economy.goods.length).toBeGreaterThan(0);
  });
});

describe("dice.check [M3-11, Spec §6, standard 2d6 convention]", () => {
  const CASES: Array<{ rawRoll: number; dm: number; difficulty: number; expected: Omit<ReturnType<typeof check>, "total" | "effect"> & { total: number; effect: number } }> = [
    { rawRoll: 7, dm: 2, difficulty: 8, expected: { total: 9, effect: 1, outcome: "success", critical: undefined } },
    { rawRoll: 5, dm: 0, difficulty: 8, expected: { total: 5, effect: -3, outcome: "failure", critical: undefined } },
    { rawRoll: 8, dm: 0, difficulty: 8, expected: { total: 8, effect: 0, outcome: "success", critical: undefined } },
    // Natural 12: automatic success even against a difficulty the modified total wouldn't clear.
    { rawRoll: 12, dm: -5, difficulty: 15, expected: { total: 7, effect: -8, outcome: "success", critical: "success" } },
    // Natural 2: automatic failure even against a trivial difficulty.
    { rawRoll: 2, dm: 10, difficulty: 2, expected: { total: 12, effect: 10, outcome: "failure", critical: "failure" } },
  ];

  it.each(CASES)("rawRoll=$rawRoll dm=$dm difficulty=$difficulty", ({ rawRoll, dm, difficulty, expected }) => {
    expect(check({ skill: "Broker", rawRoll, dm, difficulty })).toEqual(expected);
  });
});

describe("persona/lexicon [M3-11, docs/design/maggie-voice.md]", () => {
  // Mechanical TTS-safety only (pnpm lint:content does not scan .ts strings — see M3-11's
  // acceptance-criteria note); tone/diction against maggie-voice.md is a manual review item.
  const UNSAFE = /!|…|\.\.\.|<[^>]+>|[*_#`]/;
  const BANNED = /\b(unfortunately|sadly|amazing|just)\b/i;

  it("every lexicon phrase is TTS-safe and free of banned MAGGIE diction", () => {
    for (const [key, phrase] of Object.entries(persona.lexicon)) {
      expect(phrase, `lexicon.${key}`).not.toMatch(UNSAFE);
      expect(phrase, `lexicon.${key}`).not.toMatch(BANNED);
    }
  });
});
