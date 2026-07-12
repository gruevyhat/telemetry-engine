import tsParser from "@typescript-eslint/parser";
import noLedgerWritesOutsideInterpreter from "./eslint-rules/no-ledger-writes-outside-interpreter.js";
import noMathRandomInEngine from "./eslint-rules/no-math-random-in-engine.js";

export default [
  {
    ignores: ["**/dist/**", "**/node_modules/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
  {
    files: ["packages/engine/src/**/*.ts"],
    plugins: {
      telemetry: {
        rules: {
          "no-ledger-writes-outside-interpreter": noLedgerWritesOutsideInterpreter,
          "no-math-random-in-engine": noMathRandomInEngine,
        },
      },
    },
    rules: {
      "telemetry/no-ledger-writes-outside-interpreter": "error",
      "telemetry/no-math-random-in-engine": "error",
    },
  },
];
