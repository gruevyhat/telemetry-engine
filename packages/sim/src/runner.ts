import type { LineupMetricsExport } from "./export.js";
import type { LineupName } from "./lineups.js";

/** [M1-12, red] Not yet implemented. */
export function runLineups(_lineupNames: readonly LineupName[], _campaignsPerLineup: number, _turnsPerCampaign: number, _seedPrefix: string): readonly LineupMetricsExport[] {
  throw new Error("not yet implemented");
}
