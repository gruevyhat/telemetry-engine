# Screens v2 — social game, transport, and trust map

**Status:** M2-00 design draft for owner approval  
**Spec refs:** §3.3, §6, §10.2, §16, §21.3; rulebook §8.2  
**Hard boundary:** the shared-screen host alone owns the full ledger. A phone receives only public facts plus that player's private slice.

## 0. Decisions this document is designed around

These are recommendations until the owner approves them in `docs/tasks/M2-00.md`.

1. Agenda actions are declarative content: access, fact-proposal templates, implication metadata, payout/exposure metadata, and the action id used by incident-frame claimants.
2. `agenda.actionTaken` records a durable queued intent at selection time. The host rehydrates its effect from the content id and pinned content hash when COMMS closes; no second queue fact kind is needed.
3. New catalog kinds are required for private objectives, deferred-reveal tokens, captain assignment, and removal from the crew. `confrontation.resolved` is sufficient for let-it-lie.
4. Transport protocol code lives below both UIs and cannot accept a `Ledger`. A separate WebRTC adapter owns trystero; QR generation stays in the shared UI.
5. Save schema v2 performs a one-way migration from M1. It persists transport replay metadata and encrypted referee material, but not live peer ids or one-time pairing tokens.
6. A phone reload requires re-pairing. An ordinary network disconnect does not: the phone retains its in-memory key and reconnects to the same session.
7. Confrontation ballots are public as cast, matching the bot policy's `majority-so-far` rule. COMMS actions remain sealed until close.

## 1. Trust topology

```text
                           table-visible output
                    ┌────────────────────────────┐
                    │ shared-screen host         │
                    │ full ledger                │
                    │ phase interpreter          │
                    │ scoped-view builder        │
                    │ timer + comms batch owner  │
                    └───────────┬────────────────┘
                                │ per-player encrypted envelopes
                    ┌───────────┴───────────┐
                    │ transport protocol     │
                    │ no Ledger input        │
                    │ no React dependency    │
                    └──────┬─────────┬──────┘
                           │         │
                    ┌──────▼───┐ ┌───▼──────┐
                    │ Zhan phone│ │Deuce phone│
                    │ Zhan slice│ │Deuce slice│
                    └──────────┘ └───────────┘
```

The host can inspect referee state by deliberately instrumenting its browser. Encryption at rest and per-player transport encryption prevent accidental disclosure and misrouting; they do not make the host cryptographically trustworthy.

## 2. Setup, pairing, and agenda deal

### 2.1 Shared screen — player pairing

```text
┌─────────────────────────────────────────────────────────┐
│  PAIR CREW                                              │
│                                                         │
│  Zhan       ready                                       │
│  Deuce      show private pairing card                   │
│  Brennan    waiting                                     │
│                                                         │
│  [ Continue when all required seats are ready ]         │
└─────────────────────────────────────────────────────────┘
```

Selecting a seat opens the existing hand-to interstitial, then shows one QR for that player only. The QR contains the app origin/version, session id, player id, a one-time claim token, and that player's derived transport key. It is never shown in the ordinary table-visible layout. A manual code encodes the same bytes.

The phone claims the seat once. The host invalidates the bootstrap token, binds the connection to the player id, and sends a full scoped snapshot. A second claim for the same seat requires an explicit host-side replace action; it never silently evicts the first phone.

### 2.2 Phone — paired but not dealt

```text
┌───────────────────────────┐
│  TELEMETRY ENGINE         │
│  Zhan                     │
│                           │
│  Paired. Waiting for deal.│
└───────────────────────────┘
```

### 2.3 Deal completion

The host makes one independent agenda draw per player. The shared screen reports only `3 packets ready`. Every phone receives the same packet shell: objective, sealed-status marker, and COMMS tab. A negative agenda result supplies routine COMMS content, not an empty or visibly different layout.

### 2.4 Proposed agenda-action content contract

