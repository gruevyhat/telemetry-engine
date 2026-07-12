import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const uiSharedNodeModules = fileURLToPath(new URL("./packages/ui-shared/node_modules/", import.meta.url));
const reactDir = `${uiSharedNodeModules}react`;
const reactDomDir = `${uiSharedNodeModules}react-dom`;
const testingLibraryReactDir = `${uiSharedNodeModules}@testing-library/react`;

export default defineConfig({
  resolve: {
    alias: [
      { find: "react/jsx-dev-runtime", replacement: `${reactDir}/jsx-dev-runtime.js` },
      { find: "react/jsx-runtime", replacement: `${reactDir}/jsx-runtime.js` },
      { find: /^react\/(.+)$/, replacement: `${reactDir}/$1` },
      { find: "react", replacement: `${reactDir}/index.js` },
      { find: "react-dom/client", replacement: `${reactDomDir}/client.js` },
      { find: /^react-dom\/(.+)$/, replacement: `${reactDomDir}/$1` },
      { find: "react-dom", replacement: `${reactDomDir}/index.js` },
      { find: "@testing-library/react", replacement: `${testingLibraryReactDir}/dist/index.js` },
    ],
    dedupe: ["react", "react-dom"],
    conditions: ["node", "import", "default"],
  },
  test: {
    include: ["packages/*/src/**/*.test.{ts,tsx}", "eslint-rules/**/*.test.js", "scripts/**/*.test.js"],
    exclude: ["**/node_modules/**", "**/dist/**", "tests/integration/**"],
    server: {
      deps: {
        inline: [/react/, /@testing-library/],
      },
    },
  },
});
