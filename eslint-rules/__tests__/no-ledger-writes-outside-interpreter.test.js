import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "../no-ledger-writes-outside-interpreter.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

describe("no-ledger-writes-outside-interpreter", () => {
  ruleTester.run("no-ledger-writes-outside-interpreter", rule, {
    valid: [
      {
        code: "ledger.append(fact);",
        filename: "packages/engine/src/phases/interpreter.ts",
      },
      {
        code: "ledger.read(id);",
        filename: "packages/engine/src/economy/market.ts",
      },
      {
        code: "somethingElse.append(fact);",
        filename: "packages/engine/src/economy/market.ts",
      },
    ],
    invalid: [
      {
        code: "ledger.append(fact);",
        filename: "packages/engine/src/economy/market.ts",
        errors: [{ messageId: "noLedgerWrite" }],
      },
      {
        code: "function proposeAndSneak() { ledger.append(proposal); }",
        filename: "packages/engine/src/generate/composer.ts",
        errors: [{ messageId: "noLedgerWrite" }],
      },
    ],
  });
});