The action format stays declarative and statically lintable:

```ts
interface AgendaActionContent {
  id: string;
  labelTemplate: string;
  access: AccessPrecondition;
  target?: FactSelector;
  proposals: ActionFactTemplate[];
  implies: ImpliesRule[];
  payout: number;
  exposure: { clockId: string; delta: number };
}

interface ActionFactTemplate {
  kind: string;
  actor: ActorRef | { ref: "self" };
  payload: Record<string, JsonScalar | ActionValueRef>;
}

type ActionValueRef =
  | { ref: "self" }
  | { ref: "currentDay" }
  | { ref: "currentHex" }
  | { ref: "target"; field: string };
```

`target` remains the existing conjunctive `FactSelector`; it cannot run joins or arbitrary code. Content lint proves every `target.field` exists on every selected kind, every proposal kind/payload is registered, and every frame claimant refers to one action id. The selected target id and action id are the only player-supplied values; the host expands templates and validates proposals. Labels are template keys, not engine prose.

## 3. Timed COMMS window

### 3.1 Shared screen

```text
┌─────────────────────────────────────────────────────────┐
│  COMMS WINDOW                                  00:30    │
│                                                         │
│  Phones up. The window closes for everyone together.   │
│                                                         │
│  Zhan       connected                                   │
│  Deuce      connected                                   │
│  Brennan    connected                                   │
└─────────────────────────────────────────────────────────┘
```

The host timer is authoritative. It shows connection state, never acknowledgement state, action count, menu presence, or who finished early. Early acknowledgements are accepted as transport receipts but do not close or unlock anything.

### 3.2 Phone — identical shell, scoped content

```text
┌───────────────────────────┐
│  COMMS              00:30 │
│                           │
│  PRIVATE TRAFFIC          │
│  [ one scoped item ]      │
│                           │
│  [ Queue action ]         │
│                           │
│  Window remains locked.   │
└───────────────────────────┘
```

The action holder and routine client have the same regions, spacing, timer, and locked acknowledgement. Their text differs because their visibility slices differ. Selecting an action sends its id, any target fact id offered by the host, and an idempotency key; the host rechecks that target against the action selector, then durably records intent through the phase engine. Effects remain unapplied until close.

### 3.3 Close and private feedback

At zero, the host derives the queued intents, shuffles them on `comms-order`, validates sequentially, commits effects/fizzles, and advances once. Next COMMS, the actor whose action fizzled receives a private rendered explanation derived host-side from the referee fact. The `action.fizzled` fact itself never leaves the host.

## 4. Confrontation and forced envelope burn

### 4.1 Open and discuss

```text
┌─────────────────────────────────────────────────────────┐
│  CONFRONTATION                                  05:00   │
│  Zhan accuses Deuce.                                    │
│                                                         │
│  [ Accuse ]  [ Search ]  [ Let it lie ]                 │
│                                                         │
│  Explicit actions and votes are logged.                 │
└─────────────────────────────────────────────────────────┘
```

MAGGIE does not listen to or evaluate the discussion. The timer owns only the action window. If it expires, the captain selects and owns the recorded resolution.

### 4.2 Accusation vote

Each phone receives the same public question and one vote control. Votes become public as cast: each ballot appends a new `vote.recorded` fact containing the cumulative per-player tally, so the latest tally supports the bot policy's `majority-so-far` rule without mutable vote state. When a majority carries, the final tally causes the interpreter to atomically open the target's envelope, forfeit the objective, and mint the deferred-reveal token. When it fails, only the tally and failed resolution post.

The accused has no voluntary-open control. NPC targets have no burn branch.

### 4.3 Other resolutions

- **Search:** reuse the evidence access/check/atomic-cost path; show only committed findings.
- **Let it lie:** commit `confrontation.resolved` with the unresolved outcome and no hidden reveal.
- **Replace captain:** majority vote; latest committed captain assignment drives the projection.
- **Put off ship:** unanimity minus the target; commit the removal and resulting position consequence.

