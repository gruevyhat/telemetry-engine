import type { CampaignResult } from "./campaign.js";
import { degradationRate, recurrenceRate } from "./metrics.js";
import type { LineupName } from "./lineups.js";

/**
 * [Spec §20 "an opt-in local session-metrics export (same metric set as §21.4)", §21.4] One
 * lineup's aggregate result across N campaigns. Only `recurrenceRate` and `degradationRate` are
 * computed from real campaign events this milestone -- the other §21.4 metric names are listed
 * with `null` so the export's shape is stable and self-documenting even before the M2 machinery
 * that would populate them (accusation, evidence-narrowing, economy) exists. This is the same
 * shape a local, opt-in export (§20: "none over the network, ever") would write to disk.
 */
export interface LineupMetricsExport {
  readonly lineup: LineupName;
  readonly campaigns: number;
  readonly turnsPerCampaign: number;
  readonly recurrenceRate: number;
  readonly degradationRate: number;
  readonly misattributionRate: number | null;
  readonly evidenceInformativeness: number | null;
  readonly obligationFailureCurve: null;
}

export function exportLineupMetrics(lineup: LineupName, turnsPerCampaign: number, campaignResults: readonly CampaignResult[]): LineupMetricsExport {
  const allEvents = campaignResults.flatMap((result) => result.events);
  return {
    lineup,
    campaigns: campaignResults.length,
    turnsPerCampaign,
    recurrenceRate: recurrenceRate(allEvents),
    degradationRate: degradationRate(allEvents),
    misattributionRate: null,
    evidenceInformativeness: null,
    obligationFailureCurve: null,
  };
}
