import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const lintContentBin = fileURLToPath(new URL("../bin/lint-content.mjs", import.meta.url));

describe("demo content pipeline [Spec §19]", () => {
  it("content-lint passes the demo phase script and announce templates", () => {
    const output = execFileSync(process.execPath, [lintContentBin], { encoding: "utf8" });

    expect(output.trim()).toBe("content-lint: 1 phase script and 4 announce templates valid.");
  });
});
