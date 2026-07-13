# Incident content format v1

**Status:** M1-11a. Supersedes the informal `incident-cards-spec` Spec §8.2 references — no such
file exists in this repository (it predates it, or never made the jump); this doc, plus the JSON
Schemas it points at, is the actual authoritative shape from here on.

## 1. The four pillars

Content is organized under `content/decks/<pillar>/`, one deck per pillar:

| Pillar | Milestone | Status |
|---|---|---|
| `trade` | M1 | ships in this doc's own deck, `content/decks/trade/` |
| `exploration` | M4 | format must accommodate it; no files required yet |
| `espionage` | M5 | format must accommodate it; no files required yet |
| `warfare` | M5 | format must accommodate it; no files required yet |

`incident-frame.schema.json`'s `pillar` enum already lists all four so a frame can't be authored
against a pillar that doesn't exist, even before that pillar's own milestone starts.

## 2. Directory layout

```
content/decks/<pillar>/
  frames.json        — array of IncidentFrame (required)
  slot-tables.json    — named library of reusable SlotTables (optional)
```

Both are validated by JSON Schemas that live with the engine, not with content
(`packages/engine/src/generate/incident-frame.schema.json`,
`.../slot-tables.schema.json`) — Spec §19: "schemas are engine; instances are content," so the
schema is the same contract the runtime type (`IncidentFrame` in `generate/frame.ts`) already
enforces in code, not a second, driftable description of it.

## 3. IncidentFrame fields

