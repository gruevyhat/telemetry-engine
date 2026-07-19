import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runLineups } from "./runner.js";
import { runSocialLineups } from "./social-runner.js";

const TURNS_PER_CAMPAIGN = 4;
const OUT_DIR = new URL("../out/", import.meta.url);
const OUT_FILE = new URL("metrics.json", OUT_DIR);
const SOCIAL_OUT_FILE = new URL("social-metrics.json", OUT_DIR);

/** [Spec §21.1 "Simulation | ... | nightly + release" vs. PR-level] Only stable at release
 * scale; a 3-sample default would flake on ordinary binomial variance. */
const STATISTICALLY_STABLE_CAMPAIGNS = 500;

/**
 * [Spec §21.1 "Simulation | 1,000-campaign headless runs, metric thresholds | packages/sim |
 * nightly + release", §20 local telemetry export, M1-12 "Done when: headless runner; ... metric
 * export JSON"] This is the same real `runLineups` call the unit-level `runner.test.ts` exercises
 * with a handful of campaigns -- what changes here is scale (env-configurable, so `pnpm sim:smoke`
 * / `pnpm sim:full` can ask for 50 / 1000 without slowing the default `pnpm test` gate, which runs
 * this file too at its small built-in default) and that it writes the metrics export to disk,
 * which is the actual CLI deliverable `bin/sim.mjs` shells out to.
 */
describe("sim CLI export [Spec §20/§21.1/§21.4, M1-12]", () => {
  it("runs L1/L2/L4 and writes a metrics export JSON file", () => {
    const campaignsPerLineup = Number(process.env["SIM_CAMPAIGNS"] ?? 3);
    const exported = runLineups(["L1", "L2", "L4"], campaignsPerLineup, TURNS_PER_CAMPAIGN, `sim-cli:${campaignsPerLineup}`);

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(OUT_FILE, JSON.stringify(exported, null, 2));

    const written = JSON.parse(readFileSync(OUT_FILE, "utf8"));
    expect(written).toHaveLength(3);
    expect(written.map((e: { lineup: string }) => e.lineup)).toEqual(["L1", "L2", "L4"]);
  });
});

/**
 * [M2-15b, task card "Done when: L2/L3/L5 sim runs complete within Spec §21.4's thresholds",
 * INV-5/8/10] Runs the real agenda/comms/confrontation/black-box cycle (`runSocialCycle`, not
 * the placeholder trade-only loop `runLineups` still uses) for the three social lineups and
 * writes its own metrics export. Every scale asserts the structural INV-5/8/10 guarantees
 * (no unique twin attribution, every draw verifies); the Spec's numeric misattribution-rate band
 * only gets asserted once the sample is large enough to be a stable statistic (`sim:full`'s
 * N=1000) rather than flaking on `pnpm test`'s fast N=3 default.
 */
describe("social sim CLI export [Spec §21.4, M2-15b]", () => {
  it("runs L2/L3/L5 social cycles, writes a metrics export, and holds the release-scale threshold band", async () => {
    const campaignsPerLineup = Number(process.env["SIM_CAMPAIGNS"] ?? 3);
    const exported = await runSocialLineups(["L2", "L3", "L5"], campaignsPerLineup, `sim-cli-social:${campaignsPerLineup}`);

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(SOCIAL_OUT_FILE, JSON.stringify(exported, null, 2));

    const written = JSON.parse(readFileSync(SOCIAL_OUT_FILE, "utf8"));
    expect(written).toHaveLength(3);
    expect(written.map((e: { lineup: string }) => e.lineup)).toEqual(["L2", "L3", "L5"]);
    for (const lineup of exported) {
      expect(lineup.zeroUniqueAttribution).toBe(true);
      expect(lineup.allDrawsVerified).toBe(true);
    }

    if (campaignsPerLineup >= STATISTICALLY_STABLE_CAMPAIGNS) {
      const l2 = exported.find((e) => e.lineup === "L2")!;
      expect(l2.metrics.misattributionRate).toBeGreaterThanOrEqual(0.25);
      expect(l2.metrics.misattributionRate).toBeLessThanOrEqual(0.40);
    }
  });
});
