import type { CampaignEvent } from "./campaign.js";

/**
 * [Spec §21.4 "frame recurrence within 4 turns < 5%", §8.3] Fraction of fired incidents whose
 * frame already fired within the preceding `windowTurns` turns. Fed real `CampaignEvent[]` data
 * from `runCampaign` -- cooldowns should keep this near zero by construction, so this measures
 * whether a content deck's cooldownWeeks are actually doing their job over a full run.
 */
export function recurrenceRate(events: readonly CampaignEvent[], windowTurns = 4): number {
  const incidents = events.filter((e): e is Extract<CampaignEvent, { kind: "incident" }> => e.kind === "incident");
  if (incidents.length === 0) {
    return 0;
  }
  let recurrences = 0;
  for (let i = 0; i < incidents.length; i++) {
    const current = incidents[i]!;
    const recurred = incidents
      .slice(0, i)
      .some((prior) => prior.frameId === current.frameId && current.turn - prior.turn <= windowTurns);
    if (recurred) {
      recurrences += 1;
    }
  }
  return recurrences / incidents.length;
}

/**
 * [Spec §21.4 "degradation events < 0.5% of beats", §17/INV-14] Fraction of turns that fell
 * through to the degradation ladder rather than firing a curated incident. Fed real
 * `CampaignEvent[]` data.
 */
export function degradationRate(events: readonly CampaignEvent[]): number {
  if (events.length === 0) {
    return 0;
  }
  const degraded = events.filter((e) => e.kind === "degraded").length;
  return degraded / events.length;
}

export interface AttributionPair {
  readonly accused: string;
  readonly actual: string;
}

/**
 * [Spec §21.4 "misattribution rate 25-40% per incident", sim-bot-policies.md §2 "accusation"]
 * Pure function over (accused, actual) actor-id pairs a lineup's diligent/paranoid accuse rule
 * would produce -- `accused !== actual` counts as a misattribution. M1 has no confrontation/vote
 * step to generate real accusations from (that machinery is M2), so this is exercised here with
 * synthetic pairs; a real campaign run can supply real pairs once M2's accusation flow exists.
 * There IS real ground truth to check against even now: `CampaignEvent`'s `causeActorId` is the
 * twin's real actor, so an M2 caller wires `accused` (from a bot's posterior pick) against that.
 */
export function misattributionRate(pairs: readonly AttributionPair[]): number {
  if (pairs.length === 0) {
    return 0;
  }
  const wrong = pairs.filter((pair) => pair.accused !== pair.actual).length;
  return wrong / pairs.length;
}

function entropyBits(worldCount: number): number {
  return worldCount <= 1 ? 0 : Math.log2(worldCount);
}

export interface InformativenessSample {
  readonly worldsBefore: number;
  readonly worldsAfter: number;
}

/**
 * [Spec §21.4 "evidence informativeness (mean entropy reduction per action) above floor"] Mean
 * bits of entropy (log2 of consistent-worlds count, per `inference/bot.ts`'s own enumeration)
 * removed per evidence action. M1 has no evidence-action-narrows-worlds pipeline wired end to
 * end yet (`consistentWorlds` is proven correct in isolation -- see BL-05), so this collector is
 * unit-tested with synthetic before/after world counts; a real run supplies real ones once an
 * evidence action's effect on the roster is threaded through.
 */
export function evidenceInformativeness(samples: readonly InformativenessSample[]): number {
  if (samples.length === 0) {
    return 0;
  }
  const total = samples.reduce((sum, s) => sum + (entropyBits(s.worldsBefore) - entropyBits(s.worldsAfter)), 0);
  return total / samples.length;
}

export interface ObligationSample {
  readonly turn: number;
  readonly met: boolean;
}

export interface ObligationCurvePoint {
  readonly turn: number;
  readonly cumulativeFailureRate: number;
}

/**
 * [Spec §21.4 "Obligation-failure curve inside the frame's design band"] Cumulative
 * payment-failure rate per turn, in turn order. M1's sim loop doesn't run the market/funds
 * economy against a lineup's decisions (that needs `npc/policy.ts`'s `decide()` wired to real
 * funds state, out of this card's scope per the advisor's steer to land the incident loop
 * first), so this collector is unit-tested with synthetic per-turn samples; a real run supplies
 * real ones once the economy loop is threaded through.
 */
export function obligationFailureCurve(samples: readonly ObligationSample[]): readonly ObligationCurvePoint[] {
  const ordered = [...samples].sort((a, b) => a.turn - b.turn);
  let failures = 0;
  return ordered.map((sample, index) => {
    if (!sample.met) {
      failures += 1;
    }
    return { turn: sample.turn, cumulativeFailureRate: failures / (index + 1) };
  });
}

export interface SocialGroundTruthSample {
  readonly accused: string;
  readonly actual: string;
  readonly accusation: boolean;
  readonly twin: boolean;
  readonly burned: boolean;
  readonly loyal: boolean;
  readonly agendaDetected: boolean;
  readonly hadAgenda: boolean;
  readonly shipSurvived: boolean;
}

function rate(samples: readonly SocialGroundTruthSample[], predicate: (sample: SocialGroundTruthSample) => boolean, eligible: (sample: SocialGroundTruthSample) => boolean = () => true): number {
  const denominator = samples.filter(eligible);
  return denominator.length === 0 ? 0 : denominator.filter(predicate).length / denominator.length;
}

/** Harness-only join of policy outcomes to ground truth; policies never receive these fields. */
export function socialMetrics(samples: readonly SocialGroundTruthSample[]) {
  return {
    misattributionRate: rate(samples, (sample) => sample.accused !== sample.actual),
    falseAccusationRate: rate(samples, (sample) => sample.twin, (sample) => sample.accusation),
    envelopeBurnRate: rate(samples, (sample) => sample.burned),
    loyalBurnRate: rate(samples, (sample) => sample.burned, (sample) => sample.loyal),
    detectionRate: rate(samples, (sample) => sample.agendaDetected, (sample) => sample.hadAgenda),
    shipSurvivalRate: rate(samples, (sample) => sample.shipSurvived),
  };
}
