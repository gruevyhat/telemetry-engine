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

describe("job tooling versions", () => {
  it("uses the same actions/checkout and Node version across gate, content-gate, and deploy", () => {
    const jobNames = ["\n  gate:", "\n  content-gate:", "\n  deploy:"];
    const boundaries = [...jobNames.map((name) => workflow.indexOf(name)), workflow.length];
    jobNames.forEach((name, i) => expect(workflow.indexOf(name)).toBeGreaterThan(0));

    const jobBodies = jobNames.map((_, i) => workflow.slice(boundaries[i], boundaries[i + 1]));
    const checkoutVersions = jobBodies.map((body) => body.match(/uses: actions\/checkout@(\S+)/)?.[1]);
    const nodeVersions = jobBodies.map((body) => body.match(/node-version: (\S+)/)?.[1]);

    expect(new Set(checkoutVersions).size).toBe(1);
    expect(new Set(nodeVersions).size).toBe(1);
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
