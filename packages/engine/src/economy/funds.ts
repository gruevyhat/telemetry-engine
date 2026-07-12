import type { Projection } from "../ledger/derive.js";
import type { Fact } from "../ledger/types.js";

/**
 * Running credit balance. Spec §2.1 groups "funds" with the other pure-derived state; the v0
 * catalog (docs/design/fact-kinds-v0.md) has no dedicated funds-adjustment kind, so this sums
 * the two settlement kinds it does define: sale.settled credits the crew, purchase.settled
 * debits it. Wages, fines, etc. are out of scope until their kinds exist (catalog PR first).
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
    return state;
  },
};
