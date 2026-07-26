import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const CONVENTIONAL_TYPES = new Set([
  "build",
  "chore",
  "ci",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "test",
]);

const ADMIN_SCOPES = new Map([
  ["ci", [".github/", "scripts/", "package.json", "pnpm-lock.yaml", "PROJECT.md"]],
  ["deps", ["package.json", "pnpm-lock.yaml"]],
  ["handoff", ["docs/handoffs/", "PROJECT.md"]],
  ["hooks", [".github/", ".claude/", ".codex/", "scripts/", "package.json", "pnpm-lock.yaml", "docs/tasks/", "docs/telemetry-engine-dev-plan.md", "AGENTS.md", "CLAUDE.md", "PROJECT.md"]],
  ["process", ["docs/", "AGENTS.md", "CLAUDE.md", "PROJECT.md"]],
  ["project", ["PROJECT.md"]],
  ["retro", ["docs/retros/", "docs/telemetry-engine-dev-plan.md", "CLAUDE.md", "PROJECT.md"]],
  ["tasks", ["docs/tasks/", "PROJECT.md"]],
]);

const WORKER_ROUTINGS = new Set(["haiku", "luna", "worker"]);

function section(markdown, heading) {
  const start = markdown.indexOf(`## ${heading}`);
  if (start < 0) return "";
  const bodyStart = markdown.indexOf("\n", start);
  if (bodyStart < 0) return "";
  const next = markdown.indexOf("\n## ", bodyStart + 1);
  return markdown.slice(bodyStart + 1, next < 0 ? markdown.length : next);
}

