# PROJECT.md — Telemetry Engine

## Objective
A GM-less, event-sourced tabletop game referee: TypeScript, static-hosted, no
backend. The load-bearing component is the append-only, visibility-scoped Fact
Ledger; everything else reads facts, proposes facts, or scopes facts. Authoritative
docs: Spec `docs/telemetry-engine-spec.md` (invariants INV-1..14), Plan
`docs/telemetry-engine-dev-plan.md`, rulebook, `docs/design/`.

## Current milestone
M2 — the social game (agenda deal, comms-window queue, forced confrontation opens,
envelope/forfeit/deferred-reveal, WebRTC transport + QR pairing, commit-reveal,
referee-scope encryption at rest; Plan §5). M2's task cards (M2-00..M2-15) live on
`milestone/M2`, which is grandfathered on the old branch model: it finishes with one
milestone-end PR to `main` (Spec §21.3 acceptance + M2 demo first) — the only PR
this project opens. Everything else lands directly on `main`.

## Constraints
- Milestone acceptance, security policy, and release authorization are the human
  owner's alone.
- The M2 PR (and any commit message) opens with plain-language summary sentences
  before structured detail; gloss invariant codes on first use (INV-2 (append-only),
  not bare INV-2).
- Plan §9's falsifiable bet: "if M1's solo trade loop isn't fun with templates and
  one clock, stop and redesign before M2." The M1 retro (Action 5) left the owner's
  answer open when M2 planning began 2026-07-18.

## Non-goals
- No backend, no transcription/evaluation of spoken play (INV-12 territory), no
  parsing rendered text back into facts.

## Decisions
- 2026-07-18 — M1 shipped to `main` (PR #7); follow-up PR #8; retro Actions 1-4 in PR #9.
- 2026-07-19 — Always-shippable trunk from M3; M2 grandfathered on `milestone/M2` — seven ceremony PRs (#8-14) in one day showed per-fix branches/PRs were waste.
- 2026-07-25 — Adopted two-tier contract method (frontier lead/integrator + Haiku worker, Gemma pre-flight); method in `docs/two-tier-method/`, skill installed at `.claude/skills/two-tier-method/` — replaces implementer-session protocol, handoff files, and red/green commit pairs (lead commits acceptance tests at dispatch; packet lands as one integrator-merged commit).
- 2026-07-25 — GPT-OSS dropped from the roster entirely; Haiku is the only worker tier.
- 2026-07-25 — Pre-flight model pinned to `gemma4:12b`, verified locally on a dispatch-gate lint (~53s, ~11 tok/s); call the Ollama HTTP API on :11434 — `ollama run` hangs in headless shells.
- 2026-07-25 — Task cards carry a `status:` frontmatter field; the board is `grep -i status docs/tasks/*.md`. M0/M1 cards and BL-01 (art pass, merged PR #13) backfilled `done`; remaining backlog cards `ready`. The nine untracked timestamped PNGs in `docs/img/` are rejected generation batches from BL-01, safe to delete.
