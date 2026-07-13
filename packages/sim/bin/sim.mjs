import { execFileSync } from "node:child_process";

const campaignsFlagIndex = process.argv.indexOf("--campaigns");
const campaigns = campaignsFlagIndex === -1 ? 50 : Number(process.argv[campaignsFlagIndex + 1]);

/**
 * [Spec §21.1 "Simulation | ... | packages/sim | nightly + release", M1-12 "Done when: headless
 * runner"] Runs L1/L2/L4 for `campaigns` seeded runs each via vitest (the same tool every other
 * test level in this repo uses, and the only one already wired to compile packages/sim's TS and
 * resolve its relative imports into packages/engine/src without a bespoke build step) and writes
 * packages/sim/out/metrics.json. `pnpm sim:smoke` / `pnpm sim:full` set --campaigns 50 / 1000;
 * `pnpm test`'s ordinary run of this same file (packages/sim/src/cli.test.ts) uses a small
 * built-in default so the PR-gating suite stays fast.
 */
console.log(`sim: running L1/L2/L4 for ${campaigns} campaigns each (Spec §21.4 metrics) -- see packages/sim/out/metrics.json`);
execFileSync("npx", ["vitest", "run", "packages/sim/src/cli.test.ts"], {
  stdio: "inherit",
  env: { ...process.env, SIM_CAMPAIGNS: String(campaigns) },
});
