import type { CampaignEvent } from "./campaign.js";

/** [M1-12, red] Not yet implemented. */
export function recurrenceRate(_events: readonly CampaignEvent[], _windowTurns = 4): number {
  throw new Error("not yet implemented");
}

/** [M1-12, red] Not yet implemented. */
export function degradationRate(_events: readonly CampaignEvent[]): number {
  throw new Error("not yet implemented");
}

export interface AttributionPair {
  readonly accused: string;
  readonly actual: string;
}

/** [M1-12, red] Not yet implemented. */
export function misattributionRate(_pairs: readonly AttributionPair[]): number {
  throw new Error("not yet implemented");
}

export interface InformativenessSample {
  readonly worldsBefore: number;
  readonly worldsAfter: number;
}

/** [M1-12, red] Not yet implemented. */
export function evidenceInformativeness(_samples: readonly InformativenessSample[]): number {
  throw new Error("not yet implemented");
}

export interface ObligationSample {
  readonly turn: number;
  readonly met: boolean;
}

export interface ObligationCurvePoint {
  readonly turn: number;
  readonly cumulativeFailureRate: number;
}

/** [M1-12, red] Not yet implemented. */
export function obligationFailureCurve(_samples: readonly ObligationSample[]): readonly ObligationCurvePoint[] {
  throw new Error("not yet implemented");
}
