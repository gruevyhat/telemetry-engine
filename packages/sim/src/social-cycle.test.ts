import { describe, expect, it } from "vitest";
import { socialMetrics } from "./metrics.js";
import { runSocialCycle } from "./social-cycle.js";

const LINEUPS_UNDER_TEST = ["L2", "L3", "L5"] as const;
const SEEDS_PER_LINEUP = 12;

describe("integrated social cycle [M2-15b, INV-3/5/8/10]", () => {
  for (const lineup of LINEUPS_UNDER_TEST) {
    it(`${lineup} completes deal -> comms -> incident -> confrontation -> black-box for every seed without unique twin attribution or a failed draw`, async () => {
      const samples = [];
      for (let i = 0; i < SEEDS_PER_LINEUP; i += 1) {
        const result = await runSocialCycle(`social-cycle-${lineup}-${i}`, lineup);
        expect(result.worldsSize).toBeGreaterThanOrEqual(2);
        expect(result.verification.seed).toEqual({ ok: true });
        expect(result.verification.failedCount).toBe(0);
        if (result.sample) samples.push(result.sample);
      }

      const metrics = socialMetrics(samples);
      for (const value of Object.values(metrics)) {
        expect(Number.isFinite(value)).toBe(true);
      }
    });
  }
});
