import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");

describe("M0-10 GitHub Pages deploy workflow", () => {
  it("deploys only main pushes after both gates and smoke-tests the artifact before upload", () => {
    const deployStart = workflow.indexOf("\n  deploy:");
    expect(deployStart).toBeGreaterThan(0);

    const deploy = workflow.slice(deployStart);
    expect(deploy).toContain("if: github.event_name == 'push' && github.ref == 'refs/heads/main'");
    expect(deploy).toContain("needs: [gate, content-gate]");
    expect(deploy).toContain("run: pnpm build:pages");
    expect(deploy).toContain("run: pnpm test:e2e");
    expect(deploy).toContain("uses: actions/upload-pages-artifact@v3");
    expect(deploy).toContain("path: packages/ui-shared/dist");
    expect(deploy).toContain("uses: actions/deploy-pages@v4");
    expect(deploy.indexOf("run: pnpm test:e2e")).toBeLessThan(
      deploy.indexOf("uses: actions/upload-pages-artifact@v3"),
    );
  });
});
