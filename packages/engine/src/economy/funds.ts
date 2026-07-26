import type { Projection } from "../ledger/derive.js";
import type { Fact } from "../ledger/types.js";

/**
 * Running credit balance. Spec §2.1 groups "funds" with the other pure-derived state; sums
 * sale.settled (credits), purchase.settled (debits), and — as of M3-08 —
 * benefit.cashGranted (muster-out cash credits, docs/design/travel-and-import-v1.md §5.2).
 * Wages, fines, etc. remain out of scope until their kinds exist (catalog PR first).
 */
export const fundsProjection: Projection<number> = {
  initial: 0,
  apply(state: number, fact: Fact): number {
    if (fact.kind === "sale.settled" && typeof fact.payload.amount === "number") {
      return state + fact.payload.amount;
    }
    if (fact.kind === "purchase.settled" && typeof fact.payload.amount === "number") {
      return state - fact.payload.amount;
    }
    if (fact.kind === "benefit.cashGranted" && typeof fact.payload.amount === "number") {
      return state + fact.payload.amount;
    }
    return state;
  },
};
