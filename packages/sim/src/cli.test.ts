import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runLineups } from "./runner.js";

const TURNS_PER_CAMPAIGN = 4;
const OUT_DIR = new URL("../out/", import.meta.url);
const OUT_FILE = new URL("metrics.json", OUT_DIR);

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
