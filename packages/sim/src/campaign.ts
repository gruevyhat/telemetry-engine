import { readFileSync } from "node:fs";
import type { IncidentFrame } from "../../engine/src/generate/frame.js";
import type { DegradeOutcome } from "../../engine/src/degrade/ladder.js";
import type { Fact } from "../../engine/src/ledger/types.js";

export function loadDeck(relativePath: string): readonly IncidentFrame[] {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

export const TRADE_DECK: readonly IncidentFrame[] = loadDeck("../../../content/decks/trade/frames.json");
export const GENERIC_DECK: readonly IncidentFrame[] = loadDeck("../../../content/decks/generic/frames.json");

export type CampaignEvent =
  | { readonly turn: number; readonly kind: "incident"; readonly frameId: string; readonly causeActorId: string }
  | { readonly turn: number; readonly kind: "degraded"; readonly rung: DegradeOutcome["rung"] };

export interface CampaignResult {
  readonly events: readonly CampaignEvent[];
  readonly facts: readonly Fact[];
}

/** [M1-12, red] Not yet implemented -- the headless per-turn draw/fire/degrade loop lands in the
 * next commit. */
export function runCampaign(_seed: string, _turns: number, _deck: readonly IncidentFrame[] = TRADE_DECK, _genericDeck: readonly IncidentFrame[] = GENERIC_DECK): CampaignResult {
  throw new Error("runCampaign not yet implemented");
}
