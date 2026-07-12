/**
 * [INV-6] Only the phase-engine interpreter (packages/engine/src/phases/) may write to the
 * ledger; everything else emits proposals. v0 static check: flag `<ident>.append(...)` calls
 * where the receiver identifier is named "ledger", outside files under a `phases/` directory.
 * This is a syntactic matcher, not a type-checked one — the real Ledger API lands in M0-02.
 */
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
  create(context) {
    const filename = context.filename ?? context.getFilename();
    const isInterpreter = /(^|[/\\])phases([/\\]|$)/.test(filename);
    if (isInterpreter) {
      return {};
    }
    return {
      CallExpression(node) {
        const { callee } = node;
        if (
          callee.type === "MemberExpression" &&
          callee.object.type === "Identifier" &&
          callee.object.name === "ledger" &&
          callee.property.type === "Identifier" &&
          callee.property.name === "append"
        ) {
          context.report({ node, messageId: "noLedgerWrite" });
        }
      },
    };
  },
};

export default rule;
