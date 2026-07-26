import { describe, expect, it } from "vitest";
import type {
  AttributeDef,
  CharacterSchema,
  CrewMember,
  Distance,
  EdgeDef,
  JumpValidation,
  Ship,
  TravelModel,
} from "./index.js";

/**
 * [M3-03] The contract test for the plugin API. Most of it is type-level: these assertions are
 * enforced by `pnpm typecheck`, which does see this file — `packages/engine/tsconfig.json` has
 * `include: ["src"]` and tests live under `src`. A `@ts-expect-error` on a line that compiles
 * cleanly is itself a tsc error, so the negative cases cannot rot into silence.
 *
 * Not tested here: "no engine module imports the Traveller plugin." That guard is `scripts/build-stub.mjs`,
 * which walks `packages/engine/src` recursively for that package name as a raw string, so it covers these new files with
 * no change. A vitest re-implementation would be a second, weaker copy of a passing check.
 */

const chartedShip: Ship = { jumpRating: 2, fuelCapacity: 40, currentFuel: 40 };

/** A conforming implementation, as the Traveller plugin will supply in M3-01/02/06. */
const stubTravel: TravelModel = {
  distance: (from, to) => (from === "unloaded" || to === "unloaded" ? "unknown" : 2),
  validateJump: (ship, from, to) => {
    const parsecs = stubTravel.distance(from, to);
    if (parsecs === "unknown") return { outcome: "unknown-distance" };
    if (parsecs > ship.jumpRating) return { outcome: "out-of-range", parsecs, jumpRating: ship.jumpRating };
    const fuelRequired = stubTravel.fuelCost(ship, parsecs);
    if (fuelRequired > ship.currentFuel) {
      return { outcome: "insufficient-fuel", parsecs, fuelRequired, fuelAvailable: ship.currentFuel };
    }
    return { outcome: "ok", parsecs, fuelRequired };
  },
  fuelCost: (ship, parsecs) => Math.ceil(ship.fuelCapacity * 0.1) * parsecs,
  stalenessWeeks: (parsecs) => parsecs,
};

const stubSchema: CharacterSchema = {
  attributes: [{ id: "grit", label: "Grit", min: 1, max: 15 }],
  skillIds: ["broker", "pilot"],
  careerIds: ["merchant", "scout"],
};

describe("TravelModel", () => {
  it("accepts a conforming implementation", () => {
    expect(stubTravel.distance("0101", "0103")).toBe(2);
  });

  it("returns 'unknown' rather than a number when data is not loaded", () => {
    const result: Distance = stubTravel.distance("0101", "unloaded");
    expect(result).toBe("unknown");
  });

  it("types distance as number | 'unknown', so trust mode is representable in the type system", () => {
    // @ts-expect-error — a caller cannot treat the result as a bare number; the 'unknown' arm
    // must be handled. This is what stops a remote world's current price being shown as fact.
    const parsecs: number = stubTravel.distance("0101", "0103");
    expect(parsecs).toBe(2);
  });

  it("reports unknown distance as its own outcome, never as a refusal", () => {
    const validation = stubTravel.validateJump(chartedShip, "0101", "unloaded");
    expect(validation.outcome).toBe("unknown-distance");
  });

  it("narrows JumpValidation exhaustively", () => {
    const describeOutcome = (v: JumpValidation): string => {
      switch (v.outcome) {
        case "ok":
          return `ok:${v.fuelRequired}`;
        case "out-of-range":
          return `range:${v.jumpRating}`;
        case "insufficient-fuel":
          return `fuel:${v.fuelAvailable}`;
        case "unknown-distance":
          return "unknown";
        default: {
          const exhaustive: never = v;
          return exhaustive;
        }
      }
    };
    expect(describeOutcome(stubTravel.validateJump(chartedShip, "0101", "0103"))).toBe("ok:8");
    expect(describeOutcome(stubTravel.validateJump({ ...chartedShip, currentFuel: 1 }, "0101", "0103"))).toBe("fuel:1");
    expect(describeOutcome(stubTravel.validateJump({ ...chartedShip, jumpRating: 1 }, "0101", "0103"))).toBe("range:1");
  });

  it("rejects a non-conforming implementation", () => {
    // @ts-expect-error — validateJump returning a boolean is the collapse this union forbids.
    const boolish: TravelModel = { ...stubTravel, validateJump: (): boolean => true };
    expect(boolish.stalenessWeeks(1)).toBe(1);

    // Note the asymmetry, since it is easy to expect a guard here and be wrong: an implementation
    // whose `distance` returns only `number` is *legitimately* assignable — return types are
    // covariant, and a plugin that always knows the distance is a valid plugin. The 'unknown' arm
    // is enforced at the call site, not the implementation site; that is the assertion above.
  });

  it("rejects a Ship carrying fields the engine has no business knowing", () => {
    // @ts-expect-error — Ship is minimal by decision (travel-and-import-v1 §1.3); cargo, scoops,
    // and armour belong to travtools, not here.
    const overspecified: Ship = { ...chartedShip, cargoTons: 80 };
    expect(overspecified.jumpRating).toBe(2);
  });
});

describe("CharacterSchema and CrewMember", () => {
  it("accepts a conforming schema", () => {
    expect(stubSchema.attributes.map((a: AttributeDef) => a.id)).toEqual(["grit"]);
  });

  it("holds a crew member with the fields crew.imported records", () => {
    const member: CrewMember = {
      crewMemberId: "cm-1",
      name: "Ilsa Renn",
      career: "merchant",
      sourceHash: "sha256:abc",
      attributes: { grit: 9 },
      skills: { broker: 2 },
    };
    expect(member.skills["broker"]).toBe(2);
    expect(member.skills["pilot"]).toBeUndefined();
  });

  it("requires career and sourceHash to be stated rather than omitted", () => {
    // @ts-expect-error — `career: undefined` must be written out. A character entered without a
    // career is a real case; a caller that forgot the field is not, and they read the same.
    const missing: CrewMember = {
      crewMemberId: "cm-2",
      name: "No Career",
      sourceHash: "sha256:def",
      attributes: {},
      skills: {},
    };
    expect(missing.name).toBe("No Career");
  });

  it("declares deferred career edges without offering them", () => {
    const edges: readonly EdgeDef[] = [
      { id: "merchant-reroll-broker", career: "merchant", label: "Reroll one Broker check", availability: "available", deferredUntil: undefined },
      { id: "scout-survey", career: "scout", label: "Recall a surveyed world", availability: "deferred", deferredUntil: "M4" },
    ];
    expect(edges.filter((e) => e.availability === "available").map((e) => e.career)).toEqual(["merchant"]);
  });
});
