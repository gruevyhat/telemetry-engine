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

### system / meta
| kind | payload | vis | implies |
|---|---|---|---|
| `phase.transition` | {fromStep, toStep, frame} | public | — |
| `clock.tick` | {clockId, delta, cause?} | per clock def | — |
| `check.reported` | {actor, skill, dm, total, difficulty, effect} | public | — |
| `secretRoll.committed` | {hash} | public | — |
| `oracle.answered` | {question, likelihood, answer, texture} | table | — |
| `correction` | {supersedes: FactID, note} | inherits target | — |
| `reveal` | {targets: FactID[], fields: string[]} | public | — (reveals are meta; the checker evaluates their *targets*) |
| `action.fizzled` | {attemptedActionId, reason} | referee | — |
| `degrade.reported` | {rung, context} | referee | — |
| `vote.recorded` | {topic, tally, captainBreak} | public | — |

### position / access
| kind | payload | vis | implies |
|---|---|---|---|
| `presence.declared` | {actor, station\|hex, day, slot} | table | — |
| `access.granted` | {actor, codeClass, grantor} | referee | — |

Position model (Spec §24.1): per-beat station declarations. Every PC/NPC has exactly one `presence.declared` per (day, slot) aboard ship; absence of a declaration means "berth/common," never "unknown." This closes the reachability check's domain.

### trade / economy
| kind | payload | vis | implies |
|---|---|---|---|
| `cargo.loaded` | {lotId, tons, manifestId, bay} | public | `presence.declared`(supervisor, bay, timeWindow ±0) |
| `cargo.unloaded` | {lotId, tons, bay} | public | same |
| `cargo.diverted` | {lotId, qty, channel} | referee | `lock.cycled`(sameLocation=bay, timeWindow ±0) ∧ (`presence.declared`(sameActor, bay) ∨ `access.granted`(sameActor, remote)) |
| `sale.settled` | {lotId, amount, countDelivered, buyer} | public | — |
| `purchase.settled` | {lotId, amount, seller} | public | — |
| `market.tick` | {hex, good, price, week} | referee | — |
| `market.trade` | {hex, good, qty, price, actor} | public | — |

### ship operations
| kind | payload | vis | implies |
|---|---|---|---|
| `lock.cycled` | {door, codeClass, time} | referee | `access.granted`(codeClass, any actor) |
| `camera.looped` | {camera, from, to} | referee | `presence.declared`(sameActor, comms/computer station, timeWindow ±1) ∨ `access.granted`(sameActor, remote) |
| `jump.plotted` | {fromHex, toHex, parsecs, checkRef} | public | — |
| `fuel.consumed` | {tons, refined} | public | — |
| `maintenance.deferred` | {system, weeksOverdue} | public | — |
| `system.failed` | {system, mode} | table | — (deliberately no implies: failures must stay ambiguous between wear and sabotage; a sabotage kind, `system.tampered` (referee), implies access — the *failure* does not) |
| `system.tampered` | {system, method} | referee | `presence.declared`(sameActor, sameLocation, timeWindow ±1) |

### social / meta-game
| kind | payload | vis | implies |
|---|---|---|---|
| `agenda.dealt` | {playerId, result: bool, tier?} | referee | — |
| `agenda.actionTaken` | {playerId, actionId, frameClaim?} | referee | action-specific: each AgendaAction carries its own implies bundle in content, validated by content-lint against this catalog |
| `envelope.opened` | {playerId, contents} | public | — |
| `objective.forfeit` | {playerId} | public | — |
| `confrontation.opened` | {declarer, mode, target?} | public | — |
| `confrontation.resolved` | {outcome, logNote} | public | — |
| `npc.hired` | {npcId, role, wage} | public | — |
| `npc.statement` | {npcId, topic, truthTier} | table | — (truthTier is referee-scoped inside payload split: statement text `table`, tier `referee` — implemented as two facts, see §3 note) |

### reserved namespaces
`survey.*` (M4) · `engage.*` (M5) · `legend.*`, `heat.*` (M5). Opening a namespace = catalog PR defining kinds + implies before any code.

## 3. Notes for implementers

- **Split-visibility payloads are forbidden.** If part of a payload is referee-only (npc.statement's truthTier), emit two facts linked by `causes`. One fact, one visibility. This keeps INV-13's slice logic trivial.
- **The Skim in this catalog** (cross-check with Spec Appendix A): F11=`lock.cycled`, F12=`camera.looped`, F13=`cargo.diverted`. Closure demo: revealing F11's {time, door, codeClass} implies only `access.granted(codeClass)` — which matches the captain, prior senior crew, and the discharged engineer (F03). Three live explanations ⇒ INV-10 holds. Revealing F11's *actor* field would collapse to one ⇒ the evidence system's Effect-ranking must price actor-identity fields as the last reveal tier. This pricing rule is normative: **identity fields reveal last.**
- **Checker algorithm sketch (M1-04/M1-12):** consistent-worlds enumeration over the small actor set: for each referee-scoped cause fact, enumerate actor assignments consistent with (visible facts ∪ implies closure ∪ position model). Unique assignment ⇒ reject the proposal/reveal. Actor sets are ≤ ~10; brute force is fine. Do not build a SAT solver.

## 4. Change control
Adding a kind or an implies edge: PR to this file first, with (a) the Why, (b) the INV-10 impact note (does the edge narrow any existing deck's incidents?), (c) content-lint updated to recognize it. The sim smoke run on the PR is the regression net.
