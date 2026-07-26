import { describe, expect, it } from "vitest";
import { GENERIC_DECK, TRADE_DECK, runCampaign, runSocialCampaign } from "./campaign.js";

describe("runCampaign [Spec §8.3/§17, §21.3 M1 acceptance: \"solo trade campaign completes 4 turns headless\", M1-12]", () => {
  it("completes a 4-turn campaign against the real trade+generic decks without throwing", () => {
    const result = runCampaign("sim-seed-1", 4);
    expect(result.events).toHaveLength(4);
    expect(result.events.every((e) => e.turn >= 1 && e.turn <= 4)).toBe(true);
  });

  it("every turn resolves to either a fired incident or a degradation-ladder outcome, never neither", () => {
    const result = runCampaign("sim-seed-2", 4);
    for (const event of result.events) {
      expect(["incident", "degraded"]).toContain(event.kind);
    }
  });

  it("is deterministic for a given seed (replay)", () => {
    const first = runCampaign("sim-seed-replay", 4);
    const second = runCampaign("sim-seed-replay", 4);
    expect(second).toEqual(first);
  });

  it("never throws even for a long run (12 turns) with real content's cooldowns exhausting the pool", () => {
    expect(() => runCampaign("sim-seed-long", 12)).not.toThrow();
  });

  it("real decks load and are non-empty", () => {
    expect(TRADE_DECK.length).toBeGreaterThan(0);
    expect(GENERIC_DECK.length).toBeGreaterThan(0);
  });
});

describe("M2 social stress campaigns", () => {
  it.each(["L3", "L5"] as const)("%s completes deterministically", (lineup) => {
    const first = runSocialCampaign("social-replay", 8, lineup);
    expect(first.events).toHaveLength(8);
    expect(runSocialCampaign("social-replay", 8, lineup)).toEqual(first);
  });
});
