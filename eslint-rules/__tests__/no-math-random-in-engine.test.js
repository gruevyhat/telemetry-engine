import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "../no-math-random-in-engine.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester();

describe("no-math-random-in-engine", () => {
  ruleTester.run("no-math-random-in-engine", rule, {
    valid: [
      { code: "const x = rng.next('combat');" },
      { code: "const notMath = { random: () => 1 }; notMath.random();" },
    ],
    invalid: [
      {
        code: "const x = Math.random();",
        errors: [{ messageId: "noMathRandom" }],
      },
      {
        code: "function roll() { return Math.random() > 0.5; }",
        errors: [{ messageId: "noMathRandom" }],
      },
    ],
  });
});
