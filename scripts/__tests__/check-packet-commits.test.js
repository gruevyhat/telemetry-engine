import { describe, expect, it } from "vitest";
import {
  packetCheckArgs,
  parseTaskCard,
  pathMatches,
  validateCommit,
} from "../check-packet-commits.mjs";

const CARD_TEXT = `---
id: M3-02
routing: luna
status: ready
---

## Owned paths
- \`packages/plugin-traveller/src/sec.ts\`
- \`packages/plugin-traveller/fixtures/*.sec\`

## Acceptance tests
\`packages/plugin-traveller/src/sec.test.ts\` — lead-authored, worker read-only.
`;

const CARD = parseTaskCard(CARD_TEXT, "docs/tasks/M3-02.md");
const TASKS = new Map([["m3-02", CARD]]);

describe("task-card parsing", () => {
  it("accepts pnpm's forwarded argument separator", () => {
    expect(packetCheckArgs(["--", "base", "head"])).toEqual({
      base: "base",
      head: "head",
    });
  });

  it("extracts owned paths and the lead-authored acceptance test", () => {
    expect(CARD).toMatchObject({
      id: "M3-02",
      routing: "luna",
      ownedPaths: [
        "packages/plugin-traveller/src/sec.ts",
        "packages/plugin-traveller/fixtures/*.sec",
      ],
      acceptanceTests: ["packages/plugin-traveller/src/sec.test.ts"],
    });
  });

  it("matches exact, directory, and wildcard owned paths", () => {
    expect(pathMatches("packages/plugin-traveller/src/sec.ts", "packages/plugin-traveller/src/sec.ts")).toBe(true);
    expect(pathMatches("content/frames/a.json", "content/")).toBe(true);
    expect(pathMatches("packages/plugin-traveller/fixtures/a.sec", "packages/plugin-traveller/fixtures/*.sec")).toBe(true);
    expect(pathMatches("packages/plugin-traveller/fixtures/a.json", "packages/plugin-traveller/fixtures/*.sec")).toBe(false);
  });
});

describe("packet commit enforcement", () => {
  it("allows a lead test commit to add the acceptance test and supporting metadata", () => {
    expect(
      validateCommit({
        subject: "test(m3-02): add SEC parser acceptance tests",
        changes: [
          { status: "A", path: "packages/plugin-traveller/src/sec.test.ts" },
          { status: "M", path: "docs/tasks/M3-02.md" },
          { status: "M", path: "PROJECT.md" },
          { status: "M", path: "packages/plugin-traveller/package.json" },
          { status: "M", path: "pnpm-lock.yaml" },
        ],
        taskCards: TASKS,
      }),
    ).toEqual([]);
  });

  it("rejects acceptance-test modification by an implementation commit", () => {
    const findings = validateCommit({
      subject: "feat(m3-02): parse SEC sectors",
      changes: [{ status: "M", path: "packages/plugin-traveller/src/sec.test.ts" }],
      taskCards: TASKS,
    });
    expect(findings.join("\n")).toContain("acceptance tests may be amended only by test(m3-02)");
  });

  it("rejects acceptance-test deletion outright, even by a test commit", () => {
    const findings = validateCommit({
      subject: "test(m3-02): drop SEC parser acceptance tests",
      changes: [{ status: "D", path: "packages/plugin-traveller/src/sec.test.ts" }],
      taskCards: TASKS,
    });
    expect(findings.join("\n")).toContain("acceptance test is immutable");
  });

  it("allows a lead test commit to amend an acceptance test it got wrong (escalation resolved as amend-and-re-dispatch)", () => {
    expect(
      validateCommit({
        subject: "test(m3-02): fix a bug in the SEC parser acceptance tests",
        changes: [{ status: "M", path: "packages/plugin-traveller/src/sec.test.ts" }],
        taskCards: TASKS,
      }),
    ).toEqual([]);
  });

  it("rejects files outside the packet's owned paths", () => {
    const findings = validateCommit({
      subject: "feat(m3-02): parse SEC sectors",
      changes: [{ status: "A", path: "packages/engine/src/sec.ts" }],
      taskCards: TASKS,
    });
    expect(findings.join("\n")).toContain("outside M3-02's owned_paths");
  });

  it("rejects worker changes to frontier-only areas even if a bad card owns them", () => {
    const badCard = {
      ...CARD,
      ownedPaths: ["packages/transport-webrtc/src/index.ts"],
    };
    const findings = validateCommit({
      subject: "feat(m3-02): alter transport",
      changes: [{ status: "M", path: "packages/transport-webrtc/src/index.ts" }],
      taskCards: new Map([["m3-02", badCard]]),
    });
    expect(findings.join("\n")).toContain("WebRTC transport is frontier-only");
  });

  it("rejects malformed and generic milestone commit scopes", () => {
    expect(
      validateCommit({
        subject: "feat: missing scope",
        changes: [],
        taskCards: TASKS,
      }),
    ).not.toEqual([]);
    expect(
      validateCommit({
        subject: "feat(m3): generic milestone scope",
        changes: [],
        taskCards: TASKS,
      }).join("\n"),
    ).toContain("not an approved administrative scope");
  });

  it("allows bounded administrative hook commits", () => {
    expect(
      validateCommit({
        subject: "chore(hooks): enforce packet commits",
        changes: [
          { status: "M", path: ".github/workflows/ci.yml" },
          { status: "A", path: "scripts/check-packet-commits.mjs" },
          { status: "M", path: "docs/tasks/M3-10.md" },
          { status: "M", path: "docs/telemetry-engine-dev-plan.md" },
          { status: "M", path: "PROJECT.md" },
        ],
        taskCards: TASKS,
      }),
    ).toEqual([]);
  });
});
