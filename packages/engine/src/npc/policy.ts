import type { Ledger, Viewer } from "../ledger/ledger.js";
import type { Fact } from "../ledger/types.js";
import type { RngStream } from "../rng/index.js";

/**
 * [sim-bot-policies.md §1] "type Disposition = 'naive'|'diligent'|'paranoid'|'loyalist'|
 * 'selfish'." "type SituationType = 'market'|'patron'|'discrepancy'|'commsWindow'|
 * 'confrontation'|'vote'|'interrogation'." `patron` has no §2 rule anywhere in the design doc —
 * excluded from decide()'s handled situations rather than inventing one, same "when unsure,
 * omit" direction fact-kinds-v0.md §1 states for implies edges.
 */
export type Disposition = "naive" | "diligent" | "paranoid" | "loyalist" | "selfish";
export type SituationType = "market" | "patron" | "discrepancy" | "commsWindow" | "confrontation" | "vote" | "interrogation";

/**
 * [sim-bot-policies.md §1, INV-13] "view is only the actor's visibility slice — bots never read
 * referee scope." `.facts` is the pre-filtered slice; `peekFullLedger()` is a deliberate,
 * always-throwing escape hatch so that guarantee is directly testable — no legitimate policy
 * code ever calls it.
 */
export interface ActorView {
  readonly facts: readonly Fact[];
  peekFullLedger(): never;
}

export function createActorView(ledger: Ledger, viewer: Viewer): ActorView {
  return {
    facts: ledger.visibleTo(viewer),
    peekFullLedger(): never {
      throw new Error("policies may only read their actor's visibility slice (INV-13 applies to bots too, sim-bot-policies.md §1/§5)");
    },
  };
}

export type Action =
  | { readonly kind: "market.buy"; readonly lotId: string }
  | { readonly kind: "market.pass" }
  | { readonly kind: "investigate" }
  | { readonly kind: "skip-investigation" };

export interface MarketLot {
  readonly lotId: string;
  readonly buyPrice: number;
  readonly destPrice: number;
  readonly stalenessWeeks: number;
  readonly fuelShare: number;
}

export interface MarketInput {
  readonly situation: "market";
  readonly lots: readonly MarketLot[];
  readonly funds: number;
  readonly nextObligationPayment: number;
}

export interface DiscrepancyInput {
  readonly situation: "discrepancy";
  readonly lossValue: number;
  readonly obligationSlackDays: number;
}

export type DecideInput = MarketInput | DiscrepancyInput;

/** [sim-bot-policies.md §2 market] "λ default 0.04/week (tunable; sim sweeps it)." */
const STALENESS_LAMBDA = 0.04;

/**
 * [sim-bot-policies.md §2 market] "reserve = next Obligation payment x reserveFactor(disposition):
 * naive 0.0 · diligent 0.6 · paranoid 0.9." loyalist/selfish have no documented reserveFactor for
 * *this* formula — defaulted to diligent's value as the closest documented analogue, not
 * invented from nothing. [extrapolation]
 */
const MARKET_RESERVE_FACTOR: Readonly<Record<Disposition, number>> = {
  naive: 0.0,
  diligent: 0.6,
  paranoid: 0.9,
  loyalist: 0.6,
  selfish: 0.6,
};

function decideMarket(input: MarketInput, disposition: Disposition): Action {
  const reserve = input.nextObligationPayment * MARKET_RESERVE_FACTOR[disposition];
  const spendable = input.funds - reserve;

  const scored = input.lots
    .map((lot) => ({ lot, score: lot.destPrice * (1 - STALENESS_LAMBDA * lot.stalenessWeeks) - lot.buyPrice - lot.fuelShare }))
    .filter(({ score, lot }) => score > 0 && lot.buyPrice <= spendable)
    .sort((a, b) => b.score - a.score);

  return scored.length > 0 ? { kind: "market.buy", lotId: scored[0]!.lot.lotId } : { kind: "market.pass" };
}

/** [sim-bot-policies.md §2 discrepancy] "naive: threshold Infinity (never investigates) ·
 * diligent: Cr5,000 / 4 days · paranoid: Cr500 / 1 day · loyalist: as diligent · selfish:
 * investigates only losses touching own objective." Selfish's "own objective" gate needs
 * objective-tracking this task doesn't have inputs for yet — defaulted to diligent's threshold
 * as the closest documented analogue until that context exists. [extrapolation] */
const DISCREPANCY_THRESHOLDS: Readonly<Record<Disposition, { lossValue: number; slackFloor: number }>> = {
  naive: { lossValue: Number.POSITIVE_INFINITY, slackFloor: 0 },
  diligent: { lossValue: 5000, slackFloor: 4 },
  paranoid: { lossValue: 500, slackFloor: 1 },
  loyalist: { lossValue: 5000, slackFloor: 4 },
  selfish: { lossValue: 5000, slackFloor: 4 },
};

function decideDiscrepancy(input: DiscrepancyInput, disposition: Disposition): Action {
  const { lossValue: threshold, slackFloor } = DISCREPANCY_THRESHOLDS[disposition];
  const shouldInvestigate = input.lossValue > threshold && input.obligationSlackDays > slackFloor;
  return shouldInvestigate ? { kind: "investigate" } : { kind: "skip-investigation" };
}

/**
 * [sim-bot-policies.md §1] "A policy is a pure function decide(view, rng) -> Action." `rng` is
 * accepted for signature fidelity with the design doc and for situations that need a draw (none
 * of market/discrepancy do — both are deterministic threshold/scoring rules with no dice), so it
 * goes unused here without being a lint violation (see below); later situations (vote ties,
 * etc.) will consume it.
 */
export function decide(input: DecideInput, disposition: Disposition, _rng: RngStream): Action {
  switch (input.situation) {
    case "market":
      return decideMarket(input, disposition);
    case "discrepancy":
      return decideDiscrepancy(input, disposition);
  }
}
