import { describe, expect, it } from "vitest";
import type { Fact } from "../ledger/types.js";
import type { GoodDef } from "../plugin-api/index.js";
import { resolveInformationHorizon } from "./horizon.js";
import { renderFeed } from "../render/feed.js";

/**
 * [M3-05] Lead-authored acceptance tests. The implementation may not modify this file.
 *
 * `resolveInformationHorizon(travel, from, to, crewCount?)` returns the render-layer state:
 *
 * - known model distance -> `{ state: "charted", distanceParsecs }`
 * - unknown model distance plus a crew count -> `{ state: "trusted", distanceParsecs }`
 * - unknown model distance and no count -> `{ state: "uncounted" }`
 *
 * `renderFeed` accepts that state. It uses the same historical lookup for charted and trusted
 * distances, and returns no line at all for uncounted. It never parses rendered text back into
 * state or facts.
 */

const GOODS: readonly GoodDef[] = [{ id: "ore", basePrice: 100 }];

function tickFact(price: number, week: number): Fact {
  return {
    id: `tick-${week}`,
    t: { day: week * 7, slot: "DOCKSIDE" },
    wall: 0,
    kind: "market.tick",
    actor: { kind: "world", id: "market" },
    payload: { hex: "0202", good: "ore", price, week },
    visibility: { level: "referee" },
  };
}

const facts = [tickFact(100, 0), tickFact(200, 2), tickFact(400, 4)];

describe("information horizon [INV-9]", () => {
  it("uses a crew-supplied count for the historical lookup and labels it as unverified", () => {
    const horizon = resolveInformationHorizon({ distance: () => "unknown" }, "0101", "0202", 2);
    expect(horizon).toEqual({ state: "trusted", distanceParsecs: 2 });

    expect(renderFeed(facts, "0202", 28, horizon, GOODS)).toEqual([
      "ore at 0202: Cr200, 2 weeks stale, by the crew's count. Distance from here isn't in my charts. I verify arithmetic; I do not verify distance.",
    ]);
  });

  it("omits every price when neither charts nor a crew count can date it", () => {
    const horizon = resolveInformationHorizon({ distance: () => "unknown" }, "0101", "0202");
    expect(horizon).toEqual({ state: "uncounted" });
    expect(renderFeed(facts, "0202", 28, horizon, GOODS)).toEqual([]);
  });

  it("uses a charted distance without asking for a crew count", () => {
    const horizon = resolveInformationHorizon({ distance: () => 2 }, "0101", "0202", 9);
    expect(horizon).toEqual({ state: "charted", distanceParsecs: 2 });
    expect(renderFeed(facts, "0202", 28, horizon, GOODS)).toEqual([
      "ore at 0202: Cr200, 2 weeks stale. That was the price 2 weeks ago, not today.",
    ]);
  });

  it("does not retroactively mutate a line rendered under an earlier chart", () => {
    const earlierHorizon = resolveInformationHorizon({ distance: () => 2 }, "0101", "0202");
    const historicalLine = renderFeed(facts, "0202", 28, earlierHorizon, GOODS)[0];

    const replacementHorizon = resolveInformationHorizon({ distance: () => 0 }, "0101", "0202");
    const replacementLine = renderFeed(facts, "0202", 28, replacementHorizon, GOODS)[0];

    expect(historicalLine).toBe(
      "ore at 0202: Cr200, 2 weeks stale. That was the price 2 weeks ago, not today.",
    );
    expect(replacementLine).toBe(
      "ore at 0202: Cr400. Current price. You are standing in this market.",
    );
  });

  it("keeps trust-mode text plain and TTS-safe", () => {
    const line = renderFeed(
      facts,
      "0202",
      28,
      { state: "trusted", distanceParsecs: 2 },
      GOODS,
    )[0] as string;

    expect(line).not.toMatch(/[!…*_#]/);
    expect(line).not.toContain("unfortunately");
    expect(line).not.toContain("sorry");
  });
});