Spec §8.2's abridged field list: `{pillar, trigger, surface_event, innocent_twin,
traitor_action, evidence_trail[], confrontation_scene, clock_effect}`. Mapped to what actually
exists in `incident-frame.schema.json` today:

| Spec field | Status | Notes |
|---|---|---|
| `pillar` | **implemented** | one of the four pillars above |
| `surface_event` | **implemented**, as `surfaceTables` | a full `actor × motive × method × location × trace` slot composition (Spec §8.1), not a literal string |
| `innocent_twin` | **implemented**, as `innocentTwin` | ≥1 cause-fact spec, each with its own complete slot tables |
| `evidence_trail[]` | **implemented**, as `evidenceTrail` | each entry now requires an `access` precondition (see §5) |
| `confrontation_scene` | **implemented**, as `confrontationScene` | optional string |
| `clock_effect` | **implemented**, as `clockEffect` | optional `{clockId, delta}` |
| `claimant` | **forward-looking placeholder** | see §4 |
| `trigger` | **deferred, not in the schema at all** | see §4 |
| `traitor_action` | **deferred, not in the schema at all** | see §4 |

## 4. What's deferred, and why

**`claimant` (forward-looking, in the schema now):** Spec §10.2 describes agenda actions
"claiming" matching incident frames — the mechanical seam where a traitor's action and the
innocent twin produce an identical surface. No `Agenda`/`AgendaAction` type exists yet (that
machinery is M2), and no code reads `frame.claimant` today. It's in the schema as
`{agendaActionId: string}` anyway, because content authored *now* (this deck) shouldn't need
reshaping once claiming actually lands — a content author can fill it in, or leave it absent,
and nothing breaks either way today.

**`traitor_action` (deferred entirely, not even a schema field):** unlike `claimant`, a real
traitor-action *effect* only means something once the M2 agenda machinery can actually resolve
"a queued agenda action claims this frame instead of the twin instantiating." A placeholder field
here wouldn't be inert the way `claimant` is — it would need a real shape (what does a traitor
action *do*?) that doesn't exist to define yet. Spec §19's balance lint ("every incident frame
has both `innocent_twin` and `traitor_action`") is deferred along with it — this deck is
twin-only, matching `generate/frame.ts`'s own M1-05 decision ("claimant hook is stubbed... twin
path only").

**`trigger` (deferred entirely):** an activation precondition beyond cooldown (e.g. "only after
day 10," "only if X already happened"). Nothing in the engine's frame-selection path
(`generate/frame.ts`'s `eligibleFrames`) reads or filters on anything beyond cooldown state
today. Adding an unused field here would be speculative; it can be added, schema-first, whenever
a real selection mechanism needs it.

## 5. Balance lints (Spec §19)

Spec §19 bundles several balance checks together; not all apply to this content type:

- **"tier weights sum to 1"** — this is an *agenda* field (`Agenda.tier: 'orthogonal'|
  'parasitic'|'hostile'`, Spec §10.2), not an incident-frame field. Agendas don't exist as
  content yet (M2). Doesn't apply to this deck.
- **"cooldowns within bounds"** — enforced structurally by the schema
  (`cooldownWeeks: {exclusiveMinimum: 0}`), not a separate hand-written check.
- **"every incident frame has both `innocent_twin` and `traitor_action`"** — `innocent_twin` is
  schema-required (`minItems: 1`); `traitor_action` is deferred per §4 above, so this deck is
  twin-only by design, not by omission.
- **"every evidence trail entry has an access precondition"** — enforced structurally by the
  schema (`evidenceTrailEntry.access` is required, reusing `evidence.ts`'s own
  `AccessPrecondition` union rather than a parallel type).
- **Referential:** `content-lint`'s deck scan additionally rejects duplicate frame ids within a
  deck (not schema-checkable — would otherwise silently collide in `eligibleFrames`'s
  cooldown-state map, which is keyed by id).

`sim:smoke on the deck within thresholds` (this task's own Tests-first bullet) isn't a real gate
yet either: `packages/sim`'s runner is a no-op skeleton until M1-12. In its place,
`packages/engine/src/generate/trade-deck.test.ts` fires every frame in the real deck across
several seeds and asserts none of them throw (including compose()'s "never prose" guard) — a
real, running check today, not a placeholder for one that doesn't exist yet.

## 6. Slot tables (`slot-tables.json`)

A **named library** of reusable `SlotTables` groups — e.g. `content/decks/trade/slot-tables.json`
ships one group, `trade-common`, collecting the actor/location/trace entries several trade frames
draw from. This is an authoring convenience and a single reviewable place to see a pillar's table
vocabulary. **It is not resolved by reference at runtime**: a frame still inlines its own complete
`surfaceTables`/`innocentTwin[].tables`, matching `generate/compose.ts`'s existing
`SlotTables` type exactly. Building real cross-file table references (a frame saying "use entries
X, Y from the `trade-common` library") is a genuine future improvement, not required by anything
in Spec §8.1 (which only specifies that entries are content and the composer is engine — silent
on how content organizes itself), and isn't built here to avoid inventing a resolution mechanism
no task has asked for yet.

## 7. "Never prose" — a content-authoring note

`compose()` (Spec §8.1: "never prose") throws if a slot field's string value looks like a
sentence: more than 4 words, or ends in sentence punctuation with more than one word. This
applies to **every** `factFields`/`surfaceFields` value on every axis, on both a frame's own
`surfaceTables` and each `innocentTwin[].tables`. Content authors should treat every field value
as a short, hyphenated tag (`"power-flicker"`, not `"a brief power flicker in the hold"`) — the
full MAGGIE-voiced sentence a player eventually hears is a separate, later rendering concern
(either a bespoke per-frame announce template, matching `content/frames/demo/
announce-templates.json`'s existing pattern, or the generic renderer's humanize()-based
fallback, `packages/engine/src/render/renderer.ts`'s `incidentSurface` template) — never the raw
tag value itself, and never authored as a finished sentence at the content layer.

**Watch item for whoever writes those bespoke templates:** turning a neutral tag into a sentence
is easy to get wrong in the suspicion-editorializing direction the voice bible bans (§2.6,
anti-pattern row 3) — e.g. `unlisted-buyer` renders fine as "an unlisted buyer" but not as "a
suspicious unlisted buyer" or "an unauthorized buyer" (both assign motive/guilt a tag alone
doesn't carry); `sensor-ghost` renders fine plainly but not with added drama words. The tags in
this deck were reviewed and are clean as tags; this is guidance for the next authoring pass, not
a defect in them.
