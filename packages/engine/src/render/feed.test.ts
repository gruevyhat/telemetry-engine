import { describe, expect, it } from "vitest";
import { feedLine, renderFeed } from "./feed.js";
import type { Fact } from "../ledger/types.js";
import type { GoodDef } from "../plugin-api/index.js";

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

describe("feedLine [Spec §7.2, §14, M1-02]", () => {
  it("renders the 0-week (local) band", () => {
    expect(feedLine({ hex: "Regina", good: "machine parts", price: 410, distanceParsecs: 0 })).toBe(
      "machine parts at Regina: Cr410. Current price. You are standing in this market.",
    );
  });

  it("renders the 1-week band with singular 'week'", () => {
    expect(feedLine({ hex: "Vantage", good: "ore", price: 188, distanceParsecs: 1 })).toBe(
      "ore at Vantage: Cr188, 1 week stale. That was the price 1 week ago, not today.",
    );
  });

  it("renders the 4-week band with plural 'weeks'", () => {
    expect(feedLine({ hex: "Far Reach", good: "ore", price: 175, distanceParsecs: 4 })).toBe(
      "ore at Far Reach: Cr175, 4 weeks stale. That was the price 4 weeks ago, not today.",
    );
  });

  it("renders 'unknown' distance in trust-mode phrasing (Spec §15: no data loaded -> trust mode)", () => {
    const line = feedLine({ hex: "Far Reach", good: "ore", price: 175, distanceParsecs: "unknown" });
    expect(line).toBe("ore at Far Reach: Cr175, by the crew's count. Distance from here isn't in my charts. I verify arithmetic; I do not verify distance.");
  });
});

describe("renderFeed [hooks marketAt/feedAnswer into a line per good]", () => {
  const GOODS: readonly GoodDef[] = [{ id: "machine-parts", basePrice: 100 }, { id: "ore", basePrice: 50 }];

  it("renders one line per good present in the feed answer, in the goods list's order", () => {
    const facts = [tickFact("Vantage", "machine-parts", 410, 0), tickFact("Vantage", "ore", 188, 0)];
    const lines = renderFeed(facts, "Vantage", 14, 0, GOODS);
    expect(lines).toEqual([
      "machine-parts at Vantage: Cr410. Current price. You are standing in this market.",
      "ore at Vantage: Cr188. Current price. You are standing in this market.",
    ]);
  });

  it("omits a good with no tick history yet rather than claiming a price that doesn't exist", () => {
    const facts = [tickFact("Vantage", "machine-parts", 410, 0)];
    const lines = renderFeed(facts, "Vantage", 14, 0, GOODS);
    expect(lines).toEqual(["machine-parts at Vantage: Cr410. Current price. You are standing in this market."]);
  });
});
