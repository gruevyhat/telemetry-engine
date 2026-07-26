import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Ship, TravelModel } from "../../engine/src/plugin-api/index.js";
import { travellerTravel } from "./travel.js";

/**
 * [M3-06] Lead-authored acceptance tests. The worker implements `./travel.ts` and does not modify
 * this file.
 *
 * `travellerTravel` is a `TravelModel`. Its distance function delegates to M3-01's hex distance.
 * Fuel cost follows the formula already used by M3-03's conforming contract stub:
 *
 *     ceil(ship.fuelCapacity × 0.1) × parsecs
 *
 * This is intentionally a small travel model, not a ship-design system. Validation checks
 * unknown distance first, range second, and available fuel third. That ordering makes an
 * out-of-range jump report its primary problem even when the tank is also low.
 */

const model: TravelModel = travellerTravel;
const ship: Ship = { jumpRating: 2, fuelCapacity: 40, currentFuel: 40 };

describe("travellerTravel", () => {
  it("accepts a jump exactly at the rating and rejects rating plus one", () => {
    expect(model.distance("0101", "0103")).toBe(2);
    expect(model.validateJump(ship, "0101", "0103")).toEqual({
      outcome: "ok",
      parsecs: 2,
      fuelRequired: 8,
    });

    expect(model.validateJump({ ...ship, jumpRating: 1 }, "0101", "0103")).toEqual({
      outcome: "out-of-range",
      parsecs: 2,
      jumpRating: 1,
    });
  });

  it("distinguishes insufficient fuel from an out-of-range jump", () => {
    expect(model.validateJump({ ...ship, currentFuel: 7 }, "0101", "0103")).toEqual({
      outcome: "insufficient-fuel",
      parsecs: 2,
      fuelRequired: 8,
      fuelAvailable: 7,
    });

    expect(model.validateJump({ ...ship, jumpRating: 1, currentFuel: 0 }, "0101", "0103")).toEqual({
      outcome: "out-of-range",
      parsecs: 2,
      jumpRating: 1,
    });
  });

  it("returns unknown-distance for an endpoint whose distance cannot be determined", () => {
    expect(model.distance("0101", "outside")).toBe("unknown");
    expect(model.validateJump(ship, "0101", "outside")).toEqual({ outcome: "unknown-distance" });
    expect(() => model.validateJump(ship, "outside", "0101")).not.toThrow();
  });

  it("uses ten percent of fuel capacity per parsec, rounded up once per parsec", () => {
    expect(model.fuelCost(ship, 0)).toBe(0);
    expect(model.fuelCost(ship, 1)).toBe(4);
    expect(model.fuelCost(ship, 2)).toBe(8);
    expect(model.fuelCost({ ...ship, fuelCapacity: 41 }, 2)).toBe(10);
  });

  it("has a monotonic non-decreasing fuel cost and zero cost at zero parsecs", () => {
    fc.assert(
      fc.property(
        fc.record({
          jumpRating: fc.integer({ min: 0, max: 12 }),
          fuelCapacity: fc.integer({ min: 0, max: 1_000 }),
          currentFuel: fc.integer({ min: 0, max: 1_000 }),
        }),
        fc.integer({ min: 0, max: 12 }),
        fc.integer({ min: 0, max: 12 }),
        (generatedShip, a, b) => {
          const lower = Math.min(a, b);
          const upper = Math.max(a, b);
          expect(model.fuelCost(generatedShip, 0)).toBe(0);
          expect(model.fuelCost(generatedShip, lower)).toBeLessThanOrEqual(model.fuelCost(generatedShip, upper));
        },
      ),
    );
  });

  it("expresses seven days of staleness per parsec as one week per parsec", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 32 }), (parsecs) => {
        expect(model.stalenessWeeks(parsecs)).toBe(parsecs);
      }),
    );
  });

  it("is pure and does not mutate the ship", () => {
    const frozen = Object.freeze({ ...ship });
    const before = JSON.stringify(frozen);

    const first = model.validateJump(frozen, "0101", "0103");
    const second = model.validateJump(frozen, "0101", "0103");

    expect(second).toEqual(first);
    expect(JSON.stringify(frozen)).toBe(before);
  });
});
