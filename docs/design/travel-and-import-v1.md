# Travel and Import v1 — M3 design

**Status:** design input, gates every M3 packet · **Owner of changes:** design PRs precede code
(CLAUDE.md hard rule) · **Spec refs:** §7.2 (information horizon, INV-9), §15 (plugin API), §18
(persistence), §21.3 (M3 acceptance) · **Rulebook:** §13 (bring your own characters)

M3 is "distance and BYO characters." Everything below is a boundary an M3 packet builds against,
so no packet has to guess. Decisions are recorded with their reasoning, because an unrecorded
correct guess is still a defect.

---

## 1. Owner decisions (2026-07-25)

**1.1 The committed sector fixture is fictional.** Tests and the exit demo parse an invented
SEC-format sector with original world names and UWPs. No third-party map data enters the
repository. Real travellermap.com exports are imported by the user at runtime and stored locally,
which is what Spec §15 already describes ("a one-time user-driven import ... stored locally,
static-hosting compliant, offline thereafter") and what its fair-use hygiene line requires
("original entries only").

**1.2 Character import targets travtools' real `Character` interface.** Source of truth is the
sibling repository at `/Users/gvh/Development/travtools/apps/travtools-web/src/types/index.ts`
(interface `Character`, backed by that app's Supabase `characters` table). It is read-only
reference; nothing in this project modifies it.

> **Recorded deviation.** travtools imports XLSX and exports CSV. It emits no character JSON
> today. Spec §21.3's "Traveller import round-trips travtools JSON" therefore means Telemetry
> Engine round-tripping a JSON serialization of that shape — import, export, byte-identical — not
> validation against a real travtools export file. This is honest and fully testable, but it is
> less than the Spec's wording implies, and no commit may claim otherwise. If travtools ever
> gains character JSON export, a follow-up card should validate against a real one.

**1.3 `Ship` is minimal:** jump rating, fuel capacity, current fuel. Enough for Spec §15's
`validateJump` and `fuelCost` to be real rather than half-implemented. No fuel scoops, refuelling
rules, cargo capacity, or ship combat — travtools already owns shipbuilding, and Spec §7.3's
"resist academically interesting" applies here as much as to the economy.

**1.4 Career edges implement only the edges whose target systems exist.** Merchant (reroll one
Broker check) and the negotiated catch-all for everyone else run against M1's real skill-check
system. Scout needs M4's exploration, Agent needs M5's espionage, Army/Marine needs M5's
engagement resolver — all three are declared in the registry and marked deferred. Complete data,
zero faked mechanics.

---

## 2. Scope of rulebook §13 in M3

Rulebook §13 describes the whole BYO-character experience. M3 builds the part with existing
substrate underneath it.

| §13 item | M3 | Why |
|---|---|---|
| 1. Enter name, UPP, skills — or import JSON | **In** | The milestone's point. Both paths required; manual entry is not optional (the "on paper in 1981" case). |
| 2. Careers grant a pillar edge, once per session | **Partly in** | Merchant and negotiated only, per §1.4. |
| 3a. Cash muster-out arrives as funds | **In** | `funds` is real derived state today. |
| 3b. Ship shares reduce the Obligation's principal | **Deferred** | See §5.3 — there is no principal to reduce. |
| 3c. Weapons and gear enter inventory | **Deferred** | No inventory system exists; it is a separate schema needing its own catalog entry. |
| 4. Contacts become journal seeds | **Deferred** | Feeds patron and incident generation, which M3 does not otherwise touch. |
| 5. Linking events as table canon | **Deferred** | Same reason. |

**In-app character creation (the "career walk" in §13's preamble) is out of M3.** The milestone is
*bring your own* characters. Rolling one in-app is a substantial system with no bearing on Spec
§21.3's acceptance list.

---

## 3. Sector storage, and what it does *not* touch

**Store.** Imported sectors live in their own IndexedDB object store (`sectors`), keyed by sector
id, **not** inside the campaign save. Rationale: a sector is user content reused across campaigns
— the same reason rulebook §13 says characters "persist in the roster across campaigns" — and
embedding a whole sector blob in every save would duplicate it per campaign for no benefit.

**Schema.** The store carries its own `schemaVersion`, independent of the save's. Version bumps
follow Spec §18's rule: a written migration or an explicit refusal, never silent best-effort
loading.

**Campaign linkage.** A campaign records the sector it was played against as a `contentHashes`
entry under the reserved key `sector:<sectorId>`. This reuses the existing content-hash machinery
in `packages/engine/src/persistence/index.ts` rather than inventing a parallel mechanism.

**Mismatch behavior: warn, do not fail.** Loading a campaign against a different sector produces
the existing `content-hash-mismatch` warning and replays under current content. This deliberately
follows the shipped precedent — `loadLegacyV1Save` already warns on content-hash drift and fails
loudly only on `schemaVersion` — and it is correct here for a reason worth stating plainly:

> **In M3, sector data is presentation input, not ledger input.** Distance feeds staleness, which
> feeds *rendered* feed lines. Nothing in M3 commits a distance to the ledger: `validateJump` and
> `fuelCost` are pure and return values (M3-06), and rendered text is never parsed back into facts
> (INV-12). So `derive(facts)` does not read sector data, and INV-3's "replay yields byte-identical
> state" is not at risk from a sector change. A warning is the honest signal; a hard failure would
> imply a determinism threat that does not exist.

If a later milestone commits distances or jump results as facts, this decision must be revisited
in the same commit that does so. Noted here so that change is not made silently.

---

## 4. Trust mode — three states, not two

Spec §15: with no sector data, `distance()` returns `'unknown'` and MAGGIE "accepts the crew's
count and confirms arithmetic only when asked."

**Finding (2026-07-25): the shipped code collapses two distinct states, and the result is wrong.**
`packages/engine/src/render/feed.ts`'s `renderFeed` treats `distanceParsecs === "unknown"` as
"read the latest known price outright" — `marketAt(facts, hex, day)`, today's price, no staleness
at all — while `feedLine` simultaneously renders "by the crew's count," implying a crew-supplied
count was used. It was not; nothing is ever passed. Showing a remote world's *current* price is
exactly the impossible information the information horizon exists to prevent, and it is a worse
failure than a stale price because it is silently plausible.

M3-05 resolves this into three explicit states:

| State | Distance used | Feed shows | Line says |
|---|---|---|---|
| **Charted** — sector loaded, both hexes known | real `distance()` = d | `marketAt(hex, day − 7d)` | stale by d weeks, as today |
| **Trusted** — no distance, crew supplies count c | c, unverified | `marketAt(hex, day − 7c)` | stale by c weeks, *by the crew's count*; MAGGIE verifies the arithmetic, not the count |
| **Uncounted** — no distance, no crew count | none | **no price line at all** | MAGGIE states she cannot date the figure |

The third state must not fall back to the current price. Omitting a line is already the
established pattern in `renderFeed` — goods with no `market.tick` history are omitted rather than
"rendered with a fabricated price," per its own comment. Undatable prices get the same treatment
for the same reason.

**Voice.** The existing charted and trusted lines in `feed.ts` are good MAGGIE and stay. The
uncounted line is new and must pass `pnpm lint:content` plus `docs/design/maggie-voice.md`:
information first, flat declarative, no apology, no exclamation points, and no performed regret.
It states what she does not have and what would fix it. Note maggie-voice §6's hard nevers include
the word "unfortunately."

---

## 5. New fact kinds

Three, all added to `docs/design/fact-kinds-v0.md` in the same commit as this doc, per CLAUDE.md's
catalog-before-code rule. All follow the catalog's naming rule (`domain.event`, past tense) and
its exact-payload rule (no optional grab-bags).

**5.1 `crew.imported`** — `{crewMemberId, name, career, sourceHash}`, visibility `table`.
The roster addition itself. `sourceHash` is the hash of the imported character payload and is the
**idempotence identity**: re-importing the same character must not post its benefits twice
(M3-08's acceptance). Visibility is `table` because who joined the crew is shared knowledge.

**5.2 `benefit.cashGranted`** — `{crewMemberId, amount}`, visibility `table`.
Muster-out cash. Requires extending `fundsProjection` in `packages/engine/src/economy/funds.ts`,
which today sums only `sale.settled` and `purchase.settled` and whose own comment anticipates
exactly this ("Wages, fines, etc. are out of scope until their kinds exist — catalog PR first").
**`funds.ts` is therefore added to M3-08's owned paths.**

**5.3 No ship-share or obligation kind — deferred, with reasoning.**
Rulebook §13.3 says ship shares "reduce the Obligation's principal." There is no principal.
`obligation` exists only as a *clock id* (`clock.tick {clockId, delta}`, an integer counter summed
by `clocksProjection`); clocks are counters, not money. `packages/engine/src/render/renderer.ts`
already records the gap in a comment: "No obligation/debt fact kind exists in kinds-v0.ts yet
(M1's economy work covers goods pricing, not loan/debt tracking)." Inventing a principal to
decrement would be building a debt system sideways, through a character-import card, which is how
scope creep actually happens. Deferred to the milestone that builds obligation/debt properly —
the same treatment already applied to inventory (§2, item 3c), for the same reason.

**5.4 `edge.used`** — `{crewMemberId, edgeId, targetFactId}`, visibility `public`.
Career edge consumption, and the state behind "once per session." Public because using an edge is
an open table action. No separate `edge.granted` kind: entitlement is derivable from the crew
member's career, so granting needs no fact.

**`implies` for all three: none.** These are import-time and table-level bookkeeping with no
`referee`-scoped cause behind them, so there is nothing to annotate. The catalog's standing
guidance applies — when unsure, omit; under-claiming costs a little evidence value, over-claiming
leaks attribution (INV-10).

---

## 6. Consequences for the M3 board

Amendments this doc makes to cards already written:

- **M3-04** — mismatch behavior is a `content-hash-mismatch` **warning** through the existing
  path, not a hard load failure (§3). Its acceptance test changes accordingly.
- **M3-05** — implements three trust-mode states (§4), including fixing the shipped
  current-price-for-a-remote-world bug. Its acceptance tests gain the uncounted state.
- **M3-08** — posts **cash only**. Ship shares are deferred (§5.3). `funds.ts` joins its owned
  paths (§5.2).

No other card changes.
