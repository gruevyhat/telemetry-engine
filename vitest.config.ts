import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts", "eslint-rules/**/*.test.js", "scripts/**/*.test.js"],
    exclude: ["**/node_modules/**", "**/dist/**", "tests/integration/**"],
  },
});
