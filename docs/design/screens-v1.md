# Screens v1 — inventory and flow map
**Status:** design input for M1 · **Spec refs:** rulebook §3 (the interfaces), Spec §16 (devices/transport), Spec §17 (degraded modes) · **Task:** M1-00

## 0. Scope note

The task card asks for wireframe-level sketches of "the 3 screens M1 builds beyond M0-07." M1's actual UI-facing
work spans four candidates — the dockside market feed (M1-02), evidence reveal (M1-07), the NPC interrogation
ladder (M1-08), and degrade/pause + save/recover (M1-10) — not three. Owner decision (2026-07-13): sketch all
four, loosely, rather than dropping one to hit the card's literal count. **Flagged for the M1 retro: the card's
"3" was an undercount and should be corrected there.**

Screens are inventoried in full below regardless of which milestone builds them, per the card's Done-when list.
Only the four named above get a wireframe-level sketch (§2); the rest get an inventory entry — what it shows,
which projections feed it, its visibility level — with no sketch, because M1 doesn't build them.

## 1. What M0-07 already shipped

The shared-screen skeleton (`packages/ui-shared/src/shared-screen/`) is the frame every screen below sits inside.
It is not itself one of the screens in this inventory — it is the container:

- **Status bar** (`StatusBar.tsx`): funds, Obligation countdown, hex, fuel, hold state. `public`-derived
  projections only (`fundsProjection`, `clocksProjection`); hex/fuel/hold are plain props today, no projection
  yet.
- **Phase track** (`PhaseTrack.tsx`): the four turn beats (DOCKSIDE, COMMS, TRANSIT, ARRIVAL), current one lit.
  No fact content of its own — reads `currentSlot` from the phase engine.
- **Main panel** (`SharedScreen.tsx`'s `children` slot): "whatever the phase demands" — every screen in §2 and §3
  renders here.
- **Ship's log ticker** (`Ticker.tsx`): scrolling append-only journal, `public`-visibility facts only.
- **Hand-to interstitial** (`Interstitial.tsx`): the hotseat privacy gate. Renders only the one player's own
  `visibleFacts` slice; the component has no prop through which another player's private facts could reach it
  (INV-13, hotseat form).

## 2. Screens M1 builds (wireframe-level sketches)

### 2.1 Dockside — market feed with staleness tags (M1-01, M1-02)

Replaces the M0 demo's placeholder "Dockside systems are open" text with the real trade screen.

```
┌─────────────────────────────────────────────────────────┐
│ [status bar — unchanged from M0-07]                     │
│ [phase track — DOCKSIDE lit]                             │
├─────────────────────────────────────────────────────────┤
│  MARKET — Regina, day 14                                  │
│  ┌───────────┬────────┬────────┬──────────────────────┐  │
│  │ good       │ price  │ trend  │ staleness             │  │
│  ├───────────┼────────┼────────┼──────────────────────┤  │
│  │ machine parts │ Cr410 │ ▲     │ local (this hex)      │  │
│  │ ore, refined  │ Cr188 │ ▼     │ 2 weeks (14 pc away)  │  │
│  └───────────┴────────┴────────┴──────────────────────┘  │
│  [ Buy ]  [ Sell ]  [ Load cargo ]                        │
├─────────────────────────────────────────────────────────┤
│ [ship's log ticker — unchanged from M0-07]                │
└─────────────────────────────────────────────────────────┘
```

- **Projections:** `marketAt(hex, day)` (§7.2, reducer over `market.tick`) drives price/trend per row; the
  staleness tag is the `7·d` days a remote hex's feed is delayed by, converted to weeks for display.
- **Visibility:** `market.tick` is `referee`-scoped (raw ledger fact) — the screen never reads it directly; it
  reads the `marketAt` projection's output, which is derived, displayable data. `market.trade` (the player's own
  buy/sell) is `public`.
- **Do not:** no order book, no elasticity UI — the Spec's §7.3 "resist" applies to the screen too; one price,
  one trend arrow, one staleness tag per good.

### 2.2 NPC interrogation ladder (M1-08)

A modal-style overlay within the main panel, reachable during COMMS or DOCKSIDE wherever an NPC crew member is
present. Not a separate phase-track beat.

```
┌─────────────────────────────────────────────────────────┐
│  INTERROGATE — npc:kessler                                │
│  "Where were you at 0330?"                                │
│  [ Persuade ]  [ Intimidate ]                              │
│  ─────────────────────────────────────────────────────    │
│  > check: Persuade 7 vs 8 → Effect 1 (partial)             │
│  "I was in the mess hall. Ask anyone." (material omission) │
└─────────────────────────────────────────────────────────┘
```

- **Projections:** none new — the answer text comes from the template renderer (M1-09) over the NPC's own
  `referee`-scoped facts, filtered through the truth ladder (evasion → partial → true-with-tell → true) keyed
  on the reported check's Effect (Spec §12).
- **Visibility:** the question/answer exchange itself renders `public` (everyone at the table hears it — this
  is spoken-aloud content, not a ledger fact); the underlying NPC facts it draws from stay `referee`. Per
  Appendix A / INV-12, none of this is ever parsed back into facts — the interrogation posts a `check.reported`
  fact (`public`) for the roll; the answer text itself is presentation only.
- **Do not:** no free-text question entry — Persuade/Intimidate are the only two actions per Spec §12; the
  screen is a check-and-reveal, not a chat interface.

### 2.3 Evidence reveal (M1-07)

Also an overlay, triggered by an evidence action (an `EvidenceQuery`: target selector + access precondition +
check). Distinct from interrogation — this queries the ledger directly rather than an NPC's answer.

