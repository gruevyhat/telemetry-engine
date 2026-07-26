import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
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
      {
        code: "ledger.append(fact);",
        filename: "packages/engine/src/ledger/ledger.test.ts",
      },
      {
        code: "ledger.append(fact);",
        filename: "packages/engine/src/ledger/__tests__/ledger.test.ts",
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

// [BL-03] The v0 rule above only matches the literal identifier name "ledger". These cases prove
// the rule is now type-checked: it must follow a real `Ledger` under a renamed variable/parameter,
// and it must NOT flag an unrelated type that merely happens to be named "ledger" and merely
// happens to have an "append" method -- the exact distinction v0 could not make.
const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures", "typed-ledger");

const typedRuleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      project: "./tsconfig.json",
      tsconfigRootDir: fixturesDir,
    },
  },
});

describe("no-ledger-writes-outside-interpreter [type-checked]", () => {
  typedRuleTester.run("no-ledger-writes-outside-interpreter", rule, {
    valid: [
      {
        // Same variable name and method name as the real thing, but a provably different,
        // unrelated type. The old syntactic matcher could not tell these apart.
        code: readFileSync(join(fixturesDir, "fake-append.ts"), "utf8"),
        filename: join(fixturesDir, "fake-append.ts"),
      },
    ],
    invalid: [
      {
        // A real Ledger, reached through a parameter named "store", not "ledger".
        code: readFileSync(join(fixturesDir, "renamed-real-ledger.ts"), "utf8"),
        filename: join(fixturesDir, "renamed-real-ledger.ts"),
        errors: [{ messageId: "noLedgerWrite" }],
      },
    ],
  });
});
