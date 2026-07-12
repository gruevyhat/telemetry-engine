# TELEMETRY ENGINE — Software Development Plan
**Short name:** the Plan · **Status:** v1.0 · **Companions:** the Spec (telemetry-engine-spec.md, authoritative on *what*), the rulebook (authoritative on *player experience*). The Plan is authoritative on *how we work*. Where the Plan and the Spec disagree on technical content, the Spec wins; file a Plan bug.

**Audience:** implementing agents — primarily LLM coding sessions (Claude Code or similar) supervised by the project owner. The Plan assumes the implementer has no memory between sessions and therefore encodes process as checklists and templates, not culture.

---

## 1. ROLES AND AUTHORITY

| Role | Who | Authority |
|---|---|---|
| **Owner** | the human maintainer | approves milestone gates, spec amendments, dependency additions, test weakenings; writes retros; final word everywhere |
| **Implementer** | an LLM coding session (or the owner) | executes exactly one task per session-thread; may extrapolate where the Spec is silent **only** with a written note (Spec §21.5.3) |
| **Reviewer** | the owner, optionally assisted by a second LLM session in review-only mode | operates the PR gate (§6) |

An implementer session that cannot complete its task within scope **stops and writes a handoff** (§4.4). It never expands scope to "get something working."

---

## 2. REPOSITORY PROCESS BASICS

