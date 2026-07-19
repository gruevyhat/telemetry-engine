# TELEMETRY ENGINE — Implementation Specification
**Short name:** the Spec · **Status:** v0.2 · **Supersedes:** telemetry-engine-tdd.md (v0.1)
**Audience:** implementing agents, human and LLM. Significant portions of this project will be built by weaker models under supervision. The Spec is therefore written to be *executed*, not just read: every load-bearing module carries a *Contract*, explicit *Invariants*, a *Why* (so an implementer who hits an unspecified case can extrapolate the intent instead of guessing), a worked *Example*, and *Do-not* items naming the tempting wrong turns.

**Conventions.** MUST/SHOULD/MAY per RFC 2119. `code` identifiers are normative names. "Content" means data files under `content/`; "engine" means code under `packages/engine`. A requirement tagged **[INV-n]** is a testable invariant; the Test Plan (§21) enumerates all of them.

---

## 0. BLUF AND READING ORDER

Telemetry Engine is an **event-sourced game referee**. The load-bearing component is the **Fact Ledger** (§2) — an append-only, visibility-scoped event log from which all state derives. Everything else reads facts, proposes facts, or scopes facts. Verisimilitude is implemented as referential integrity; deduction gameplay is visibility scoping; the black box is a formatting pass over the full ledger.

**Reading order for implementers:** §2 (ledger) → §3 (time) → §4 (phases) → the module you're assigned → §21 (your test obligations) → Appendix A (the worked example, which shows every subsystem touching one incident).

**Stack:** TypeScript · Vite · React for UI shells · engine core as a pure, framework-free TS package · IndexedDB persistence · WebRTC (trystero) for phone transport · seeded PRNG (xoshiro128) with named streams. Static deploy (GitHub Pages); **no backend in any base-game path.**

**Goals:** deterministic, replayable core · engine/content IP separation enforced by CI · complete offline table play · phones receive only their visibility slice · simulation-testable balance · **MAGGIE is never speechless** (§17).
**Non-goals (v1):** servers, accounts, remote play, embedded map rendering, LLM as a required dependency.

---

## 1. REPOSITORY LAYOUT — THE IP BOUNDARY

```
telemetry-engine/
├── packages/
│   ├── engine/            # 100% owned IP. Zero setting content. Zero Traveller terms.
│   │   ├── ledger/  phases/  clocks/  rng/  time/  oracle/
│   │   ├── economy/  generate/  validate/  render/  evidence/
│   │   ├── agenda/  legends/  npc/  engagement/  degrade/
│   │   └── plugin-api/
│   ├── plugin-traveller/  # Fair Use Policy layer; Mongoose disclaimer in README
│   ├── ui-shared/  ui-phone/
│   ├── content-lint/      # §19; runs in CI
│   └── sim/               # §21.4
├── content/               # frames, incident decks, agenda decks, slot tables, phase scripts
└── LICENSE.engine / LICENSE.content / NOTICE.traveller
```

**[INV-1]** `packages/engine` MUST compile and pass its full suite with `plugin-traveller` deleted (CI builds engine + a stub plugin). *Why:* this check **is** the IP strategy — the owned layer provably stands alone.
**Do not:** import from `plugin-traveller` or `content/` anywhere inside `engine/`. Not for types, not for tests, not "temporarily."

---

## 2. FACT LEDGER

### 2.1 Contract
Append-only event log. A **Fact** is an immutable statement about the world with provenance and visibility. All game state (funds, positions, clocks, markets, inventories) is derived by pure reducers over the fact stream and memoized.

```ts
type FactID = string;                 // ulid: time-sortable, unique
type ActorRef = { kind: 'pc'|'npc'|'world'|'referee'; id: string };

interface Fact {
  id: FactID;
  t: GameTime;                        // §3: {day:number, slot:BeatSlot}
  wall: number;                       // real timestamp, black-box only
  kind: string;                       // namespaced: 'cargo.loaded', 'lock.cycled', 'check.reported'
  actor: ActorRef;                    // GROUND TRUTH of who did it — not what the table believes
  payload: Record<string, unknown>;   // schema per kind, registered in ledger/kinds.ts
  visibility: Visibility;
  causes?: FactID[];                  // provenance chain
  frame?: string;                     // originating incident frame id, if any
}

type Visibility =
  | { level:'public' }                        // ticker + all clients
  | { level:'table' }                         // shared screen only
  | { level:'private'; playerIds: string[] }  // scoped phones
  | { level:'referee' };                      // ground truth; black-box only
```

