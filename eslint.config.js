import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import tsParser from "@typescript-eslint/parser";
import noLedgerWritesOutsideInterpreter from "./eslint-rules/no-ledger-writes-outside-interpreter.js";
import noMathRandomInEngine from "./eslint-rules/no-math-random-in-engine.js";

const repoRoot = dirname(fileURLToPath(import.meta.url));

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
    // [BL-03] Type-aware linting, scoped to packages/engine/src/** only: this is what lets
    // no-ledger-writes-outside-interpreter follow the real Ledger type instead of matching the
    // identifier name "ledger". Kept narrow rather than project-wide because type-aware linting
    // is meaningfully slower and every other package's lint rules here are purely syntactic.
    files: ["packages/engine/src/**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./packages/engine/tsconfig.json",
        tsconfigRootDir: repoRoot,
      },
    },
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