function backtickPaths(text) {
  const paths = [];
  for (const match of text.matchAll(/`([^`\n]+)`/g)) {
    const value = match[1].trim().replaceAll("\\", "/");
    if (value.includes("/") && !value.includes(" ")) paths.push(value);
  }
  return paths;
}

export function parseTaskCard(markdown, cardPath) {
  const frontmatter = markdown.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
  const scalar = (key) =>
    frontmatter.match(new RegExp(`^${key}:\\s*([^\\n]+)$`, "m"))?.[1]?.trim() ?? "";
  const id = scalar("id");
  const routing = scalar("routing").toLowerCase();
  const ownedPaths = backtickPaths(section(markdown, "Owned paths"));
  const acceptanceTests = backtickPaths(section(markdown, "Acceptance tests")).filter(
    (path) => /(^|\/)(tests?\/|[^/]+\.(?:test|spec)\.[^/]+$)/.test(path),
  );
  return { id, routing, ownedPaths, acceptanceTests, cardPath };
}

export function loadTaskCards(taskDirectory = "docs/tasks") {
  const cards = new Map();
  for (const name of readdirSync(taskDirectory).filter((entry) => entry.endsWith(".md"))) {
    const cardPath = join(taskDirectory, name).replaceAll("\\", "/");
    const card = parseTaskCard(readFileSync(cardPath, "utf8"), cardPath);
    if (card.id) cards.set(card.id.toLowerCase(), card);
  }
  return cards;
}

function globRegex(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("**", "\0")
    .replaceAll("*", "[^/]*")
    .replaceAll("\0", ".*");
  return new RegExp(`^${escaped}${pattern.endsWith("/") ? ".*" : ""}$`);
}

export function pathMatches(path, pattern) {
  const normalized = pattern.replaceAll("\\", "/");
  if (normalized.includes("*")) return globRegex(normalized).test(path);
  if (normalized.endsWith("/")) return path.startsWith(normalized);
  return path === normalized;
}

function isMetadataPath(path, card) {
  return path === "PROJECT.md" || path === card.cardPath;
}

function isManifestPath(path) {
  return path === "package.json" || path === "pnpm-lock.yaml" || path.endsWith("/package.json");
}

function workerForbiddenReason(path) {
  const checks = [
    [/^\.github\//, "CI configuration"],
    [/(^|\/)(?:eslint-rules|eslint\.config)/, "lint/CI enforcement"],
    [/(^|\/)(?:auth|crypto|secure|secrets?)(?:\/|\.|-)/i, "auth, crypto, or secrets"],
    [/(^|\/)[^/]*schema[^/]*(?:\/|$|\.)/i, "schema"],
    [/^packages\/engine\/src\/phases\//, "phase-engine interpreter"],
    [/^packages\/engine\/src\/plugin-api\//, "public engine interface"],
    [/^packages\/transport-webrtc\//, "WebRTC transport"],
    [/^docs\/design\/fact-kinds-v0\.md$/, "fact-kind catalog"],
    [/^packages\/engine\/src\/ledger\/kinds/, "fact-kind registry"],
  ];
  if (isManifestPath(path)) return "dependency manifest or lockfile";
  return checks.find(([pattern]) => pattern.test(path))?.[1] ?? "";
}

function parseSubject(subject) {
  const match = subject.match(/^([a-z]+)\(([a-z0-9-]+)\):\s+\S/);
  if (!match || !CONVENTIONAL_TYPES.has(match[1])) return null;
  return { type: match[1], scope: match[2] };
}

function validateAdminCommit(parsed, changes) {
  const allowed = ADMIN_SCOPES.get(parsed.scope);
  if (!allowed) {
    return [`non-task scope "${parsed.scope}" is not an approved administrative scope`];
  }
  return changes.flatMap(({ path }) =>
    allowed.some((prefix) => pathMatches(path, prefix))
      ? []
      : [`${path}: outside the allowed paths for administrative scope "${parsed.scope}"`],
  );
}

export function validateCommit({ subject, changes, taskCards }) {
  const parsed = parseSubject(subject);
  if (!parsed) {
    return [
      `commit subject must be conventional with a lowercase scope: type(scope): plain-English subject`,
    ];
  }

  const card = taskCards.get(parsed.scope);
  if (!card) return validateAdminCommit(parsed, changes);

  const findings = [];
  if (card.ownedPaths.length === 0) {
    findings.push(`${card.id}: task card has no Owned paths section`);
  }

  const workerRouted = WORKER_ROUTINGS.has(card.routing);
  for (const change of changes) {
    const { path, status } = change;
    const acceptancePath = card.acceptanceTests.includes(path);

    if (acceptancePath) {
      // Immutable to the worker, not frozen forever: a lead may still amend a test they got
      // wrong (CLAUDE.md's escalation format names "amend packet and re-dispatch" as one of
      // exactly two resolutions). What must never happen is a non-test commit — the worker's
      // implementation lands as feat/fix/etc — touching this path at all, or the file being
      // removed out from under the contract.
      if (status !== "A" && status !== "M") {
        findings.push(`${path}: lead-authored acceptance test is immutable (status ${status})`);
      } else if (parsed.type !== "test") {
        const verb = status === "A" ? "added" : "amended";
        findings.push(`${path}: acceptance tests may be ${verb} only by test(${parsed.scope})`);
      }
      continue;
    }

    const allowedOwned = card.ownedPaths.some((owned) => pathMatches(path, owned));
    const allowedLeadSupport =
      parsed.type === "test" && (isMetadataPath(path, card) || isManifestPath(path));
    const allowedIntegrationMetadata = parsed.type !== "test" && isMetadataPath(path, card);

    if (!allowedOwned && !allowedLeadSupport && !allowedIntegrationMetadata) {
      findings.push(`${path}: outside ${card.id}'s owned_paths`);
      continue;
    }

    if (workerRouted && parsed.type !== "test" && allowedOwned) {
      const reason = workerForbiddenReason(path);
      if (reason) findings.push(`${path}: ${reason} is frontier-only for worker-routed packets`);
    }
  }

  if (parsed.type === "test" && card.acceptanceTests.length === 0) {
    findings.push(`${card.id}: test commit has no parseable acceptance-test path in its card`);
  }
  return findings;
}

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function commitChanges(commit) {
  const output = git(["diff-tree", "--no-commit-id", "--name-status", "-r", "--root", commit]);
  if (!output) return [];
  return output.split("\n").flatMap((line) => {
    const [statusField, ...paths] = line.split("\t");
    const status = statusField[0];
    if ((status === "R" || status === "C") && paths.length === 2) {
      return [
        { status: "D", path: paths[0] },
        { status: "A", path: paths[1] },
      ];
    }
    return paths[0] ? [{ status, path: paths[0] }] : [];
  });
}

export function checkRange(base, head, taskDirectory = "docs/tasks") {
  const taskCards = loadTaskCards(taskDirectory);
  const commits = git(["rev-list", "--reverse", "--no-merges", `${base}..${head}`])
    .split("\n")
    .filter(Boolean);
  const failures = [];
  for (const commit of commits) {
    const subject = git(["show", "-s", "--format=%s", commit]);
    const findings = validateCommit({
      subject,
      changes: commitChanges(commit),
      taskCards,
    });
    if (findings.length > 0) failures.push({ commit, subject, findings });
  }
  return failures;
}

export function packetCheckArgs(argv) {
  const args = [...argv];
  if (args[0] === "--") args.shift();
  return { base: args[0], head: args[1] ?? "HEAD" };
}

function main() {
  const { base, head } = packetCheckArgs(process.argv.slice(2));
  if (!base) {
    console.error("usage: pnpm check:packets -- <base-commit> [head-commit]");
    process.exit(2);
  }
  const failures = checkRange(base, head);
  if (failures.length === 0) {
    console.log("Packet commit contracts pass.");
    return;
  }
  for (const failure of failures) {
    console.error(`${failure.commit.slice(0, 12)} ${failure.subject}`);
    for (const finding of failure.findings) console.error(`  - ${finding}`);
  }
  process.exit(1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
