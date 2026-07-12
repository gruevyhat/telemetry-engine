# CLAUDE.md — Telemetry Engine

You are an implementer session on Telemetry Engine: a GM-less, event-sourced tabletop game referee. TypeScript, static-hosted, no backend. The load-bearing component is the append-only, visibility-scoped **Fact Ledger**; everything else reads facts, proposes facts, or scopes facts.

## Document map and precedence
1. **the Spec** — `docs/telemetry-engine-spec.md` — authoritative on *what to build*. Invariants are tagged [INV-1..14].
2. **the Plan** — `docs/telemetry-engine-dev-plan.md` — authoritative on *how we work*. This file is the Plan's cache; if they disagree, the Plan wins and fixing this file is part of your PR.
3. **rulebook** — `docs/telemetry-engine-rulebook.md` — authoritative on player experience.
4. Design inputs: `docs/design/fact-kinds-v0.md` (the kind catalog + `implies` map), `docs/design/sim-bot-policies.md`, `docs/design/maggie-voice.md` (mandatory for any content/template text).

## Session protocol (always, in order)
1. Read this file. Read your task card in `docs/tasks/`. Every Spec section the card references. Read Spec Appendix A (The Skim trace).
2. Read `docs/handoffs/<your-task-id>-*.md` if present.
3. State back in one paragraph: deliverable, invariants, do-nots. If your paragraph conflicts with the card, STOP and flag — do not begin.
4. Work the TDD loop (Plan §4): **red first** (failing tests, committed, failing for the intended reason) → green (minimum to pass) → refactor → Appendix A check. Commit both on the current milestone branch (see Branching and PRs below) — no PR yet.
5. If the task spans sessions, write `docs/handoffs/<task-id>-<n>.md` before ending: branch state, red/green status, decisions + Spec basis, extrapolations, exact next action.

## Branching and PRs
One long-lived branch per milestone (`milestone/M0`, `milestone/M1`, ...), not one branch per task. Each task still lands as its own red-commit-then-green-commit pair on that branch, with the same TDD discipline as always — the only thing that changed is *when a PR opens*, not how a task is built or committed. Run the full local gate (`pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build:stub`) after every task's green commit, same as before; CI also runs on every push to a `milestone/*` branch so we're not flying blind until the end. Every milestone ends with at least a locally runnable demo using the documented `docs/demos/M<n>.md` walkthrough (Plan §6.2). Open exactly one PR, `milestone/M0 → main`, only when every task is done, the milestone acceptance list (Spec §21.3) is met, and that demo passes. That PR's template covers every task landed in the milestone (each required section lists per-task detail, not just one task's).

## Commands (never invoke tools raw)
`pnpm test` · `pnpm test:integration` · `pnpm test:e2e` · `pnpm lint` · `pnpm typecheck` · `pnpm lint:content` · `pnpm sim:smoke` · `pnpm sim:full` · `pnpm build:stub` · `pnpm build:pages` · `pnpm demo:m0`

## Hard rules — violations are defects even when the code works
- Tests are never deleted, skipped, or weakened except in an owner-approved commit that says so in its message.
- Nothing writes to the ledger except the phase-engine interpreter (INV-6). Everything else emits proposals.
- No imports from `plugin-traveller/` or `content/` anywhere in `packages/engine` — not types, not tests, not temporarily (INV-1).
- Do not touch `Visibility` handling unless your task card names it.
- No new dependencies in `packages/engine` without owner sign-off.
- Rendered text is presentation only; it is never parsed back into facts (INV-12). The app never transcribes or evaluates spoken play.
- Where the Spec is silent: extrapolate from the nearest *Why* and record it in your PR's Extrapolations section. An unrecorded correct guess is a defect.
- New fact kinds go through `docs/design/fact-kinds-v0.md` first (catalog PR), then code.

## Stop and ask the owner when
- The Spec is silent and two materially different implementations both fit the nearest *Why*.
- A gate would require weakening a test.
- Your task needs a new dependency, a schema change, or un-carded Visibility work.
- Your diff will exceed ~600 changed lines including tests — the task is mis-scoped; split it, don't push through.

## Style
- Engine code: pure functions, framework-free, seeded RNG via named streams only — no `Math.random` anywhere in `packages/engine` (lint enforces).
- Any player-visible text: follow `docs/design/maggie-voice.md`. TTS-safe: plain sentences, no markup, no exclamation points.
- Conventional commits; the failing-test commit precedes the implementation commit.

## PR and commit description style
PR descriptions and commit messages are read by humans inspecting the change, not just by implementers who already hold the Spec in their head. Write for that reader:
- Every PR opens with a `## Summary`: 2-4 plain-language sentences on what the PR accomplishes, before any of the template's structured sections. A reader should be able to stop after the Summary and already know what happened.
- Lead every section with one plain-English sentence: what actually changed, or what actually happens, *before* citing a Spec section or invariant code. A citation is not an explanation.
- On first use in a PR, gloss any invariant code in a few plain words — `INV-2 (append-only: nothing mutates or deletes a fact once written)`, not a bare `INV-2`.
- Avoid unexplained jargon and internal shorthand ("supersession", "closure", "the v0 catalog," rule names) — either define it inline on first use or just say the plain thing instead of the term.
- Prefer a concrete example or before/after over an abstract description when one is available.
- Extrapolation notes should read as a short, followable account — what was ambiguous, what you chose, why — not a compressed citation trail.

## Current milestone
M0 — the spine. Take the lowest-numbered unclaimed card in `docs/tasks/M0-*.md`. M0-00 is an owner decision (licenses); skip it unless you are the owner.
