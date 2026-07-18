import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const lintContentBin = fileURLToPath(new URL("../bin/lint-content.mjs", import.meta.url));

describe("demo content pipeline [Spec §19]", () => {
  it("content-lint passes both the M0 demo and M1-13's trade-campaign phase scripts", () => {
    const output = execFileSync(process.execPath, [lintContentBin], { encoding: "utf8" });

    expect(output).toContain("2 phase scripts and 12 announce templates valid");
  });
});
