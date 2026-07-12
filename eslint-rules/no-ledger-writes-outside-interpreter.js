const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "disallow ledger.append(...) outside packages/engine/src/phases/ (the interpreter)",
    },
    schema: [],
    messages: {
      noLedgerWrite: "ledger.append(...) is only allowed inside the phase-engine interpreter (Spec §4, INV-6).",
    },
  },
  create() {
    return {};
  },
};

export default rule;
