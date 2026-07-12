# Fact-Kind Catalog v0
**Status:** design input, gates M0-02 · **Owner of changes:** catalog PRs precede code PRs (CLAUDE.md hard rule) · **Spec refs:** §2 (ledger), §9 (validator), INV-5/10

## 1. Purpose and rules

This catalog enumerates the initial fact kinds, their payload schemas, default visibility, and — the load-bearing part — their **`implies` annotations**: the conservative implication map the ambiguity checker (Spec §9 check 5) runs closure over. Rules:

- **Naming:** `domain.event`, past-tense event nouns (`lock.cycled`, not `lock.cycle`). Domains are namespaces; new domains (survey.*, engage.*, legend.*, heat.*) open at their milestone via catalog PR.
- **Payloads** are exact: no optional grab-bag fields. If a variant needs more, it's a new kind.
- **Visibility column is the default at creation**; `reveal` facts widen later. `referee`-default kinds are the deduction surface — add them thoughtfully.
- **`implies` is conservative by design.** An annotation asserts: *whenever this fact exists, facts matching these patterns necessarily also exist.* Only annotate certainties. Why this direction: the ambiguity checker uses implications to compute how much a revealed fact *narrows* the space of consistent explanations; over-claiming implications makes the checker believe reveals are safer than they are and leaks attribution (INV-10 violation). Under-claiming merely makes evidence slightly less informative. When unsure, omit.
- **Correlation keys** in implies: `sameActor`, `sameLocation`, `timeWindow(±slot)`, `sameObject`. The checker matches on these, not on payload equality.

## 2. Catalog

Payload types below were formalized at the M0 retro (2026-07-13): the original table gave field
*names* only; types are inferred from context and now match `packages/engine/src/ledger/
kinds-v0.ts` exactly, so future kind additions have a concrete example to follow instead of each
re-guessing. `?` marks an optional field.

### system / meta
| kind | payload | vis | implies |
|---|---|---|---|
| `phase.transition` | {fromStep: string, toStep: string, frame?: string} | public | — |
| `clock.tick` | {clockId: string, delta: number, cause?: string} | per clock def | — |
| `check.reported` | {actor: string, skill: string, dm: number, total: number, difficulty: number, effect: number} | public | — |
| `secretRoll.committed` | {hash: string} | public | — |
| `oracle.answered` | {question: string, likelihood: number, answer: string, texture?: string} | table | — |
| `correction` | {supersedes: FactID, note: string} | inherits target | — |
| `reveal` | {targets: FactID[], fields: string[]} | public | — (reveals are meta; the checker evaluates their *targets*) |
| `action.fizzled` | {attemptedActionId: string, reason: string} | referee | — |
| `degrade.reported` | {rung: string, context: string} | referee | — |
| `vote.recorded` | {topic: string, tally: object, captainBreak?: boolean} | public | — |

### position / access
| kind | payload | vis | implies |
|---|---|---|---|
| `presence.declared` | {actor: string, station?: string, hex?: string, day: number, slot: string} — exactly one of `station`/`hex` | table | — |
| `access.granted` | {actor: string, codeClass: string, grantor: string} | referee | — |

Position model (Spec §24.1): per-beat station declarations. Every PC/NPC has exactly one `presence.declared` per (day, slot) aboard ship; absence of a declaration means "berth/common," never "unknown." This closes the reachability check's domain. `station`/`hex` are mutually exclusive and jointly exhaustive — enforced by the registry, not left as an unenforced convention (M0 retro).

### trade / economy
| kind | payload | vis | implies |
|---|---|---|---|
| `cargo.loaded` | {lotId: string, tons: number, manifestId: string, bay: string} | public | `presence.declared`(supervisor, bay, timeWindow ±0) |
| `cargo.unloaded` | {lotId: string, tons: number, bay: string} | public | same |
| `cargo.diverted` | {lotId: string, qty: number, channel: string} | referee | `lock.cycled`(sameLocation=bay, timeWindow ±0) ∧ (`presence.declared`(sameActor, bay) ∨ `access.granted`(sameActor, remote)) |
| `sale.settled` | {lotId: string, amount: number, countDelivered: number, buyer: string} | public | — |
| `purchase.settled` | {lotId: string, amount: number, seller: string} | public | — |
| `market.tick` | {hex: string, good: string, price: number, week: number} | referee | — |
| `market.trade` | {hex: string, good: string, qty: number, price: number, actor: string} | public | — |