```
┌─────────────────────────────────────────────────────────┐
│  EVIDENCE — aft bay camera log                             │
│  access: aboard ✓                                          │
│  check: Investigate 9 vs 6 → Effect 3                      │
│  ─────────────────────────────────────────────────────    │
│  REVEALED (widened to table):                              │
│   • lock.cycled — bay door, 0340                            │
│   • camera.looped — aft bay cam, 0332                        │
│  cost: 1 day (clock.tick, atomic with this reveal)          │
└─────────────────────────────────────────────────────────┘
```

- **Projections:** `FactSelector` evaluation (conjunctive filter over kind/actor/time/location/tags) ranked by
  `probative` weight; Effect from the reported check determines how many ranked results widen from their
  current visibility toward `table`.
- **Visibility:** the query itself and its cost are `public` (the check, the day spent); the *results* start at
  whatever visibility they already had (commonly `referee`) and widen to `table` via `reveal` facts — never to
  the acting player's `private` scope, and identity-last per the fact-kinds catalog's rule (a widened `reveal`
  exposes circumstance before it exposes an actor's name).
- **Do not:** access failure narrates and stops — no roll, no day cost (Spec §10.1). The screen must not let a
  failed-access attempt reach the check step at all.

### 2.4 Degrade/pause + save/recover (M1-10, building on M0-08's export)

One screen serving two entry points: the degradation ladder's rung 4 (engine fault) and a player-initiated
save/export.

```
┌─────────────────────────────────────────────────────────┐
│  MAGGIE: "Something's gone sideways. Nothing's lost."      │
│                                                             │
│  [ Export save file ]   [ Import / recover ]                │
│                                                             │
│  last autosave: day 14, 2 minutes ago                       │
└─────────────────────────────────────────────────────────┘
```

- **Projections:** none — this screen reads persistence state directly (`schemaVersion`, `contentHashes`, last
  autosave timestamp from M0-08's IndexedDB layer), not ledger projections.
- **Visibility:** whole-screen `referee`/host-only in effect — nothing here is a per-player view; it replaces
  the shared screen entirely while active.
- **Do not:** no partial/half-broken state ever shown — per INV-14, rung 4 is pause + autosave + this screen,
  never a blank page or a stack trace (Spec §17). Rungs 1–3 stay in-panel (generic incident, oracle-only beat,
  canned line) and never reach this screen at all.

## 3. Screens M1 does not build (inventory only)

| Screen | Shows | Projections | Visibility | Milestone |
|---|---|---|---|---|
| **Setup flow** | Campaign seed entry, player roster, character/objective assignment | none yet (M0-05/M0-06 own the underlying facts) | `private` per player once objectives assign | M0 (shipped, no dedicated screen doc existed before this one) |
| **Comms** | Comms-window menu of agenda actions; NPC agenda participation | agenda action list (§10.2) | `public` during the window (per rulebook §3.2, "the feed lights up for everyone simultaneously"); the menu content itself is `private` to the holder | M2 (comms-window ordering, agendas) |
| **Transit** | Jump plot, check result, day cost | `check.reported` (`public`), `clock.tick` (`referee`, day cost) | `public` for the plotted jump and its check | M0 (shipped, generic; M1 adds no new transit UI) |
| **Arrival** | Sale settlement, manifest reconciliation | `sale.settled` (`public`) | `public` | M0 (shipped, generic; M1 adds no new arrival UI) |
| **Confrontation** | Accusation, envelope-open, vote | `confrontation.opened`, `envelope.opened`, `vote.recorded` (all `public` once posted) | `public` once opened; the envelope's contents are `private` until opened | M2 (needs comms-window ordering + agendas) |
| **Black-box print view** | Full campaign trace, all scopes lifted, commitment preimages | none — a one-time full-ledger dump, not a live projection | all scopes widen to `public` for this view only, campaign-end | M4 (print pack) |

## 4. Flow map

```
                 ┌─────────────┐
                 │ Setup flow  │  (M0, no dedicated screen)
                 └──────┬──────┘
                        ▼
        ┌───────────────────────────────┐
        │   Hand-to interstitial (M0-07) │◄──────────────┐
        └──────────────┬────────────────┘                │
                        ▼                                 │
   ┌─────────┐   ┌──────────┐   ┌─────────┐   ┌─────────┐│
   │ DOCKSIDE│──▶│  COMMS   │──▶│ TRANSIT │──▶│ ARRIVAL ││
   │ (§2.1)  │   │ (§2.2    │   │ (M0,    │   │ (M0,    ││
   │ market  │   │ overlay) │   │ generic)│   │ generic;││
   │         │   │          │   │         │   │ §2.3    ││
   │         │   │          │   │         │   │ overlay)││
   └─────────┘   └──────────┘   └─────────┘   └────┬────┘│
                                                      └────┘
   any beat, any rung 1–3 failure → generic/oracle/canned line, same beat's main panel
   any beat, rung 4 (engine fault) → §2.4 degrade/pause screen, full-screen, blocks the turn cycle
   player-initiated save/export → §2.4 degrade/pause screen (the "Export save file" entry point)
```

## 5. Extrapolation notes (for the M1-00 PR)

- **The interrogation and evidence overlays are not phase-track beats.** The Spec never says they are; both are
  triggered actions available *within* an existing beat's main panel, not new entries in `PhaseTrack.tsx`'s
  four-beat list. Chosen because rulebook §3.1 describes the phase track as "the four beats of the current
  turn" — a fixed structural element the Spec ties to turn cadence, not to the number of possible actions within
  a beat.
- **Degrade/pause replaces the shared screen entirely rather than rendering in the main panel.** Chosen because
  Spec §17 rung 4 says "surface a recover/export screen," and a screen that must remain reachable even when the
  ledger/projections are in an unknown state can't safely assume the status bar/phase track/ticker (which all
  read projections) still render correctly.