- **Branching:** trunk-based. `main` is always green. One long-lived branch per milestone (`milestone/M0`, `milestone/M1`, ...) — not one branch per task. Each task still lands as its own red-then-green commit pair on the milestone branch; only the PR cadence changed (below), not how a task is built.
- **Commits:** conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`). Every commit compiles and passes the unit suite. Test-first commits are explicitly ordered: the failing-test commit (`test: add failing INV-3 replay property`) precedes the implementation commit.
- **PRs:** one milestone = one PR (`milestone/M0 → main`), opened once every task in the milestone is done and its acceptance list (§21.3) is met — not one PR per task. Run the full local gate after every task's green commit regardless; CI also runs on every push to a `milestone/*` branch, so defects surface immediately rather than waiting for the milestone PR. The PR template (§6.1) is mandatory and now covers every task landed in the milestone; CI rejects PRs whose description omits required sections.
- **CLAUDE.md at repo root** distills this Plan's session protocol, the Spec's Do-not list, and the command reference (§3) into the standing instructions every agent session loads. The Plan is the source; CLAUDE.md is the cache. When the Plan changes, updating CLAUDE.md is part of the same PR.

## 3. COMMAND REFERENCE (single source of truth for tooling)

```
pnpm i                  # install
pnpm test               # unit + property + snapshot (PR gate)
pnpm test:integration   # phase-script fixtures
pnpm test:e2e           # Playwright smoke against the built Pages artifact
pnpm lint               # eslint + the no-ledger-writes-outside-interpreter rule (INV-6)
pnpm lint:content       # content-lint package (Spec §19)
pnpm sim:smoke          # 50-campaign smoke (fast; PR gate when content changes)
pnpm sim:full           # 1,000-campaign metrics (nightly / milestone gate)
pnpm build:stub         # engine + stub plugin build (INV-1; PR gate)
pnpm build:pages        # shared-screen production bundle for GitHub Pages
pnpm demo:m0            # serve the built M0 demo locally at the Pages base path
pnpm dev:shared / dev:phone   # UI shells
```

Implementers MUST use these scripts, never raw tool invocations, so gate behavior is identical locally and in CI.

---

## 4. THE TDD LOOP — HOW EVERY TASK IS EXECUTED

Every task ships tests before implementation. The loop, mechanically:

1. **Read.** Session start protocol (§4.3). Identify the task's Spec sections and its listed invariants.
2. **Red.** Write the tests the task card names (§5 tables): property tests for its INVs, unit tests for its behaviors, a snapshot if it renders. Run `pnpm test`; confirm the new tests **fail for the intended reason** (a test failing due to a typo is not red). Commit: `test: ...`.
3. **Green.** Implement the minimum that passes. No speculative generality. Run the full PR-gate suite locally. Commit: `feat: ...`.
4. **Refactor.** Only with green tests, only within task scope. Commit separately.
5. **Trace check.** If the task touches how The Skim flows through the system, update Spec Appendix A in the same commit (Spec §21.5.5).
6. **Record, don't PR yet.** Write the task's extrapolations, do-not compliance, and INV coverage into the green commit's message — same content the old per-task PR description held. When the milestone's last task lands, **open one PR** (`milestone/M0 → main`) using the template, rolling up every task's commit-message notes into its sections. Fill every section honestly; "none" is an acceptable answer, silence is not.

**Hard rules (restating Spec §21.5, because they gate merges):** tests are never deleted, skipped, or weakened except in a commit the owner approves whose message says so · no new `packages/engine` dependencies without owner sign-off · extrapolations beyond the Spec are recorded in the task's commit message (and rolled up into the milestone PR's *Extrapolations* section) — an unrecorded correct guess is still a defect.

### 4.3 Session-start checklist (paste into every implementer session)
1. Read CLAUDE.md.
2. Read your task card (§5) and every Spec section it references. Read Spec Appendix A.
3. Read `docs/handoffs/` entries for this task, if any.
4. State back, in one paragraph, the task's deliverable, its INVs, and its Do-nots. If this paragraph conflicts with the task card, stop and flag.
5. Begin at Red.

### 4.4 Session-end handoff (mandatory when a task spans sessions)
Write `docs/handoffs/<task-id>-<n>.md`: state of the branch · what's red/green · decisions made and their Spec basis · extrapolations so far · exact next action. A handoff an unfamiliar session can resume from is part of the definition of done for the *session*, even when the task is unfinished.

### 4.5 Stop conditions — the implementer halts and asks the owner when:
- The Spec is silent and the nearest *Why* supports two materially different implementations.
- Any gate would require weakening a test.
- A task needs a new dependency, a schema change, or touches `Visibility` handling in any way not named on its card.
- Estimated diff exceeds ~600 changed lines — the task was mis-scoped; split it, don't push through.

---

## 5. WORK BREAKDOWN

Tasks are sized for one focused session (≤ ~600 changed lines including tests). M0–M1 are broken down fully now; M2–M5 are epic-level and get task breakdown at milestone planning, informed by the prior retro (§8). Task cards live in `docs/tasks/` as files with this front-matter: `{id, title, spec_refs[], invariants[], tests_first[], done_when[], do_not[]}`.

### Demo at every milestone

Every milestone MUST end with a runnable demo of the capability that milestone adds. A local demo is the minimum acceptable form; a hosted build MAY supplement it but MUST NOT be required to prove the milestone. The demo must use shipped UI and content, exercise the milestone's defining path end to end, and be repeatable from a clean checkout with documented commands and a short walkthrough under `docs/demos/M<n>.md`. The owner runs that walkthrough before the milestone PR opens and records the outcome in the retro. Passing automated gates without a runnable demo does not close a milestone.

### M0 — the spine
| ID | Task | Spec | INVs | Tests first |
|---|---|---|---|---|
| M0-01 | repo scaffold, packages, CI skeleton, stub plugin, lint rules | §1 | 1, 6 | stub build passes; lint rule catches a planted illegal ledger write |
| M0-02 | ledger: Fact types, kind registry, append, ulid ordering | §2 | 2 | append-only property; correction supersedes |
| M0-03 | reducers + memoized projections (funds, positions, clocks) | §2, §5 | 3, 7 | replay determinism over 100 seeds; clock = tick-sum property |
| M0-04 | time model + GameTime advancement rules | §3.1 | — | only-interpreter-advances-time property |
| M0-05 | RNG named streams | §6 | — | stream independence: extra draw on A leaves B's sequence intact |
| M0-06 | phase interpreter: step kinds, transitions-as-facts, resume-from-save | §4 | 6 | scripted fixture turn; kill-and-resume mid-step equals uninterrupted run |
| M0-07 | hotseat shell: shared screen skeleton + interstitial private view | §16 | 13 (hotseat form) | interstitial never renders another player's `private` slice (component test) |
| M0-08 | save/load/export blob | §18 | 3 | load(export(x)) replays byte-identical |
| M0-09 | demo turn content: one scripted DOCKSIDE→ARRIVAL with canned facts | §4, §19 | — | content-lint passes; integration fixture green |
| M0-10 | deploy pipeline: GitHub Pages | §0, Plan §6.1 | — | main-only deploy contract; built Pages bundle boots in Playwright |

**M0 exit demo:** launch the shared-screen build locally, pass the device through the hotseat interstitial, and advance the canned turn from DOCKSIDE through ARRIVAL while the fact ticker updates. The hosted Pages build is useful evidence, but the local walkthrough is the required floor.

### M1 — a playable solo game
| ID | Task | Spec | INVs | Tests first |
|---|---|---|---|---|
| M1-01 | economy: market.tick reducer, drift, `marketAt(hex, day)` | §7 | 9 | time-travel property: remote view = historical local view |
| M1-02 | information-horizon feed rendering with staleness tags | §7.2, §14 | 9 | snapshot per staleness band |
| M1-03 | slot composer + proposal/surface contract | §8.1 | — | composer emits no prose (type-level + test) |
| M1-04 | validator passes 1–4 (schema, referential, reachability, timeline) | §9 | 5 partial | planted-contradiction corpus all rejected |
| M1-05 | incident frames: load, fire, innocent-twin instantiation, cooldowns | §8.2–8.3 | 10 | dual-surface property on twin-only path; recurrence counter |
| M1-06 | oracle with ledger veto | §8.4 | — | contradiction-forcing property; ladder math units |
| M1-07 | evidence queries: FactSelector eval, access gate, Effect-ranked reveal, atomic day cost | §10.1 | 11 | atomicity under injected failure; selector lint corpus |
| M1-08 | NPC crew: policy tables, interrogation ladder | §12 | — | seeded NPC decisions deterministic; ladder maps Effect→truthfulness units |
| M1-09 | template renderer + grammar helpers + TTS flag | §14 | 12 | snapshots; TTS-safety lint (no markup in announce templates) |
| M1-10 | degradation ladder | §17 | 14 | chaos-content suite reaches a playable step at every rung |
| M1-11 | trade frame content v1: decks, slots, generic family incidents | §19 | — | content-lint + `sim:smoke` |
| M1-12 | sim harness v1: bot policies, metric collection | §21.4 | 5, 10 | brute-force-inference bot cannot uniquely attribute any incident |

**M1 exit demo:** the owner plays a full 4-turn solo cycle by hand, start to Obligation payment, using only the locally launched shipped UI and content. Fun is assessed at the retro; mechanics are assessed by the gate.

### M2–M5 — epics (task breakdown at each milestone planning)
- **M2 the social game:** agenda deal + commitment facts · comms-window queue/shuffle/fizzle (Spec §3.3) · confrontation sub-script · envelope/forfeit/deferred-reveal · WebRTC transport + QR pairing + timer pause · commit-reveal (INV-8) · referee-scope encryption at rest (§16) · sim bots gain accuse/vote policies; misattribution tuning begins.
- **M3 Traveller plugin:** character import (travtools JSON round-trip) · SEC sector import + TravelModel · trust mode · career edges · INV-9 over real sector data.
- **M4 exploration + props:** fog visibility on hexes · survey charters frame · print pack pipeline (HTML print stylesheet; manifest-with-embedded-skim first).
- **M5 full pillar set:** engagement resolver (§13) · heat + legends with reverse validation (§11) · LLM renderer behind flag with entity guard; sim parity run (metrics identical LLM on/off).

**Required exit demos:** M2 runs one local three-seat comms-to-accusation scene with paired phones · M3 imports a sample character and sector, then completes one locally rendered trade turn with historical remote pricing · M4 completes one survey-charter loop and produces its local print preview · M5 runs one local cross-pillar session that reaches trade, exploration, espionage, and engagement without leaving the shipped UI. Each walkthrough is narrowed and finalized during that milestone's task breakdown, but it may not be removed.

---

## 6. REVIEW GATES

### 6.1 PR gate (one PR per milestone, `milestone/M<n> → main`)
**Automated, on every push to a `milestone/*` branch (not just at the final PR):** `pnpm test` · `pnpm lint` · `pnpm build:stub` (INV-1) · `pnpm lint:content` and `pnpm sim:smoke` when `content/` changed · diff guard flags test deletions/`.skip`/threshold edits for mandatory owner review. This means defects surface task-by-task even though the PR itself only opens once, at milestone end.
**PR template (all sections required; each section rolls up every task landed in the milestone — repeat the section's shape once per task, e.g. "M0-01: ...", "M0-02: ..."):**
```
## Task
<milestone id and the tasks it bundles, one line each>
## Spec sections implemented
## Invariants covered (tests listed)
## Tests-first evidence
<per task: hash of its red commit>
## Extrapolations beyond the Spec
<each: the silence, the choice, the Why it extrapolates from — or "none">
## Do-not compliance
<each task's do_nots, each with "respected" or explanation>
## Appendix A impact
<updated / not touched, and why>
```
Each section leads with one plain-English sentence — what actually changed or what actually happens — before citing Spec sections or invariant codes; a citation is not an explanation. Gloss any invariant code in a few plain words on first use in the PR. Avoid unexplained jargon/shorthand; define it inline or say the plain thing instead. A PR description is written for a human inspecting the change, not just an implementer holding the Spec in their head.

**Reviewer checklist:** every task's red commit genuinely precedes its green commit · tests assert behavior, not implementation details · no engine→plugin/content imports · visibility handling untouched or explicitly on-card · extrapolations are sound and now candidates for Spec amendments · prose in templates is TTS-safe · PR description is legible without the Spec memorized (plain-English lead sentences, jargon defined on first use).

### 6.2 Milestone gate (owner, manual)

Runs the Spec §21.3 acceptance list for the milestone · runs the milestone's local demo from a clean checkout using `docs/demos/M<n>.md` and records pass/fail plus observations · `pnpm sim:full` within §21.4 thresholds (from M2 onward) · any additional live manual script (M1: the solo cycle; M2: the rulebook §14 transcript re-enacted with three humans or three owner-driven seats) · docs current: Spec amendments merged, CLAUDE.md synced, no orphan handoffs. A hosted demo may be added, but local launch and completion of the documented walkthrough are mandatory. This gate and the §6.1 PR gate now happen together, since the milestone PR only opens once the milestone is done. **A milestone does not close until its demo passes and its retro (§8) is written.**

---

## 7. DEFECT AND AMENDMENT FLOW

Bugs found post-merge get a failing regression test *before* the fix (same red/green discipline). Spec silences discovered during implementation become either a Spec amendment PR (owner-approved, version-bumped) or an entry in Spec §24 Open Questions — extrapolation notes from PR descriptions are triaged into one of the two at each retro, so the Spec monotonically absorbs the project's discovered knowledge.

---

## 8. RETROSPECTIVES — ONE PER MILESTONE, MANDATORY

Written by the owner after the milestone gate, before planning the next. File: `docs/retros/M<n>.md`. Template:

```
# Retro M<n> — <date>
## Outcome vs. plan
<tasks planned/added/dropped; where estimates of task size failed>
## What the gate caught / what it missed
<defects by discovery point: red-phase, PR gate, milestone gate, after — misses indicate a gate hole>
## Spec health
<amendments merged this milestone; extrapolation notes triaged (count in → amendments/open-questions out);
 sections implementers repeatedly misread — rewrite candidates>
## Process health (LLM-implementer telemetry)
<stop-conditions triggered and whether correctly; handoff quality; test-weakening requests;
 avg diff size vs. 600-line ceiling; sessions per task>
## Sim/quality trend
<21.4 metrics vs. last milestone; degradation-event rate; determinism incidents>
## Fun check (M1 onward)
<the honest paragraph: did the owner want to play the next turn? what dragged?>
## Actions
<each: change, owner, lands-by (next milestone at latest); Plan/CLAUDE.md edits made in this PR>
```

Retro actions that change process are edited into the Plan and CLAUDE.md **in the retro PR itself** — a retro whose actions live only in the retro file has not happened.

---

## 9. SCHEDULE POSTURE AND SCOPE DEFENSE

No calendar dates: this is a milestone-sequenced solo-plus-agents project, and pretending otherwise manufactures fake urgency. Sequence is fixed (M0→M5), the falsifiable bet is unchanged — **if M1's solo trade loop isn't fun with templates and one clock, stop and redesign before M2** — and the standing scope rule carries over from the rulebook one-pager: any feature that can't be expressed as a MAGGIE announcement or absorbed into the player-facing Rules 1–6 is expansion content, not core, no matter how good the idea is at 1 a.m.

---

*The Plan is executed one task card at a time. If a session is reading this document and doesn't know what to do next: read CLAUDE.md, open `docs/tasks/`, take the lowest-numbered unclaimed card in the current milestone, and begin at §4.3 step 1.*
