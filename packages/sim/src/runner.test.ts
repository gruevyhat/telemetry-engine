import { describe, expect, it } from "vitest";
import { runLineups } from "./runner.js";

describe("runLineups [Spec §21.3 headless lineup campaigns]", () => {
  it("L1/L2/L4 each complete 4-turn campaigns headless without throwing", () => {
    const exported = runLineups(["L1", "L2", "L4"], 3, 4, "runner-test");
    expect(exported).toHaveLength(3);
    expect(exported.map((e) => e.lineup)).toEqual(["L1", "L2", "L4"]);
    for (const lineup of exported) {
      expect(lineup.campaigns).toBe(3);
      expect(lineup.turnsPerCampaign).toBe(4);
      expect(lineup.degradationRate).toBeGreaterThanOrEqual(0);
      expect(lineup.recurrenceRate).toBeGreaterThanOrEqual(0);
    }
  });

  it("is deterministic for a given seed prefix", () => {
    const first = runLineups(["L1"], 2, 4, "replay-seed");
    const second = runLineups(["L1"], 2, 4, "replay-seed");
    expect(second).toEqual(first);
  });

  it("rejects an unknown lineup name rather than silently seating nothing", () => {
    expect(() => runLineups(["L6" as never], 1, 4, "seed")).toThrow(/unknown lineup/);
  });
});