## 5. Disconnect and hotseat fallback

```text
┌─────────────────────────────────────────────────────────┐
│  COMMS PAUSED                                           │
│  Deuce disconnected with 00:17 remaining.               │
│                                                         │
│  [ Wait for reconnect ]   [ Continue by hotseat ]       │
│  [ Export save ]                                        │
└─────────────────────────────────────────────────────────┘
```

Any required-phone disconnect pauses the timer before another tick. The comms batch remains unresolved. Reconnect receives the latest snapshot plus the same remaining duration; duplicate queued-action ids are ignored. Hotseat fallback discards no intent and routes each private view through the existing hand-to interstitial.

A phone page reload loses its key and returns to pairing. The host remains paused until that seat re-pairs or hotseat is chosen.

## 6. Black-box verification

At campaign end the host decrypts referee material in memory and builds a one-time black-box artifact. The shared screen lists every secret draw with stream id, draw index, result, salt/preimage, public commitment hash, and verification result. Live ledger visibility is not mutated to render this view.

```text
┌─────────────────────────────────────────────────────────┐
│  BLACK BOX                                              │
│  12 secret draws verified. 0 failed.                    │
│                                                         │
│  [ Review full record ]  [ Export audit artifact ]      │
└─────────────────────────────────────────────────────────┘
```

Any mismatch is a visible failed audit, never a warning that can be dismissed into a pass.

## 7. Host/client message contract

Every application message carries `{protocolVersion, sessionId, hostEpoch, sequence, messageId, type, payload}`. Host sequence is monotone within an epoch. Client commands add `{playerId, clientSequence}`, but the host derives authority from the connection's pairing binding and rejects a mismatched payload `playerId`. The host deduplicates commands by `(boundPlayerId, clientSequence)` and snapshots supersede all earlier host messages.

| Message | Sender → receiver | Visibility | Encryption boundary | Replay/idempotency | Disconnect behavior |
|---|---|---|---|---|---|
| `pair.claim` | phone → host | private bootstrap | WebRTC plus one-time QR key | token single-use; duplicate returns current binding | retry while token valid; otherwise re-pair |
| `state.snapshot` | host → one phone | public + that player's private slice | encrypted to player key | replaces prior state through included host sequence | resent after reconnect |
| `comms.open` | host → each phone | public timing + scoped menu | one encrypted envelope per player | same window id replaces duplicate | timer pauses if a required client drops |
| `comms.queue` | phone → host | private command | encrypted to bound player key | client sequence queues at most once | resend safely until acknowledged |
| `comms.ack` | host → one phone | private receipt | encrypted to player key | repeats original client sequence | resent after reconnect; never closes early |
| `comms.closed` | host → all phones | public result marker | per-player encrypted envelope | one close per window id | reconnect receives post-close snapshot |
| `feedback.private` | host → one phone | private presentation derived from referee facts | encrypted to player key | feedback id shown once, retained in snapshot | appears on next successful window/snapshot |
| `vote.open` | host → all phones | public | per-player encrypted envelope | one topic id | pause only if that vote requires the missing seat |
| `vote.cast` | phone → host | public once committed | encrypted in flight; public after interpreter commit | one vote per player/topic; correction requires a new explicit vote fact | resend safely until committed |
| `session.pause` | host → all phones | public | per-player encrypted envelope | latest pause epoch wins | surviving clients remain locked |
| `session.resume` | host → all phones | public | per-player encrypted envelope | valid only for current pause epoch | replaced by snapshot if missed |
| `blackbox.ready` | host → shared screen only | campaign-end lifted view | never transported to live phones | artifact hash identifies exact export | generated only from complete host state |

No message accepts arbitrary facts from a phone. A client sends intent; the host resolves and commits.

## 8. Persistence and key lifetime

Recommended save v2 additions:

