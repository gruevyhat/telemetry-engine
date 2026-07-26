import { runSocialCycle } from "./social-cycle.js";
import { socialMetrics, type SocialGroundTruthSample } from "./metrics.js";
import type { LineupName } from "./lineups.js";

export interface SocialLineupExport {
  readonly lineup: LineupName;
  readonly campaigns: number;
  readonly zeroUniqueAttribution: boolean;
  readonly allDrawsVerified: boolean;
  /** Count of campaigns that produced a ground-truth accusation sample. Currently always 0 for
   * every lineup -- see BL-07 -- so `metrics` below reads as "the accusation mechanism never
   * fired," not "measured and in band." Exported explicitly so that distinction is never lost to
   * `socialMetrics`' zero-denominator default of 0. */
  readonly accusationSamples: number;
  readonly metrics: ReturnType<typeof socialMetrics>;
}

/**
 * [M2-15b, Spec §21.4, INV-5/8/10] Runs `runSocialCycle` `campaignsPerLineup` times per named
 * social lineup (L2/L3/L5) and aggregates ground-truth samples into `socialMetrics`. Separate
 * from `runner.ts`'s `runLineups`: that pipeline still runs the placeholder trade-only campaign
 * loop for every lineup (see its own doc comment), while this one drives the real
 * agenda/comms/confrontation/black-box cycle M2-15b wired up, so mixing the two into one export
 * shape would conflate two different simulation loops under the same lineup name.
 */
export async function runSocialLineups(
  lineupNames: readonly LineupName[],
  campaignsPerLineup: number,
  seedPrefix: string,
): Promise<readonly SocialLineupExport[]> {
  const exported: SocialLineupExport[] = [];
  for (const lineup of lineupNames) {
    const samples: SocialGroundTruthSample[] = [];
    let zeroUniqueAttribution = true;
    let allDrawsVerified = true;
    for (let i = 0; i < campaignsPerLineup; i += 1) {
      const result = await runSocialCycle(`${seedPrefix}:${lineup}:${i}`, lineup);
      if (result.worldsSize < 2) zeroUniqueAttribution = false;
      if (!result.verification.seed.ok || result.verification.failedCount !== 0) allDrawsVerified = false;
      if (result.sample) samples.push(result.sample);
    }
    exported.push({
      lineup,
      campaigns: campaignsPerLineup,
      zeroUniqueAttribution,
      allDrawsVerified,
      accusationSamples: samples.length,
      metrics: socialMetrics(samples),
    });
  }
  return exported;
}
