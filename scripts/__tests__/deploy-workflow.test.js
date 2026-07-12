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
    expect(deploy).toContain("uses: actions/configure-pages@v5");
    expect(deploy).toContain("uses: actions/upload-pages-artifact@v4");
    expect(deploy).toContain("path: packages/ui-shared/dist");
    expect(deploy).toContain("uses: actions/deploy-pages@v4");
    expect(deploy.indexOf("run: pnpm test:e2e")).toBeLessThan(
      deploy.indexOf("uses: actions/upload-pages-artifact@v4"),
    );
  });
});

describe("content gate change detection", () => {
  it("gates pushes against the pre-push tip so content pushed straight to main is checked", () => {
    const contentGateStart = workflow.indexOf("\n  content-gate:");
    expect(contentGateStart).toBeGreaterThan(0);
    const contentGate = workflow.slice(contentGateStart, workflow.indexOf("\n  deploy:"));

    // A push to main leaves origin/main pointing at the just-pushed HEAD, so diffing
    // origin/main...HEAD is always empty there and the gate would silently skip on exactly
    // the branch that deploys. Detection must use the push's pre-push tip for push events.
    expect(contentGate).toContain("github.event.before");
  });
});
