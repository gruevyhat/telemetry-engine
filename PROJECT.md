# PROJECT.md — Telemetry Engine

## Objective
A GM-less, event-sourced tabletop game referee: TypeScript, static-hosted, no
backend. The load-bearing component is the append-only, visibility-scoped Fact
Ledger; everything else reads facts, proposes facts, or scopes facts. Authoritative
docs: Spec `docs/telemetry-engine-spec.md` (invariants INV-1..14), Plan
`docs/telemetry-engine-dev-plan.md`, rulebook, `docs/design/`.

## Current milestone
Between milestones. M2 (the social game) merged to `main` 2026-07-25 via PR #15 —
the project's only milestone PR; from here on, always-shippable trunk, everything
lands directly on `main` as red/green commit pairs with per-task commit scopes
(Plan §4). M3 (import & interop) is not yet decomposed. Before M3 planning starts,
the gating backlog item is BL-10 (phone client never retries phone→host messages —
pairing deadlocks on real transport; frontier work), which also blocks the deferred
M2 real-device walkthrough (Action 2) and BL-02.

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
- 2026-07-25 — `milestone/M2` merged with `main` (two-tier method adoption) to close a 79-ahead/25-behind divergence; conflicts in `CLAUDE.md`/`AGENTS.md` resolved by taking `main`'s versions whole (they already carry the M2-grandfather exception); `docs/telemetry-engine-dev-plan.md` resolved by keeping the M2 branch's completed per-task table plus `main`'s M3-M5 epic bullets; `docs/telemetry-engine-rulebook.md` resolved by keeping both sides' additions (art image insert). Full local gate run against the merged branch: `pnpm test` (81 files/410 tests), `pnpm lint`, `pnpm typecheck`, `pnpm build:stub`, `pnpm lint:content`, `pnpm sim:smoke` all clean; `pnpm test:integration` still fails on the pre-existing BL-08 defect (confirmed identical failure, unrelated to the merge). M2 is otherwise gate-green; closure still needs the owner's real-device walkthrough (Plan §6.2), BL-02's browser-support decision, and an M2 retro before the milestone PR opens.
- 2026-07-25 — BL-02 (iOS Safari WebRTC/wake-lock support-matrix decision) explicitly deferred, not blocking the M2 PR: the owner has no iPhone to test on. Left `ready`; the M2 PR proceeds on its other two closure conditions (real-device walkthrough, M2 retro). Close BL-02 whenever a device (own, borrowed, or a remote device-cloud session) becomes available — do not decide it from caniuse alone or from optimism per the card's own guard.
- 2026-07-25 — Discovered `milestone/M2`'s CI `gate` job (`pnpm test`) has been failing on every push since 2026-07-19T20:18, unnoticed because M2 never opened a PR. Root cause not yet fixed: a jsdom/Node realm mismatch in `SubtleCrypto.importKey`, surfacing only under CI's now-forced Node 24, affecting `SocialApp.test.tsx`/`social-scene.e2e.test.tsx` (both `@vitest-environment jsdom`) but not `packages/transport/src/protocol.test.ts`'s plain-node crypto unit/property tests, which pass everywhere — the crypto logic itself is not implicated, this is a test-environment portability bug, not a shipped-product defect. Filed as `docs/tasks/BL-09.md`; genuinely blocks the M2 PR per Plan §6.1's automated-gate requirement, unlike BL-02/BL-07/BL-08.
- 2026-07-26 — BL-09 fixed and closed (`status: done`): `bufferOf()` in `packages/transport/src/index.ts` now returns a `Uint8Array<ArrayBuffer>` copy instead of a raw `ArrayBuffer` — TypedArray views satisfy WebCrypto's `BufferSource` structurally (`ArrayBuffer.isView`) rather than via realm-bound `instanceof`, so they cross the jsdom/Node realm boundary that was rejecting plain `ArrayBuffer`s under Node 24. Added `packages/transport/src/protocol.jsdom-env.test.ts` to pin the round trip under the same jsdom environment as the previously-red specs. Fixing this required touching WebRTC-transport crypto code, so it stayed frontier work per CLAUDE.md's routing rule rather than a Haiku packet. Pushed to `milestone/M2` (commit `0a542d1`) and confirmed green in actual CI (Node 24): `pnpm test` now passes. `pnpm test:integration` still red on the separate, already-filed BL-08 defect — confirmed byte-identical failure before and after this fix, so unrelated to BL-09's scope. `milestone/M2`'s `gate` job's `pnpm test` step is unblocked for the eventual M2 PR.
- 2026-07-26 — Second `main` merge into `milestone/M2` (commit `768eb16`), closing the 1-ahead/86-behind gap `main` had opened since the 2026-07-25 merge (M2's own BL-02 deferral line vs. `main`'s independently-committed identical line). Only `PROJECT.md` conflicted; resolved by keeping the fuller M2-branch history and dropping `main`'s duplicate BL-02 entry. Full local gate re-run on the merged tree: `pnpm test` (82 files/411 tests), `pnpm lint`, `pnpm typecheck`, `pnpm build:stub`, `pnpm lint:content` all clean; `pnpm test:integration` fails identically to the already-filed BL-08 defect (same assertion, same test, confirmed unrelated to the merge). The owner has reviewed the M2 retro's real-device-walkthrough deviation (Plan §6.2, deferred indefinitely, no test device available) and directed opening the milestone PR now rather than waiting on it; the retro's 7 proposed actions remain untriaged pending the owner's review of the PR itself. Milestone-end PR (`milestone/M2` → `main`) opened per this decision.
- 2026-07-25 — M2 shipped: PR #15 (`milestone/M2` → `main`) merged by the owner. Real-device walkthrough still outstanding (deferred, not waived).
- 2026-07-25 — First real-browser run of the shipped app (post-merge): shared screen, pairing cards, QR/manual codes, and phone claim UI all render and behave correctly, but pairing deadlocks — filed as BL-10 after full root-cause: phone's one-shot `pair.claim` fires before any WebRTC peer exists, trystero's `action.send` silently drops on zero peers, host is purely reactive, nothing retries. Verified healthy underneath: relays deliver ephemeral signaling events (Node repro, 4/5 relays for appId `telemetry-engine`), ICE gathers, clean two-tab discovery fires `onPeerJoin` in ~500 ms. Tests missed it because the fake hub is synchronous and pre-connected. screens-v2's protocol table already prescribes the retry semantics; BL-10 is implementation debt, frontier-routed (WebRTC transport).
- 2026-07-25 — M2 retro triaged by the owner (all 7 actions + BL-10 added as Action 8; dispositions inline in docs/retros/M2.md). Landed in the same commit per Plan §8: `vote.cast` host-derived authority context → Spec §16; operator-declared-disconnect-over-ICE-timeout → screens-v2 §5; per-task commit-scope rule → Plan §4. Sequencing: BL-10 → desktop three-tab pairing re-check → real-device walkthrough + BL-02.
- 2026-07-25 — BL-10 fixed and closed (two red/green pairs on `main`): channel-level send buffering in `transport-webrtc` + phone re-claims every 1s until the first snapshot. The three-tab real-browser pairing check passes — shared screen reached "Deal agendas" with all three seats claimed near-simultaneously over real trystero signaling. Residual left on the card for owner disposition: post-connection resend-until-ack for comms.queue/vote.cast (screens-v2 table) not implemented; reading taken is that reliable data channels + M2-13 reconnect-snapshot cover it. Real-device walkthrough (M2 retro Action 2) and BL-02 are now unblocked.
