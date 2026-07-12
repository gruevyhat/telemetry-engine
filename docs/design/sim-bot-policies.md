# Sim Bot Policies v0
**Status:** design input for M1-08 / M1-12 · **Spec refs:** §12 (NPC crew), §21.4 (metrics) · **Shared-code rule:** bots and NPC crew use the same policy module (`engine/npc`); every sim run therefore also exercises solo mode.

## 1. Policy model

A policy is a pure function `decide(view, rng) → Action` where `view` is **only the actor's visibility slice** — bots never read referee scope ([INV-13] applies to bots too; a bot that peeks invalidates every metric it generates). Policies are table-driven: weighted action tables keyed on `(situationType, disposition)`, drawn on the actor's named stream.

```ts
type Disposition = 'naive'|'diligent'|'paranoid'|'loyalist'|'selfish';
type SituationType = 'market'|'patron'|'discrepancy'|'commsWindow'|'confrontation'|'vote'|'interrogation';
```

Dispositions are content for NPCs (part of the NPC def) and configuration for sim bots.

## 2. Decision rules by situation

### market (all dispositions)
Greedy expected margin with staleness discount: score each lot `(destPrice·(1−λ·stalenessWeeks) − buyPrice − fuelShare)`; buy best positive score within funds minus a reserve = next Obligation payment × reserveFactor(disposition): naive 0.0 · diligent 0.6 · paranoid 0.9. λ default 0.04/week (tunable; sim sweeps it).

### discrepancy (a public loss/anomaly fact appears)
Investigate decision: spend an evidence action iff `lossValue > investigateThreshold(disposition) AND obligationSlackDays > slackFloor(disposition)`.
naive: threshold ∞ (never investigates) · diligent: Cr5,000 / 4 days · paranoid: Cr500 / 1 day · loyalist: as diligent · selfish: investigates only losses touching own objective.
Selector choice: highest-probative selector whose access precondition the bot satisfies (query the card's evidence_trail in visible form).

### accusation (the inference bot)
The **diligent/paranoid accuse rule** runs consistent-worlds enumeration (same algorithm as the validator's checker, fact-kinds §3, over the bot's *visible* slice): let `W` = set of consistent actor-assignments for the suspicious cause.
- If `|W| = 1` and the unique actor is a crewmate → **accuse** (this firing is exactly what INV-5/10 says must never happen from visible facts alone — its trigger rate is a primary property-test signal and must be 0 on twin-fired incidents).
- Else accuse when `maxPosterior(W) > accuseBar(disposition)` with uniform prior over W: diligent 0.75 · paranoid 0.5 · naive/loyalist never accuse first · selfish 0.9.
- Paranoid additionally accuses on `2+` unresolved discrepancies regardless of posterior ("pattern paranoia") — this bot generates the false-accusation metric's stress case.

### commsWindow (agenda holders only)
Take the highest-payout agenda action whose access precondition holds and whose *estimated exposure* is below `riskBar(disposition)`; exposure estimate = count of implies edges the action's fact bundle would create toward facts a diligent bot could reach with ≤2 evidence actions. Selfish takes temptation offers at EV > 0; loyalist never does.

### vote / confrontation
loyalist votes with captain · naive votes with majority-so-far (or captain if first) · diligent votes its inference (accused ∈ W with max posterior ⇒ guilty) · paranoid votes guilty at posterior > 0.4 · selfish votes whatever minimizes own objective risk. Envelope-open when accused: open iff loyal AND objective already completed-or-worthless; else refuse (this yields the refuse-rate metric).

### interrogation (NPC-side, solo mode)
NPC answers from its own facts filtered through the truth ladder by interrogator's Effect: E<0 evasion · 0–1 partial (true facts, material omission) · 2–3 true-with-tell (append one `tells[]` string) · 4+ true. Content of answers: template over the NPC's visible-to-self facts; **never** invents (oracle supplies texture only, ledger-vetoed).

## 3. Standard table lineups (sim configurations)
- **L1 "book club":** 4× naive — floor for incident survivability without investigation.
- **L2 "reference":** captain-loyalist, diligent, naive, selfish@odds — headline metrics lineup.
- **L3 "witch hunt":** 2× paranoid + 2× naive — false-accusation and refuse-rate stress.
- **L4 "quiet ship":** 1 diligent PC-bot + 3 NPC crew — solo-mode exerciser.
- **L5 "all dirty":** L2 with agenda odds 1.0 — parasite-host stress; ship-survival floor.

## 4. Metrics each lineup owns (thresholds in Spec §21.4)
L2: misattribution rate, evidence informativeness, Obligation curve · L3: false-accusation rate, envelope refuse-rate · L4: interrogation informativeness, degradation rate · L5: hostile-tier death-spiral check (ship survival ≥ threshold even at odds 1.0 with shipped tier weights) · all: INV-5/10 zero-unique-attribution property, frame recurrence.

## 5. Do not
- No learning, no lookahead search, no LLM calls in bots. Policies must be boring: their job is *reproducible* pressure, not clever play. Cleverness goes in threshold sweeps, not in the policy.
- No bot reads another actor's private slice, ever, including "just for metrics" — metrics that need ground truth read the ledger in the *harness*, outside any policy.
