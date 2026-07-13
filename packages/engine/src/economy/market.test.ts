import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createRng } from "../rng/index.js";
import type { GoodDef } from "../plugin-api/index.js";
import type { GameTime } from "../time/index.js";
import type { Fact } from "../ledger/types.js";
import { feedAnswer, generateWeeklyTicks, marketAt, nextPrice } from "./market.js";

const REFEREE = { kind: "referee", id: "referee" } as const;
const GOODS: readonly GoodDef[] = [{ id: "machine-parts", basePrice: 100 }];

function tickFact(hex: string, good: string, price: number, week: number): Fact {
  return {
    id: `f-${hex}-${good}-${week}`,
    t: { day: week * 7, slot: "DOCKSIDE" },
    wall: 0,
    kind: "market.tick",
    actor: { kind: "world", id: "market" },
    payload: { hex, good, price, week },
    visibility: { level: "referee" },
  };
}

describe("nextPrice [Spec §7.1]", () => {
  it("shrinks the deviation from base each step when reversion is positive and drift/shock are zero", () => {
    // Spec §7.1's formula is next = base + reversion*(base - prior): an AR(1)-style mean
    // reversion that can overshoot to the opposite side of base, but always by a smaller
    // magnitude than the prior deviation (|next - base| = reversion * |prior - base|).
    const fromAbove = nextPrice(100, 200, 0, 0, 0.1);
    expect(Math.abs(fromAbove - 100)).toBeLessThan(Math.abs(200 - 100));

    const fromBelow = nextPrice(100, 50, 0, 0, 0.1);
    expect(Math.abs(fromBelow - 100)).toBeLessThan(Math.abs(50 - 100));
  });

  it("clamps to a positive floor instead of going to zero or negative under an extreme shock", () => {
    const price = nextPrice(100, 100, -1, -1, 0.1);
    expect(price).toBeGreaterThan(0);
  });
});

describe("generateWeeklyTicks [Spec §7.1, active bubble]", () => {
  const T: GameTime = { day: 14, slot: "DOCKSIDE" };

  it("generates a tick only for hexes in the active bubble, not for every hex with a prior price", () => {
    const rng = createRng("seed-1");
    const ticks = generateWeeklyTicks({
      t: T,
      rng,
      activeHexes: ["hexA"],
      goods: GOODS,
      priorPrices: { "hexA|machine-parts": 100, "hexB|machine-parts": 100 },
    });
    const hexes = new Set(ticks.map((tick) => tick.payload.hex));
    expect(hexes).toEqual(new Set(["hexA"]));
  });

  it("generates one tick per (active hex x plugin good) pair, driven by the passed-in goods list", () => {
    const rng = createRng("seed-2");
    const twoGoods: readonly GoodDef[] = [...GOODS, { id: "ore", basePrice: 50 }];
    const ticks = generateWeeklyTicks({
      t: T,
      rng,
      activeHexes: ["hexA", "hexB"],
      goods: twoGoods,
      priorPrices: {},
    });
    expect(ticks).toHaveLength(4);
    expect(new Set(ticks.map((tick) => tick.payload.good))).toEqual(new Set(["machine-parts", "ore"]));
  });

  it("applies a world.event fact's magnitude as an added shock for its (hex, good, week)", () => {
    const week = Math.floor(T.day / 7);
    const worldEvent: Fact = {
      id: "f-event",
      t: T,
      wall: 0,
      kind: "world.event",
      actor: REFEREE,
      payload: { hex: "hexA", good: "machine-parts", magnitude: 0.4, label: "war", week },
      visibility: { level: "public" },
    };

    const withoutShock = generateWeeklyTicks({
      t: T,
      rng: createRng("same-seed"),
      activeHexes: ["hexA"],
      goods: GOODS,
      priorPrices: { "hexA|machine-parts": 100 },
    });
    const withShock = generateWeeklyTicks({
      t: T,
      rng: createRng("same-seed"),
      activeHexes: ["hexA"],
      goods: GOODS,
      priorPrices: { "hexA|machine-parts": 100 },
      worldEvents: [worldEvent],
    });

    const basePrice = GOODS[0]!.basePrice;
    expect(withShock[0]!.payload.price).toBeCloseTo((withoutShock[0]!.payload.price as number) + basePrice * 0.4, 6);
  });
});

describe("marketAt / feedAnswer [Spec §7.2, INV-9]", () => {
  it("answers with the latest tick at or before the given day, not a later one", () => {
    const facts = [tickFact("hexA", "machine-parts", 100, 0), tickFact("hexA", "machine-parts", 110, 1), tickFact("hexA", "machine-parts", 120, 2)];
    expect(marketAt(facts, "hexA", 13)).toEqual({ "machine-parts": 110 });
  });

  it("INV-9: a remote feed answer for distance d equals the historical local answer, using only facts known as of that day", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 1, maxLength: 20 }),
        fc.nat({ max: 40 }),
        fc.nat({ max: 5 }),
        (prices, dayOffset, distanceParsecs) => {
          const facts = prices.map((price, week) => tickFact("hexA", "machine-parts", price, week));
          const day = 7 * prices.length + dayOffset;

          const historicalDay = day - 7 * distanceParsecs;
          const asOfWeek = Math.floor(historicalDay / 7);
          const knownAsOfThatDay = facts.filter((fact) => (fact.payload.week as number) <= asOfWeek);

          const remoteAnswer = feedAnswer(facts, "hexA", day, distanceParsecs);
          const historicalLocalAnswer = marketAt(knownAsOfThatDay, "hexA", historicalDay);

          expect(remoteAnswer).toEqual(historicalLocalAnswer);
        },
      ),
    );
  });
});
