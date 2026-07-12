/**
 * [INV-6] Only the phase-engine interpreter (packages/engine/src/phases/) may write to the
 * ledger; everything else emits proposals. v0 static check: flag `<ident>.append(...)` calls
 * where the receiver identifier is named "ledger", outside files under a `phases/` directory.
 * This is a syntactic matcher, not a type-checked one. Test files are exempt: unit-testing the
 * Ledger module means constructing one and calling .append() directly, which is not a
 * production write path and isn't what INV-6 forbids.
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
    const isTestFile = /\.(test|spec)\.[jt]sx?$/.test(filename) || /(^|[/\\])__tests__([/\\]|$)/.test(filename);
    if (isInterpreter || isTestFile) {
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
