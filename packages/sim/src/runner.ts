import { runCampaign, TRADE_DECK, GENERIC_DECK } from "./campaign.js";
import { exportLineupMetrics, type LineupMetricsExport } from "./export.js";
import { LINEUPS, type LineupName } from "./lineups.js";

/**
 * [Spec §21.3 M1 acceptance "solo trade campaign completes 4 turns headless", §21.4, M1-12]
 * Runs `campaignsPerLineup` independent, seeded campaigns per named lineup and aggregates each
 * lineup's metrics export. The incident stream `runCampaign` produces doesn't depend on which
 * lineup is watching (see campaign.ts's own doc comment), so seating a lineup here only labels
 * which metrics bucket a run's events are aggregated into -- a placeholder until a lineup's
 * bot decisions (market/discrepancy actions from `npc/policy.ts`'s `decide()`) actually consume
 * the campaign's facts, which is out of this card's scope (see export.ts's null-valued metrics).
 */
export function runLineups(lineupNames: readonly LineupName[], campaignsPerLineup: number, turnsPerCampaign: number, seedPrefix: string): readonly LineupMetricsExport[] {
  return lineupNames.map((lineupName) => {
    if (!(lineupName in LINEUPS)) {
      throw new Error(`unknown lineup "${lineupName}"`);
    }
    const results = Array.from({ length: campaignsPerLineup }, (_unused, i) =>
      runCampaign(`${seedPrefix}:${lineupName}:${i}`, turnsPerCampaign, TRADE_DECK, GENERIC_DECK),
    );
    return exportLineupMetrics(lineupName, turnsPerCampaign, results);
  });
}
