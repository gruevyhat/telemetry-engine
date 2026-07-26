import type { Ledger, AppendInput } from "../../../packages/engine/src/ledger/ledger.js";

// [BL-03 fixture] A real Ledger under a variable name the v0 rule's name-matcher can't see.
export function sneakyWrite(store: Ledger, input: AppendInput): void {
  store.append(input);
}