```text
security:  algorithm ids, public salt, encrypted referee/preimage blob
transport: session id, player bindings, host epoch, next host sequence, last client sequence per player
```

Persisted: facts (with referee payload material encrypted), seed state, content hashes, commitment hashes, session id, player-to-seat binding, and replay counters.

Not persisted: live WebRTC peer ids, connection objects, one-time QR tokens, phone-held keys, timer handles, DOM state, or rendered text. A running host reconstructs per-player keys from campaign seed, security salt, and player id inside the sealed context. A reloaded phone must re-pair.

M1 save migration is one-way: parse and replay v1 under the existing validator, generate the new salt/key context, encrypt referee material, and immediately persist/export v2. A malformed or future-version save still fails loudly.

### 8.1 Proposed social fact-catalog additions

| Kind | Payload | Visibility | Purpose |
|---|---|---|---|
| `objective.assigned` | `{playerId, objectiveId, successCondition}` | explicitly `private:[playerId]`; registry default remains referee as fail-closed | durable private objective state |
| `deferredReveal.minted` | `{playerId, objectiveFactId}` | referee | one spendable token created by a forced envelope burn |
| `deferredReveal.cashed` | `{tokenFactId}` | referee; atomic with the public `reveal` it causes | prevents one token being spent twice |
| `captain.assigned` | `{playerId, reason}` | public | latest fact is the captain projection |
| `crew.removed` | `{actorId, atHex, reason}` | public | records the governance outcome and feeds position/roster projections |

`agenda.actionTaken` needs no payload change: `actionId` is the durable queued intent and the existing `frameClaim` field remains unused/reserved unless the selected target determines it at queue time; it is never backfilled by mutation. At close, effects or `action.fizzled` link back through `causes`, and the resolver skips any intent that already has such a result. `confrontation.resolved` records let-it-lie, so that branch needs no new kind. Every addition follows the catalog-first rule before registry or projection code.

## 9. Package boundary

```text
packages/engine                 ledger, scoped views, phase commits
        │ scoped DTOs only
        ▼
packages/transport              protocol types, codecs, sequencing, encryption envelopes
        │                       no engine, React, trystero, or Ledger dependency
        ▼
packages/transport-webrtc       trystero adapter; no game rules or fact projection
        ├──────────────┐
        ▼              ▼
packages/ui-shared     packages/ui-phone
host bridge + QR       thin client state + controls
```

`packages/ui-shared` is the only layer that may combine an engine `Ledger` with transport. It first calls `ledger.visibleTo(...)`, then converts the already-scoped facts to protocol DTOs. The transport package has no API capable of receiving a `Ledger` or referee view.

Recommended dependencies after owner approval: the Spec-prescribed [trystero](https://trystero.dev/) in `packages/transport-webrtc`, and browser-capable [qrcode](https://github.com/soldair/node-qrcode) plus its TypeScript definitions in `packages/ui-shared`. Both new workspace packages must be added to the root typecheck gate; neither dependency enters `packages/engine`.

## 10. Appendix A touchpoints

- Agenda setup adds one private/referee deal result and one public commitment per player, including negative results.
- F14's secret cause-resolution draw gains its verifiable preimage record while the public commitment remains visible.
- The comms action that causes F11–F13 is queued as `agenda.actionTaken`, resolved only at window close, and may claim the incident frame without changing its surface.
- F22 includes the public per-player `vote.recorded` tally.
- F23 occurs only after that vote carries; the envelope burn, objective forfeit, and deferred-reveal mint share provenance.

## 11. Do-not summary

- No full ledger, referee fact, foreign-private fact, preimage, or key leaves the host in a client payload.
- No comms action resolves before host close, and tapping speed never affects order.
- No voluntary envelope-open control exists.
- No microphone, transcription, or free-text adjudication exists.
- No renderer output becomes an engine input.
- No documentation or UI claims the host is cryptographically unable to cheat.
