// [BL-03 fixture] Same variable name as the real interpreter convention ("ledger"), same method
// name ("append"), but NOT a Ledger -- an unrelated type. A genuinely type-checked rule must not
// flag this; the old name-matching rule could not tell the difference.
interface NotALedger {
  append(item: string): void;
}

export function harmlessAppend(ledger: NotALedger, item: string): void {
  ledger.append(item);
}