### 2.2 Invariants
**[INV-2]** Append-only. Corrections are new facts (`kind:'correction'`, `causes:[oldId]`). Reducers MUST apply corrections by superseding, never by mutation.
**[INV-3]** Replay determinism: `derive(facts)` run twice, or on another machine, yields byte-identical state. A save is `{schemaVersion, seedState, facts[], contentHashes}`; load replays and MUST fail loudly on mismatch.
**[INV-4]** Visibility never narrows. Facts widen (via `kind:'reveal'` facts) or stay; nothing un-reveals.
**[INV-5]** Every non-`referee` fact must be safe to show at its level without uniquely implying a `referee`-scoped cause (enforced by §9's ambiguity check at proposal time).

### 2.3 Why event sourcing
Deduction gameplay *is* provenance queries: "who cycled the lock?" is a fact lookup behind an access check. Replay gives free regression testing. The append-only ticker and auditable secret rolls (§6) are trust features that fall out of the model. The cost — reducer discipline — is small at this size (a campaign is thousands of facts, not millions).
**Do not:** introduce any mutable store "for performance." Memoize projections instead. **Do not** let rendered prose be re-ingested as fact (§14 is a one-way door).

### 2.4 Example
See Appendix A for The Skim expressed as a 14-fact sequence from comms-window action to black-box reveal. Implementers of any ledger-adjacent module should be able to trace their module's touchpoints in it.

---

## 3. TIME AND ORDERING

### 3.1 Game time
`GameTime = { day: number, slot: BeatSlot }` where `BeatSlot ∈ {DOCKSIDE, COMMS, TRANSIT, ARRIVAL, DOWNTIME}`. Day-granular; intra-day sequence is fact order (ulid). Only the **phase engine** advances time: beats advance `slot`; TRANSIT advances `day += 7`; each evidence action advances `day += 1`. In-fiction clock-times in narration ("0340 ship time") are payload flavor, not the time model.
*Why day-granular:* alibi play needs "who was where *that day/beat*," not minute-resolution simulation. Cheaper, sufficient, and it keeps position facts enumerable.

### 3.2 Single-writer rule
**[INV-6]** Only the phase-engine interpreter commits facts to the ledger. All other modules (generators, agendas, evidence, NPC policy) emit **proposals**; the interpreter validates (§9) and commits atomically. *Why:* one choke point gives atomic transactions (evidence result + its clock tick commit together), a single validation gate, and no write races by construction.

### 3.3 Simultaneity — the comms window
All comms-window actions (player agenda actions, NPC actions) are **queued during the window and resolved at window close**, in an order shuffled by the seeded stream `comms-order`. Resolution is sequential: each proposal validates against the ledger *including prior proposals in this batch*. If a later proposal conflicts (two actors skim the same crate), it fails validation and converts to a `kind:'action.fizzled'` fact (`referee` scope) with feedback to the acting player's phone next window ("the crate was already gone").
*Why shuffled, not timestamp order:* tapping speed must not be gameplay. *Why fizzle, not merge:* colliding conspiracies noticing interference is emergent content, and it's the cheap correct behavior.
**Do not:** resolve actions live during the window (leaks timing information to the host screen).

---

## 4. PHASE ENGINE

JSON-scripted state machine; interpreter is engine, scripts are content.

```ts
interface PhaseStep {
  id: string;
  kind: 'announce'|'generate'|'check'|'vote'|'commsWindow'|'confrontation'|'branch'|'tickClock';
  render?: RenderRef;
  gen?: GeneratorRef;
  check?: { skillSlot: string; difficulty: DifficultyRef; onFail: StepRef; onSuccess: StepRef };
  tick?: { clockId: string; delta: number };  // tickClock's config (M0-06; added at the M0 retro)
  timer?: number;                    // seconds; UI-enforced, host-authoritative
  visibility?: Visibility;
  next: StepRef | BranchTable;
}
```

Guarantees: exactly one active step; every transition logged as a fact; resumable from any save mid-step. The four beats are `content/frames/*/turn.json`; confrontations are a sub-script invoked by clock triggers or player declaration.
**Do not:** hard-code any beat sequence in engine code. If a frame wants five beats, that's a content file.

---

## 5. CLOCKS

First-class: `{id, label, value, max, direction, visibility, triggers[]}`. Triggers enqueue phase sub-scripts (confrontation, default proceedings, heat consequences). Frames declare their clock set; the engine knows only "clocks tick, thresholds fire." All ticks are facts — public for the Obligation, `referee`-scoped for hidden accrual (e.g. heat a legend-contradiction caused). **[INV-7]** No clock changes except via committed `clock.tick` facts.

---

## 6. RNG, DETERMINISM, AND PROVABLE FAIRNESS

One campaign seed; **named streams** derived per subsystem (`world-events`, `agenda-deal`, `oracle`, `market:<hex>`, `comms-order`, `npc:<id>`). *Why named streams:* adding a draw in one system must not shift another's sequence, or saves break across content patches.

Player dice are physical; results enter as `check.reported` facts. The engine never rolls for a PC — which removes the largest determinism hole by design.

**Secret rolls (commit-reveal, decided — build at M2):** any `referee`-scoped roll posts a *public* companion fact `{kind:'secretRoll.committed', hash: H(streamId‖drawIndex‖salt)}` at roll time. The black box publishes the preimages; any player can re-derive every secret draw. **[INV-8]** Every `referee`-scoped random draw has a public commitment fact. *Why:* upgrades "MAGGIE plays fair" from a promise to a proof, for about a day of work.

---

## 7. ECONOMY MODEL

*Why this section exists:* trade's antagonist is "the economy," and the information horizon requires that stale views be **real historical views** — a lookup-with-noise fake is detectable and breaks trust. Therefore market state is a time-series in the ledger.

### 7.1 Contract
Per `(hex, good)`: price evolves once per game-week by a seeded, mean-reverting drift with occasional shocks.

```
price[w+1] = clamp( base(good, worldTraits)
                    × (1 + reversion·(1 − price[w]/base) + drift_t + shock_t) )
  drift_t  ~ stream(`market:<hex>`), small (±3%/week typical, content-tunable)
  shock_t  = event-driven (war, glut, embargo) via world-event facts; rare, large, narrated
```

Weekly updates commit as `market.tick` facts (`referee` scope; volume is fine — one fact per traded good per hex per week, and only for hexes inside the campaign's active bubble, defined as within max staleness the crew could ever query).

### 7.2 The information horizon — implementation
A feed request for hex H at distance d parsecs answers from market state **as of `day − 7d`**: a reducer projection `marketAt(hex, day)` over `market.tick` facts. The staleness tag is `7d` days, displayed in weeks. **[INV-9]** A displayed remote price MUST equal the price a local observer would have seen on that historical day. *Why:* players who jump there and compare are performing an audit; the economy must survive it — this game teaches players to audit everything.

### 7.3 Player impact
Player trades post `market.trade` facts; the next weekly tick applies a supply response (bounded % move against the trade, content-tuned). *Why now:* this is the substrate the shared-economy multiplayer mode needs later; it costs one term in the update rule today.
**Do not:** implement order books, elasticity curves, or arbitrage bots. The economy needs to be *coherent under audit*, not academically interesting. Resist.

---

## 8. GENERATORS AND THE ORACLE

### 8.1 Slot composition
Situations compose from orthogonal slot tables: `actor × motive × method × location × trace`. Entries are content; the composer is engine. Composer contract: emit a **fact-bundle proposal** (ground-truth facts) + a **surface descriptor** (what the table perceives). Never prose.

### 8.2 Incident frames
Per incident-cards-spec: `{pillar, trigger, surface_event, innocent_twin, traitor_action, evidence_trail[], confrontation_scene, clock_effect}`. **Dual-use draw:** when a frame fires, the engine resolves *cause* — a queued agenda action claims matching frames (§10.2); otherwise the innocent twin instantiates. Identical surface descriptor either way; only `referee`-scoped cause facts differ. **[INV-10]** For every surfaced incident, at least one innocent explanation remains consistent with the table-visible fact set. *Why:* "the table can never infer incident⇒traitor" is enforced structurally, not by authoring care.

### 8.3 Repetition suppression
Per-frame and per-slot-entry cooldowns in derived state; composer filters, then weight-decays if the pool thins. §21.4 measures recurrence.

### 8.4 Oracle
The gap-filler when no procedure or content answers a question (solo-mode player questions, NPC reactions, generator texture).

```
ask(question, likelihood) →
  likelihood ladder: certain 3+ · likely 6+ · even 8+ · unlikely 10+ · remote 12
  roll 2d6 on stream `oracle` → YES/NO
  flux = d6 − d6 (same stream):  ≥ +3 "and" · +1..2 plain · 0 plain · −1..−2 "but" · ≤ −3 opposite-and
  emit fact {kind:'oracle.answered', payload:{question, likelihood, answer, texture}}
```

Oracle answers are facts and therefore validated: an answer that would contradict the ledger is re-drawn once with likelihood shifted one step toward consistency; if still contradictory, the answer is forced to the consistent pole and the texture die is kept. *Why:* the oracle invents; the ledger vetoes. **Do not** let oracle output bypass the validator — that is how canon corrupts.

---

## 9. VALIDATOR

Runs on every proposal before commit. Checks, in order:
1. **Schema:** payload matches the registered shape for `kind`.
2. **Referential integrity:** every referenced actor/object/location exists.
3. **Reachability:** the acting entity has a position/access chain supporting the act at the stated time (position facts, §16 note on granularity).
4. **Timeline:** no contradiction with prior facts.
5. **Ambiguity [INV-10]:** the surface descriptor must not uniquely determine a `referee`-scoped cause given the table-visible set. Implementation: fact kinds carry conservative `implies` annotations; the check does closure over visible facts + the candidate surface and requires ≥1 live innocent explanation.

On failure: composer re-draws the conflicting slot (bounded, then frame discard per §17); agenda actions fizzle (§3.3). All rejections log at `referee` scope for balance telemetry.

**Reverse validation (legends, §11):** the same engine run with roles swapped — a *player's cited claim* is validated against the *issued legend bundle*; a contradiction is a finding against the player. Build the validator as a pure function `validate(bundle, ledgerView)` so both directions are the same code.

---

## 10. EVIDENCE AND AGENDAS

### 10.1 Evidence queries and `FactSelector`
An evidence action is a scoped ledger query behind two gates:

```ts
interface EvidenceQuery {
  target: FactSelector;
  access: AccessPrecondition;   // aboard | holdsGear(actor) | hasCodes | holdsPrisoner | atLocation(hex)
  check: { skillSlot: string; difficulty: DifficultyRef };
}

// FactSelector: deliberately weak declarative filter. Conjunctive only. No joins. No negation in v1.
interface FactSelector {
  kinds?: string[];             // exact or prefix glob: 'lock.*'
  actors?: ActorRef[];
  timeRange?: { fromDay: number; toDay: number };
  location?: string;
  tags?: string[];              // content-assigned payload tags
  rankBy: 'probative';          // content assigns probativeWeight per fact kind in the deck
}
```

*Why deliberately weak:* selectors are content, authored partly by LLMs; a conjunctive filter is statically lintable (§19), has no injection surface, and its results are enumerable in tests. Expressiveness grows only when a shipped frame demonstrably needs it.

Resolution order: **access** evaluates against derived position/inventory state — failure narrates why you can't reach it, no roll, no day spent. Then the reported check gates *quality*: Effect maps to how many result facts widen visibility toward `table`, most-probative-first. Widening commits as `reveal` facts; the day-cost `clock.tick` commits in the same transaction. **[INV-11]** Evidence cost and result are atomic.

### 10.2 Agendas
Setup deal: one independent Bernoulli draw per player at the frame's published odds (stream `agenda-deal`); every draw — **including negatives** — is a `referee` fact, so the black box proves the odds were honored ([INV-8] covers the commitment).

```ts
interface Agenda {
  faction: string;
  tier: 'orthogonal'|'parasitic'|'hostile';   // tier weights are frame content
  successCondition: FactSelector & { threshold: number };   // "these facts exist"
  exposureCost: ClockEffect;
  actions: AgendaAction[];                    // comms-window menu; each carries access preconditions
}
```

Chosen actions queue per §3.3, validate like world events (agenda work obeys physics), and register as **claimants** on matching incident frames — the mechanical seam where traitor action and innocent twin produce identical surfaces. Envelope-open — forced only by a majority confrontation vote (rulebook §8.2; the player-facing term is **burned**), never voluntary: all agenda facts for that player widen to `public`; `objective.forfeit` posts; MAGGIE gains a **deferred-reveal token** on the player's private-objective facts — a scheduled event the phase engine MAY cash in later. The vote itself, carried or failed, posts as a public `vote.recorded` fact carrying the per-player tally.

---

## 11. LEGENDS (ESPIONAGE)

A legend is an **issued fact bundle**: `legend.issued` (`referee`) plus the cover facts scoped `private` to the holder. Contradiction detection is **mechanical, not conversational**: the app never parses table talk. When a scene invokes the legend — a checkpoint check, presenting credentials, a named claim the player cites from their legend card — the cited fact validates in reverse (§9) against the issued bundle and the visible world. Contradiction → `heat.tick` (+narration); a held legend under pressure → doors open (difficulty reductions, content-defined).
*Why mechanical:* free-speech NLP adjudication is unshippable and un-testable; tying detection to check-invocations keeps it deterministic and keeps the drama at the table where it belongs.
**Do not:** transcribe, record, or evaluate spoken play. Ever. This is a design line, not a v1 limitation.

---

## 12. NPC CREW (SOLO/DUO)

**Decision: table-driven policy, not behavior trees.** Each NPC: `{competencies, disposition, tells[], agenda?}`. Behavior = weighted reaction tables keyed on `(situationType, disposition)`, drawn on stream `npc:<id>`. NPCs act in comms windows through the *same* agenda machinery as players (§10.2) — one code path, one validator, one claimant system.
**Interrogation:** Persuade/Intimidate check; Effect maps to a truthfulness ladder (evasion → partial → true-with-tell → true). Answers are generated from the NPC's actual `referee`-scoped facts filtered through the ladder, with the oracle supplying texture. Tells are content strings surfaced at higher Effect.
*Why tables:* deterministic, seedable, lintable, and — decisive — the sim harness bots (§21.4) and NPC crew share the policy code, so every sim run also exercises solo mode.

---

## 13. WARFARE ENGAGEMENT RESOLVER

Bounded three-decision structure: **approach → commitment → extraction**. Each decision: MAGGIE presents 2–3 options (content) with modifier consequences; a command check resolves; Effect maps through outcome tables to casualty/objective/position deltas committed as facts. Between decisions, **opposition initiative**: the enemy actor draws from its behavior table (same machinery as §12 — an enemy commander is an NPC with a hostile disposition and no berth) and commits world facts the next decision must live with.
**Do not:** add a map, ranges, facing, or per-combatant tracking. Casualties are clock ticks and named-NPC facts. If a fight needs a battlemat, it's a different product wearing this one's coat.

---

## 14. RENDERER AND VOICE

```ts
interface Renderer { render(beat: BeatType, facts: FactBundle, style: StyleRef): Promise<RenderedText>; }
```
- **Template backend (canonical):** deterministic, snapshot-tested, complete. Grammar helpers for seams (lists, tense, plugin lexicon). Template text MUST be TTS-safe: plain sentences, no markup, numerals ≤4 digits written for speech where they'll be read aloud.
- **LLM backend (flagged, optional):** same interface; facts-in/style-out; hard timeout → template fallback; post-generation guard rejects output containing entity strings absent from the bundle's entity registry. CI runs the full sim suite with this backend disabled. **[INV-12]** Rendered text is presentation only — never parsed back into facts.
- **TTS (flagged):** browser `speechSynthesis` reading MAGGIE's `announce` steps. *Why:* the ONUW precedent — a spoken referee lifts eyes off the screen and makes the comms-window ritual land. Zero-dependency, ship it early.

---

## 15. PLUGIN API

```ts
interface Plugin {
  id: string;
  persona: { name: string; epigraphStyle: StyleRef; lexicon: Lexicon };   // MAGGIE lives here
  dice: { convention: DiceConvention; check(skill, dm, difficulty, reported): CheckResult };
  characterSchema: CharacterSchema;
  importCharacter(raw: unknown): CrewMember;         // travtools JSON, manual entry
  careerEdges: Record<string, EdgeDef>;
  economy: { currency: string; costs: CostModel; goods: GoodDef[] };
  travel: TravelModel;
}
interface TravelModel {
  distance(fromHex, toHex): number | 'unknown';
  validateJump(ship, from, to): JumpValidation;
  fuelCost(ship, parsecs): number;
  stalenessWeeks(parsecs): number;
}
```

**Traveller plugin:** sector data via a one-time user-driven import of travellermap.com SEC export, stored locally (static-hosting compliant, offline thereafter). No data loaded → `distance() = 'unknown'` → **trust mode**: MAGGIE accepts the crew's count and confirms arithmetic only when asked. Off-map hexes route to the exploration frame's world generator. Fair-use hygiene: dice math and original entries only; no rulebook table prose in content files; Mongoose disclaimer in the package README and app footer.

---

## 16. DEVICES, TRANSPORT, AND THE HOST-TRUST BOUNDARY

**Topology:** the shared screen is **host** and sole holder of the full ledger. Phones are thin clients receiving only their visibility slice. **[INV-13]** No fact leaves the host except through a per-player scoped view. This makes phones peek-proof *by architecture*.

**The honest limit — stated, not hidden:** the host is somebody's browser, and a motivated host-player can read `referee`-scoped state through DevTools. There is no clean technical fix without a server, which is out of scope. Therefore:
1. **Social contract (documented in the rulebook's table notes):** the host device is the *table's* device — tablet in the center, not a player's laptop.
2. **Mitigation (build with §6 at M2):** `referee`-scoped payloads encrypt at rest with a key derived from `H(campaignSeed‖salt)`, held only in a sealed in-memory context and reconstructed for the black box. This raises snooping from "open a tab" to "deliberately instrument the runtime" — turning an accident into an act. Cheap, honest, sufficient for a parlor game.
**Do not:** claim or imply cryptographic host-proofness anywhere in docs or UI copy.

**Transports, in build order:** (1) **Hotseat** (M0): one device, transient private views behind a "hand to <name>" interstitial; also the solo/duo path. (2) **Local WebRTC** (M2): trystero (serverless signaling); QR pairing carrying room + per-player key; per-player payload encryption so a misrouted message is unreadable; on connection loss the phase engine pauses timers and offers hotseat degradation. (3) Server transport: interface reserved, out of scope.

**Comms-window enforcement:** acknowledge is timer-gated host-side; early acks are ignored and re-locked. The ritual survives client tampering.

---

## 17. DEGRADED MODES — "MAGGIE IS NEVER SPEECHLESS"

Product invariant **[INV-14]**: from any reachable state, the engine produces a next playable step. The ladder, in order:

1. **Composer exhaustion** (all frames rejected/cooling): draw a *generic family incident* (content ships one nearly-unconstrained frame per family, guaranteed to validate).
2. **Generic also fails** (pathological ledger): **oracle-only beat** — MAGGIE poses the situation as an oracle question and narrates from the answer. Always valid by §8.4's ledger-veto.
3. **Oracle unusable** (should be unreachable; defends against content bugs): MAGGIE declares the beat uneventful, in voice, with a canned line ("Nothing to report. Enjoy it; it's rented.") and logs a `degrade.reported` fact.
4. **Engine fault:** pause, autosave, surface a recover/export screen. Never a blank screen, never a stack trace on the shared display.

Transport loss mid-timer → timers pause, hotseat offered (§16). Validator hard-fail on a *player* action → narrated impossibility, no state change, no day cost. Every degradation logs at `referee` scope; §21.4 tracks degradation frequency as a content-quality metric.

---

## 18. PERSISTENCE AND MIGRATION

IndexedDB autosave of `{schemaVersion, seedState, facts[], contentHashes}`; export/import as one JSON blob (doubles as the async play-by-post format). Load always replay-validates ([INV-3]).
**Migration:** content hash mismatch → warn, then attempt replay under new content. In-flight incidents whose frame no longer exists resolve via their recorded innocent twin at next ARRIVAL (`frame` field on facts makes them findable). Reducer changes bump `schemaVersion` with a written migration or an explicit refusal — silent best-effort loading is forbidden. *Why strict:* a campaign save is a table's shared memory; corrupting it quietly is the worst trust failure available to us.

---

## 19. CONTENT PIPELINE

Content is JSON validated by JSON Schemas that live **with the engine** (schemas are engine; instances are content). `packages/content-lint` runs in CI and locally:
- **Schema pass** per content type (frames, decks, slot tables, phase scripts, agendas).
- **Referential pass:** every `FactSelector` resolves against registered fact kinds; every slot/frame/clock/step reference exists; every `render` key has a template.
- **Balance lints:** tier weights sum to 1; cooldowns within bounds; every incident frame has both `innocent_twin` and `traitor_action`; every evidence trail entry has an access precondition.
- **Sim smoke:** new/changed content runs 50 headless campaigns; hard-fail on validator-rejection rate or degradation rate over threshold.

**LLM-authored content** (expected to be most of it) MUST pass lint + smoke before human review — the pipeline is the reviewer's floor, not their replacement. *Why schemas-with-engine:* the schema is the contract the validator enforces at runtime; keeping one source prevents the two from drifting.

---

## 20. ACCESSIBILITY AND TELEMETRY

- Shared-screen type ≥ 20px equivalent at design size (it's read from across a table); pillar color tokens MUST carry a non-color channel (icons) — the current palette's green/red pair fails deuteranopia alone.
- TTS (§14) doubles as an accessibility feature; timers get audio cues.
- **Telemetry: none over the network, ever.** An opt-in *local* session-metrics export (same metric set as §21.4) lets real tables contribute tuning data by manually sharing a file. *Why:* the game's premise is auditable trust; phoning home would be self-satire.

---

## 21. TEST PLAN

### 21.1 Test levels and ownership
| Level | Scope | Tooling | Gate |
|---|---|---|---|
| Unit | pure functions: reducers, oracle math, economy update, selector eval | vitest | PR |
| Property | the invariant set INV-1..14 (table below) | fast-check | PR |
| Snapshot | template renderer output per beat × frame × plugin lexicon | vitest snapshots | PR |
| Integration | full phase scripts on scripted inputs (the turn, the confrontation) | vitest + ledger fixtures | PR |
| Simulation | 1,000-campaign headless runs, metric thresholds | `packages/sim` | nightly + release |
| Manual | table scripts (Appendix A run live; the rulebook §14 transcript as acceptance script) | human | milestone |

### 21.2 Invariant → test mapping (the property suite)
INV-1 CI stub-plugin build · INV-2/3 replay determinism over 100 random seeds, plus cross-run byte-compare · INV-4 no visibility narrowing over generated fact streams · INV-5/10 sim bots run brute-force implication closure; assert no incident is uniquely attributable from visible facts alone · INV-6 static: no ledger writes outside the interpreter (lint rule) · INV-7 clock projections equal tick-fact sums · INV-8 every `referee` draw has a commitment fact; black-box preimages verify · INV-9 remote-feed answers equal historical local answers (time-travel property test) · INV-11 evidence transactions atomic under injected mid-commit failure · INV-12 static: renderer output type is a terminal type, no ingest path · INV-13 transport fuzz: no `referee`/foreign-`private` fact in any client payload · INV-14 chaos content (deliberately broken decks) always reaches a playable step.

### 21.3 Milestone acceptance (definition of done)
- **M0:** INV-2/3/6/7 green; scripted demo turn replays identically on two machines; hotseat interstitial usable.
- **M1:** solo trade campaign completes 4 turns headless *and* by hand; degradation ladder reachable only via chaos content; snapshot suite established.
- **M2:** agendas + comms ordering under property tests (INV-5/8/10/11/13); WebRTC session survives a forced disconnect mid-window; commit-reveal verifies end-to-end.
- **M3:** Traveller import round-trips travtools JSON; INV-9 green over imported sector data; trust-mode path tested with no data loaded.
- **M4/M5:** each new pillar lands with its content lint rules, sim metrics wired, and zero new engine-package dependencies on plugin/content.

### 21.4 Simulation harness metrics (regression thresholds at release)
Misattribution rate 25–40% per incident (the tuned-ambiguity target) · frame recurrence within 4 turns < 5% · Obligation-failure curve inside the frame's design band · evidence informativeness (mean entropy reduction per action) above floor · agenda detection curves monotone in odds setting · degradation events < 0.5% of beats · identical metric distributions with LLM renderer on vs. off.

### 21.5 Rules for LLM implementers (process, enforced in review)
1. **Tests precede implementation.** Every PR states which INVs and behaviors it covers and lands the failing tests first. (Yes: the practice this document's former acronym kept colliding with. The collision is now load-bearing.)
2. Tests MUST NOT be deleted, skipped, or weakened without a human-approved commit that says so in the message.
3. If the Spec is silent, the implementer extrapolates from the nearest *Why* and records the extrapolation in the PR description — silence resolved by guesswork without a note is a defect even when the guess is right.
4. No new dependencies in `packages/engine` without human sign-off.
5. Every module PR updates Appendix A if it changes how The Skim would trace through the system.

---

## 22. MILESTONES

| M | Deliverable | Proves |
|---|---|---|
| **M0** | Ledger + reducers + time model + phase interpreter + hotseat shell; scripted demo turn | The spine; determinism green |
| **M1** | Solo trade ("Quiet Ship"): economy + market gen, checks, clocks, NPC crew (§12), template renderer, degradation ladder, TTS flag | A playable game exists |
| **M2** | Envelopes, agendas, comms-window ordering (§3.3), confrontations, WebRTC phones, commit-reveal + referee-scope encryption | The social game, provably fair |
| **M3** | Traveller plugin: import, sector data, travel model, information horizon (INV-9) | Distance + BYO characters |
| **M4** | Exploration frame (visibility/fog) + print pack (manifest with embedded skim first) | Second pillar; forensic props |
| **M5** | Warfare (§13) · Espionage (heat + legends §11) · LLM renderer behind flag | Full pillar set |

M0–M1 remains the falsifiable bet: if the solo trade loop isn't fun with templates and one clock, later milestones don't matter.

## 23. RISKS

| Risk | Exposure | Mitigation |
|---|---|---|
| Ambiguity check (INV-5/10) is the hard CS problem in disguise | leaky implication → solvable deduction | conservative explicit `implies` annotations; sim-bot brute-force inference in the property suite |
| Host trust misunderstood as cryptographic | trust collapse on discovery | §16 states the limit in docs and UI copy; encryption-at-rest raises the bar honestly |
| Economy audit failure (stale ≠ historical) | players catch the fake; premise dies | INV-9 as a property test, not a code-review hope |
| WebRTC flakiness at real tables | ritual breaks mid-window | hotseat degradation is first-class, timers pause on loss |
| LLM implementer drift | quiet spec violations | §21.5 process + invariant property suite + content-lint floor |
| Scope creep (see: this project's chat history) | M1 never ships | the one-pager is the complexity budget; frame JSON is the feature gate; §13's Do-not is load-bearing |

## 24. OPEN QUESTIONS (pruned; decided items moved into spec)
1. Position-fact granularity: per-beat station declarations (start here) vs. continuous presence — revisit if alibi play feels coarse in M2 sims.
2. Content packaging: `content/` in-repo vs. `packages/content-core` — decide when a second author appears.
3. Print pack pipeline: print-stylesheet HTML first (CI-testable); pdf-lib only if HTML print proves inadequate.
4. `clock.tick`'s visibility is "per clock definition" (§5, `fact-kinds-v0.md`), but the v0 kind registry can only express one static default per kind and currently pins it to `referee` for every clock. M1-01 (economy) owns the real per-clock-def mechanism — resolve there. (Logged at the M0 retro.)
5. `DifficultyRef` (§4's `PhaseStep.check.difficulty`) has no definition anywhere in the Spec; M0-06 implemented it as a plain `number`. Revisit once content wants anything richer than a bare number (difficulty bands, modifiers). (Logged at the M0 retro.)

---

## APPENDIX A — THE SKIM AS A FACT TRACE (worked example)

The canonical end-to-end trace; every module PR keeps this current (§21.5.5). Campaign seed `S`, players Zhan/Deuce/Brennan, NPC ex-engineer `npc:kessler` discharged at Vantage (facts F00–F03, setup, omitted). Agenda deal at odds 0.28: three draws on `agenda-deal` → all negative; three `referee` facts + three commitment facts (INV-8). *No traitor exists in this campaign.*

| # | kind | t | actor | visibility | payload (abridged) | notes |
|---|---|---|---|---|---|---|
| F10 | `cargo.loaded` | d7·DOCK | pc:zhan | public | 20t machine parts, manifest M1 | |
| F11 | `lock.cycled` | d7·DOCK | npc:kessler | referee | bay door, code:CAPT-OVR, 0340 | innocent twin instantiates: frame T1 fired with no claimant; composer drew `actor:port-insider` slot → kessler (retained codes, F03) |
| F12 | `camera.looped` | d7·DOCK | npc:kessler | referee | aft bay cam, 0332 | trace slot |
| F13 | `cargo.diverted` | d7·DOCK | npc:kessler | referee | 2 crates → fence | causes:[F11] |
| F14 | `secretRoll.committed` | d7·DOCK | referee | public | hash(...) | covers the T1 cause resolution draw |
| F15 | `jump.plotted` | d7·TRANSIT | pc:brennan | public | 2114, check 9 vs 6 | day += 7 |
| F16 | `oracle.answered` | d11·TRANSIT | referee | table | sensor ghost: NO,and | jump event; "and" texture surfaces F12's existence (a reveal fact widens `camera.looped` to table — *not* its actor) |
| F17 | `sale.settled` | d14·ARR | world | public | Cr169,200, 18 crates vs M1:20 | **surface event**; INV-10 holds: kessler-explanation live |
| F18 | `check.reported` | d14·ARR | pc:zhan | public | Admin 6 vs 8 → fail | evidence action; atomic with F19 |
| F19 | `clock.tick` | d14→15 | referee | public | obligation −1 day | INV-11 |
| F20 | `check.reported` | d15·ARR | pc:brennan | public | Computers 11 vs 8, Effect 3 | |
| F21 | `reveal` | d15·ARR | referee | table | widens F11 {time, door, code-class} — **not** actor identity | Effect-ranked partial widening (§10.1) |
| F22 | `confrontation.opened` | d15·ARR | pc:zhan | public | accuses pc:deuce; vote carries 2–1 | sub-script; a majority forces the open |
| F23 | `envelope.opened` | d15·ARR | pc:deuce | public | LOYAL — burned; objective.forfeit; deferred-reveal token minted | forced by the carried vote (its `vote.recorded` fact elided from this trace); never voluntary |
| F24 | `reveal` | d15·ARR | referee | public | F11 actor class: retained crew code, kessler named via F03 linkage | confrontation resolution widens the rest |

Black box at campaign end prints F00–F24 with all scopes lifted, plus commitment preimages (F14 et al.) so the table can verify that no traitor draw ever happened — which, this campaign, is the whole tragedy.

---

*Supersession note: telemetry-engine-tdd.md v0.1 is retained for history; this Spec is authoritative. Where they disagree, the Spec wins and the disagreement is a bug in the older doc.*
