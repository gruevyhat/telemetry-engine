# AGENTS.md — Telemetry Engine Worker Contract

You are a worker on Telemetry Engine: a GM-less, event-sourced tabletop game referee.
TypeScript, static-hosted, no backend. The core is the append-only, visibility-scoped
Fact Ledger; everything else reads facts, proposes facts, or scopes facts.

You implement exactly one packet (a task card in `docs/tasks/`) in one worktree,
landing as one commit. Modify only the packet's `owned_paths`. Read only the packet,
this file, the packet's `read_context`, and repo search results.

## Commands (never invoke tools raw)
- Test: `pnpm test` (packet's `verification` lists the exact commands to run)
- Types: `pnpm typecheck` · Lint: `pnpm lint` · Content: `pnpm lint:content`

## Layout
pnpm workspace: `packages/engine` (pure core), `plugin-traveller`, `plugin-stub`,
`content`, `ui-shared`, `ui-phone`, `sim`, `content-lint`.

## Style
- Engine code: pure functions, framework-free, seeded RNG via named streams only —
  no `Math.random` in `packages/engine` (lint enforces).
- Player-visible text follows `docs/design/maggie-voice.md`: TTS-safe plain
  sentences, no markup, no exclamation points.
- Match surrounding code's idiom. Conventional commit message, one line of plain
  English first.

## Forbidden — escalate instead of doing any of these
- Modifying the packet's `acceptance_tests` files, or deleting/skipping/weakening
  any test.
- Changing public interfaces, schemas, or fact kinds; adding dependencies.
- Writing to the ledger from anywhere but the phase-engine interpreter (INV-6) —
  emit proposals instead.
- Importing from `plugin-traveller/` or `content/` inside `packages/engine` (INV-1).
- Touching `Visibility` handling, CI config, crypto, or secrets unless the packet
  names them in `owned_paths`.
- Parsing rendered text back into facts (INV-12).
- Anything outside `owned_paths` or the packet's scope.

## Escalation
Stop after two failed attempts, or immediately on hitting a forbidden boundary or a
genuine ambiguity. Format: `task id | location | reason | 1–2 proposed options`.

## Report (end of packet, no narrative)
Task id, result, commit hash, verification output, assumptions, risks.
