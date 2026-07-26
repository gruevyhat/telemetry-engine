# AGENTS.md — Telemetry Engine Agent Contract

Telemetry Engine is a GM-less, event-sourced tabletop referee. TypeScript,
static-hosted, no backend. The append-only, visibility-scoped Fact Ledger is the
core; everything else reads facts, proposes facts, or scopes facts.

## Role resolution

The Telemetry role injected at session start is the default authority. A human may
explicitly override it for the current step. Do not infer a role from the prose of
a task card.

- `frontier-lead`: follow `CLAUDE.md`'s frontier lead contract, with the Codex
  roster named by the session context. You may amend task cards, resolve frontier
  boundaries, and author acceptance tests. Do not implement a worker packet unless
  the human explicitly asks you to take it as frontier work.
- `frontier-integrator`: follow `CLAUDE.md`'s frontier integrator contract, with
  the Codex roster named by the session context.
- `luna-worker`: follow the worker contract below.

If the session context does not inject exactly one of those roles, stop and report
`role-unresolved`; do not guess from model capability.

## Luna worker contract

Implement exactly one `ready` packet from `docs/tasks/` in one worktree, landing as
one green commit against the lead-authored acceptance tests. Modify only the
packet's `owned_paths`. Intended reading is this file, the packet, its
`read_context`, and repo search results — nothing else pushed. In practice,
CLAUDE.md is auto-loaded into any agent's context in this repo regardless of role,
including yours; if you see its frontier lead/integrator description (which says
that role "does not write implementation code"), it is not describing you — an
explicit role statement in the dispatch prompt, or this contract, wins. Never take a
`blocked` packet; only the lead promotes it to `ready`.

## Commands and test cadence

Use only scripts exposed by `package.json`; never invoke their underlying tools
directly. If a packet's verification says otherwise, escalate the conflict.

- Test: `pnpm test` · integration: `pnpm test:integration`
- Types: `pnpm typecheck` · lint: `pnpm lint`
- Build/IP boundary: `pnpm build:stub`
- Content: `pnpm lint:content` · simulation: `pnpm sim:smoke`

While iterating, run only the affected test file through the package script. Run the
full applicable gate once before the commit. Run each command separately and check
its exit code; do not chain through filters. Never loop a suite to chase a flake or
rerun a passing gate whose inputs have not changed.

## Layout and style

pnpm workspace: `packages/engine` (pure core), `plugin-traveller`, `plugin-stub`,
`transport`, `transport-webrtc`, `content`, `ui-shared`, `ui-phone`, `sim`, and
`content-lint`.

- Engine code is pure and framework-free. Use seeded RNG through named streams;
  never use `Math.random` in `packages/engine`.
- Player-visible text follows `docs/design/maggie-voice.md`: TTS-safe plain
  sentences, no markup, no exclamation points.
- Match surrounding idiom. Use a conventional commit whose scope is the exact
  lowercase task id, with a plain-English subject: `feat(m3-02): ...`.

## Forbidden — escalate instead

- Modify a packet's `acceptance_tests`, or delete, skip, weaken, or lower the
  threshold of any test.
- Change public interfaces, dependencies, schemas, fact kinds, CI, auth, crypto, or
  secrets.
- Touch `Visibility` handling, the phase-engine interpreter, WebRTC transport, or
  crypto, even when a packet lists it. These are always frontier work.
- Write to the ledger outside `packages/engine/src/phases/` (INV-6). Other modules
  emit proposals. Check `phases/commits.ts` before proposing a new commit action.
- Import `plugin-traveller/` or `content/` from `packages/engine` (INV-1).
- Parse rendered text back into facts (INV-12).
- Add a fact kind in code before its owner-approved entry in
  `docs/design/fact-kinds-v0.md`.
- Work outside `owned_paths`, expand packet scope, or continue when the estimated
  diff exceeds about 600 changed lines.

## Escalation

Stop after two failed attempts, or immediately on a forbidden boundary, a conflicting
instruction, or a genuine ambiguity with two materially different readings. Format:
`task id | location | reason | 1–2 proposed options`.

## Report (no narrative)

Task id, result, commit hash, verification output, assumptions, risks.