### ship operations
| kind | payload | vis | implies |
|---|---|---|---|
| `lock.cycled` | {door: string, codeClass: string, time: string} | referee | `access.granted`(codeClass, any actor) |
| `camera.looped` | {camera: string, from: string, to: string} | referee | `presence.declared`(sameActor, comms/computer station, timeWindow ±1) ∨ `access.granted`(sameActor, remote) |
| `jump.plotted` | {fromHex: string, toHex: string, parsecs: number, checkRef: string} | public | — |
| `fuel.consumed` | {tons: number, refined: boolean} | public | — |
| `maintenance.deferred` | {system: string, weeksOverdue: number} | public | — |
| `system.failed` | {system: string, mode: string} | table | — (deliberately no implies: failures must stay ambiguous between wear and sabotage; a sabotage kind, `system.tampered` (referee), implies access — the *failure* does not) |
| `system.tampered` | {system: string, method: string} | referee | `presence.declared`(sameActor, sameLocation, timeWindow ±1) |

### social / meta-game
| kind | payload | vis | implies |
|---|---|---|---|
| `agenda.dealt` | {playerId: string, result: boolean, tier?: string} | referee | — |
| `agenda.actionTaken` | {playerId: string, actionId: string, frameClaim?: string} | referee | action-specific: each AgendaAction carries its own implies bundle in content, validated by content-lint against this catalog |
| `envelope.opened` | {playerId: string, contents: unknown} | public | — |
| `objective.forfeit` | {playerId: string} | public | — |
| `confrontation.opened` | {declarer: string, mode: string, target?: string} | public | — |
| `confrontation.resolved` | {outcome: string, logNote: string} | public | — |
| `npc.hired` | {npcId: string, role: string, wage: number} | public | — |
| `npc.statement` | {npcId: string, topic: string} | table | — (companion `npc.truthTierAssigned` fact carries the referee-scoped tier, see below and §3) |
| `npc.truthTierAssigned` | {tier: 'evasion'\|'partial'\|'trueWithTell'\|'true'} | referee | — (linked to its `npc.statement` via the fact-level `causes` field, not a payload field — see §3; named at the M0 retro, closing the gap the original table left as prose-only) |

### reserved namespaces
`survey.*` (M4) · `engage.*` (M5) · `legend.*`, `heat.*` (M5). Opening a namespace = catalog PR defining kinds + implies before any code.

## 3. Notes for implementers

- **Split-visibility payloads are forbidden.** If part of a payload is referee-only
  (`npc.statement`'s truth tier), emit two facts linked by `causes`: the public/table-visible
  `npc.statement` fact, and a separate `npc.truthTierAssigned` fact (`referee`-scoped, `causes:
  [statementFactId]`) carrying the tier. One fact, one visibility. This keeps INV-13's slice logic
  trivial.
- **The Skim in this catalog** (cross-check with Spec Appendix A): F11=`lock.cycled`, F12=`camera.looped`, F13=`cargo.diverted`. Closure demo: revealing F11's {time, door, codeClass} implies only `access.granted(codeClass)` — which matches the captain, prior senior crew, and the discharged engineer (F03). Three live explanations ⇒ INV-10 holds. Revealing F11's *actor* field would collapse to one ⇒ the evidence system's Effect-ranking must price actor-identity fields as the last reveal tier. This pricing rule is normative: **identity fields reveal last.**
- **Checker algorithm sketch (M1-04/M1-12):** consistent-worlds enumeration over the small actor set: for each referee-scoped cause fact, enumerate actor assignments consistent with (visible facts ∪ implies closure ∪ position model). Unique assignment ⇒ reject the proposal/reveal. Actor sets are ≤ ~10; brute force is fine. Do not build a SAT solver.

## 4. Change control
Adding a kind or an implies edge: PR to this file first, with (a) the Why, (b) the INV-10 impact note (does the edge narrow any existing deck's incidents?), (c) content-lint updated to recognize it. The sim smoke run on the PR is the regression net.

**M0 retro catalog PR — `npc.truthTierAssigned` (2026-07-13).** *Why:* `npc.statement` had a
referee-scoped `truthTier` named in prose since M0-02 but no companion kind was ever defined, so
Spec §12's interrogation ladder (evasion → partial → true-with-tell → true) has had nowhere to
land as a fact. *INV-10 impact:* none yet — the kind has no `implies` edge, and no content deck
references it, so it narrows nothing until an M1/M2 task wires an actual interrogation scene to it.
*Content-lint:* no update needed yet; `npc.statement`/`npc.truthTierAssigned` aren't emitted by any
shipped content (M0's demo turn doesn't use NPC crew), so the schema addition in
`packages/engine/src/ledger/kinds-v0.ts` is the only code change this PR makes.
