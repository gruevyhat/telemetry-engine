import { ESLintUtils } from "@typescript-eslint/utils";

/**
 * [INV-6] Only the phase-engine interpreter (packages/engine/src/phases/) may write to the
 * ledger; everything else emits proposals. [BL-03] When type information is available (the
 * production config enables it for packages/engine/src/**), this follows the real `Ledger`
 * type from packages/engine/src/ledger/ledger.ts through the checker -- a renamed variable or
 * parameter is still caught, and an unrelated type that merely happens to be named "ledger"
 * with its own "append" method is correctly left alone, which the old identifier-name matcher
 * could not distinguish. Without type information (e.g. a plain ESLint RuleTester run with no
 * TS project configured), this falls back to the original v0 name-matching behavior rather than
 * silently linting nothing. Test files are exempt: unit-testing the Ledger module means
 * constructing one and calling .append() directly, which is not a production write path and
 * isn't what INV-6 forbids.
 */
function isRealLedgerType(type) {
  const constituents = typeof type.isUnion === "function" && type.isUnion() ? type.types : [type];
  return constituents.some((constituent) => {
    const symbol = constituent.getSymbol?.();
    if (symbol?.name !== "Ledger") return false;
    return (symbol.getDeclarations?.() ?? []).some((decl) => /[/\\]ledger[/\\]ledger\.ts$/.test(decl.getSourceFile().fileName));
  });
}

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

    let services;
    try {
      services = ESLintUtils.getParserServices(context);
    } catch {
      services = undefined;
    }

    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier" || callee.property.name !== "append") {
          return;
        }

        if (services) {
          const tsNode = services.esTreeNodeToTSNodeMap.get(callee.object);
          const type = services.program.getTypeChecker().getTypeAtLocation(tsNode);
          if (isRealLedgerType(type)) {
            context.report({ node, messageId: "noLedgerWrite" });
          }
          return;
        }

        // No type information available -- fall back to the v0 identifier-name heuristic so
        // existing untyped RuleTester coverage (and any lint run without a TS project) keeps
        // working, rather than silently stopping enforcement.
        if (callee.object.type === "Identifier" && callee.object.name === "ledger") {
          context.report({ node, messageId: "noLedgerWrite" });
        }
      },
    };
  },
};

export default rule;
