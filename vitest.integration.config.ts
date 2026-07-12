import { defineConfig, mergeConfig } from "vitest/config";
import baseConfig from "./vitest.config.js";

const config = mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      passWithNoTests: false,
    },
  }),
);

config.test = {
  ...config.test,
  include: ["tests/integration/**/*.test.{ts,tsx}"],
  exclude: ["**/node_modules/**", "**/dist/**"],
};

export default config;
