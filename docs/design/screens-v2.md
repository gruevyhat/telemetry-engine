# Screens v2 — social game, transport, and trust map

**Status:** M2-00 approved implementation basis, 2026-07-18
**Spec refs:** §3.3, §6, §10.2, §16, §21.3; rulebook §8.2  
**Hard boundary:** the shared-screen host alone owns the full ledger. A phone receives only public facts plus that player's private slice.

## 0. Decisions this document is designed around

The owner approved these decisions together on 2026-07-18; implementation cards must treat them as normative.

1. Agenda actions are declarative content: access, fact-proposal templates, implication metadata, payout/exposure metadata, and the action id used by incident-frame claimants.
2. `agenda.actionTaken` records each durable queued selection/replacement with its window, target, and client-command ids. The host rehydrates the latest valid selection from the content id and pinned content hash when COMMS closes; no second queue fact kind is needed.
3. New catalog kinds are required for private objectives, deferred-reveal tokens, captain assignment, and removal from the crew. `vote.recorded` needs eligibility/threshold/ballot fields; `confrontation.resolved` is sufficient for let-it-lie.
4. An engine-owned authorized-presentation projector is the only referee-to-private DTO boundary. Transport protocol code cannot accept a `Ledger`; a separate WebRTC adapter owns trystero, and QR generation stays in the shared UI.
5. Save schema v2 performs a one-way migration from M1. It wraps the campaign seed under recoverable Web Crypto key material and persists transport replay/timer metadata plus encrypted referee material, but not live peer ids, QR tokens, or phone keys.
6. A phone or host reload requires re-pairing. An ordinary network disconnect does not: both endpoints retain the in-memory binding key and reconnect to the same epoch.
7. Confrontation ballots are public as cast, matching the bot policy's `majority-so-far` rule. COMMS actions remain sealed until close.
8. Commit/reveal uses the owner-approved `te-commit-v1` scheme: a campaign-seed commitment precedes all draws, and every secret-draw commitment binds its canonical result as well as stream, index, and salt.

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

Selecting a seat opens the existing hand-to interstitial, then shows one QR for that player only. Its URL fragment contains the app origin/version, session id, player id, binding epoch, a cryptographically random one-time claim token, and a cryptographically random per-binding transport key. Fragments are not sent in the page request or retained in referrer headers. The QR is never shown in the ordinary table-visible layout. The camera-independent fallback offers copy/paste and a grouped full-length code encoding the same secret bytes; it is labelled as a private code, not presented as a short room code.

The phone claims the seat once. The host invalidates the bootstrap token, binds the connection to `(playerId, bindingEpoch)`, and sends a full scoped snapshot. A second claim for the same seat requires an explicit host-side replace action; it never silently evicts the first phone. Replacement increments the epoch, generates a new claim token and transport key, sends `pair.revoked` when the old connection is reachable, and rejects every later command from the retired epoch. Because the retired phone never receives the new random key, replacement revokes its ability to decrypt later envelopes.

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

### 2.4 Approved agenda-action content contract

The action format stays declarative and statically lintable:

```ts
interface AgendaActionContent {
  id: string;
  labelTemplate: string;
  access: AccessPrecondition;
  target?: {
    kinds: readonly [RegisteredFactKind, ...RegisteredFactKind[]];
    where?: Omit<FactSelector, "kinds">;
  };
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

`target` is the existing conjunctive selector restricted to a non-empty, finite list of exact registered kinds; it cannot use a kind prefix glob, run joins, or execute arbitrary code. Content lint can therefore prove every `target.field` exists on every selected kind, every proposal kind/payload is registered, and every frame claimant refers to one action id. Offered target ids are generated only from the acting player's authorized presentation view and then rechecked against access and the selector at commit time. The selected target id and action id are the only player-supplied values; the host expands templates and validates proposals. Labels are template keys, not engine prose.

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

The action holder and routine client have the same regions, spacing, timer, and locked acknowledgement. Their text differs because their authorized presentations differ. A player may have at most one current selection per window. Selecting or replacing it sends the window id, action id, any target fact id offered by the host, and a client command id; the host rechecks the target and durably appends `agenda.actionTaken` through the phase engine. The latest valid selection for `(windowId, playerId)` is the queued intent, so replacement never mutates an earlier fact. Effects remain unapplied until close.

### 3.3 Close and private feedback

At zero, the host derives the latest queued intent per player, shuffles them on `comms-order`, validates sequentially, commits effects/fizzles, and advances once. Next COMMS, an engine-owned private-presentation projector converts the actor's referee-scoped `action.fizzled` fact into a typed `{feedbackId, templateKey, reasonCode}` DTO. Rendering happens on the phone; neither arbitrary referee prose nor the fact itself leaves the host.

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

Each phone receives the same public question and one confirmed vote control. Eligible voters are the active PC crew recorded when the topic opens, including the accused; NPCs and removed crew are excluded. A strict majority is more than half that fixed eligible set. Each committed ballot appends a public `vote.recorded` fact containing the per-player tally; ballots are final for that topic, and input errors use the ordinary append-only correction mechanism without silently changing the resolved count. A vote carries as soon as yes ballots exceed half the eligible set and fails when every eligible player has voted without that majority. Disconnect pauses a vote that still requires the missing seat.

When a majority carries, the final tally causes one interpreter transaction to append the target's `envelope.opened`, `objective.forfeit`, and `deferredReveal.minted` facts plus public `reveal` facts that widen all of that player's agenda facts. Every result shares provenance from the carried `vote.recorded` fact. When it fails, only the public tally and failed `confrontation.resolved` fact post. A loyal burn retains every yes ballot in the public record.

The accused has no voluntary-open control but may vote and may call a vote on themself. NPC targets have no burn branch. If the confrontation timer expires without a carried majority, the captain may choose a non-burn resolution or own the recorded failed accusation; captain authority never opens an envelope without the required vote.

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

Any required-phone disconnect pauses the timer before another tick. The comms batch remains unresolved. Reconnect receives the latest snapshot plus the same remaining duration; duplicate client command ids are ignored. Hotseat fallback discards no intent and routes each private view through the existing hand-to interstitial.

A phone page reload loses its key and returns to pairing. The host remains paused until that seat re-pairs or hotseat is chosen. Re-pairing increments the binding epoch and supplies a fresh client-sequence base; delayed commands from every older epoch are rejected. A host reload also loses all phone keys, restores every binding as `re-pair required`, and keeps an active timed step paused.

## 6. Black-box verification

At campaign end the host decrypts referee material in memory and builds a one-time black-box artifact. The artifact includes `te-commit-v1`, the RNG and canonicalization versions, campaign seed and campaign salt, the public `campaign.seedCommitted` fact, and for every secret draw: seed-commitment fact id, stream id, draw index, canonical result, draw salt, public commitment fact id/hash, and ground-truth fact id. The shared screen lists both the seed verification and every draw verification. Live ledger visibility is not mutated to render this view.

The independent verifier performs three checks in order: verify the revealed seed and campaign salt against the setup-time commitment; re-derive the indexed draw from that seed and compare the canonical result; verify the draw hash over the scheme, seed-commitment hash, stream, index, canonical result, and draw salt. Inputs use domain-separated, length-prefixed UTF-8 fields so concatenation is unambiguous. Canonical JSON sorts object keys recursively, preserves array order, rejects non-finite/non-JSON values, and uses versioned finite-number/string encoding. Any failed stage names the exact commitment and stage; a hash match cannot conceal a result that disagrees with the seeded RNG.

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

Every bound application message carries `{protocolVersion, sessionId, hostEpoch, bindingEpoch, sequence, messageId, type, payload}`. Host sequence is monotone within a host epoch. Client commands add `{playerId, clientSequence}`, but the host derives authority from the connection binding and rejects a mismatched payload player or retired binding epoch. The pairing response supplies a fresh sequence base. The host deduplicates commands by `(playerId, bindingEpoch, clientSequence)`; snapshots supersede all earlier host messages in the same epoch. AES-GCM associated data binds the entire header, so a valid ciphertext cannot be replayed under another player, epoch, type, or sequence.

This is the exhaustive M2 protocol inventory. A row may have several typed payload variants, but adding another message type requires adding its authorization and recovery behavior here first.

| Message | Sender → receiver | Visibility | Encryption boundary | Replay/idempotency | Disconnect behavior |
|---|---|---|---|---|---|
| `pair.claim` | phone → host | private bootstrap | one-time claim token + QR key over WebRTC | token is single-use within the offered epoch; exact duplicate returns the result | retry while offer is valid; otherwise obtain a new private card |
| `pair.accepted` | host → one phone | private binding/sequence base | new binding key | one result per claim token | snapshot follows; missed response requires a new claim |
| `pair.revoked` | host → replaced phone | private | retiring binding key | latest binding epoch wins | best effort; host rejects the old epoch even if this is missed |
| `seat.ready` | phone → host | public readiness intent | bound key in flight | one current readiness value per player/epoch | required-seat loss pauses setup or the active timer |
| `state.snapshot` | host → one phone | authorized player presentation | bound key | replaces prior state through included host sequence | resent after reconnect/re-pair |
| `deal.packet` | host → one phone | objective + that player's authorized agenda presentation | bound key | one current packet version; retained in snapshot | resent after reconnect; shared screen learns only packet count |
| `comms.open` | host → each phone | public timing + scoped menu shell | separate bound envelope per player | same window/version replaces duplicate | required-seat loss pauses the window |
| `target.options` | host → one phone | targets from that player's authorized view | bound key | replaces options for `(windowId, actionId, version)` | regenerated and resent from current facts |
| `comms.queue` | phone → host | private intent | bound key | client command id commits at most once; later valid fact replaces current selection | resend until acknowledged; queued facts survive disconnect |
| `comms.ack` | host → one phone | private receipt | bound key | echoes command id and committed fact id | resent in snapshot; never closes early |
| `comms.closed` | host → each phone | public close marker + authorized result | separate bound envelope per player | one close/version per window | reconnect receives post-close snapshot |
| `feedback.private` | host → one phone | typed authorized presentation derived from a referee fizzle | bound key | feedback id retained until acknowledged in later snapshot | delivered on next successful snapshot/window |
| `confrontation.command` | phone → host | public after commit | bound key in flight | typed accuse/search/let-lie/replace/remove command id commits once | unresolved required action pauses; committed command survives |
| `vote.open` | host → all eligible phones | public topic, eligibility, threshold | separate bound envelopes | one immutable eligible set per topic id | missing required voter pauses until reconnect or hotseat |
| `vote.cast` | phone → host | public after commit | bound key in flight | one final ballot per player/topic | resend until `vote.committed`; hotseat may submit for that seat |
| `vote.committed` | host → all phones | public ballot and latest tally | separate bound envelopes | fact id uniquely identifies the ballot | snapshot restores the latest tally |
| `vote.resolved` | host → all phones | public carried/failed result, burn/search/governance result as applicable | separate bound envelopes | one terminal result per topic | snapshot restores the terminal result |
| `session.pause` | host → all phones | public reason and durable remaining time | separate bound envelopes | latest pause epoch wins | surviving clients remain locked |
| `session.resume` | host → all phones | public resumed window/deadline | separate bound envelopes | valid only for current pause epoch | replaced by snapshot if missed |
| `hotseat.begin` / `hotseat.end` | host → affected phone(s) | public routing state; private view stays on host | separate bound envelopes | one mode transition per pause epoch | remote client remains locked until a later snapshot |
| `session.error` | host → one phone | safe typed error code only | bound key when available | refers to rejected message id; has no game effect | retry only when the code says it is safe |

`blackbox.ready` and `blackbox.exported` are host-core → shared-screen local events, not transport messages. They carry the artifact hash and export result only after campaign end; no live phone receives the lifted record. No message accepts arbitrary facts from a phone. A client sends typed intent; only the interpreter resolves and commits.

## 8. Persistence and key lifetime

Approved save v2 additions:

```text
security:  AEAD/KDF/commit scheme ids, public at-rest salt, wrapped campaign seed, encrypted referee/preimage blob
transport: session id, player binding epochs, host epoch, next host sequence, last client sequence per player+binding epoch
timer:     active step/window id, running|paused, durable remaining milliseconds, pause epoch, checkpoint time
```

Persisted in the portable save: facts (with referee payload material encrypted), stream draw counters, a wrapped campaign seed, content hashes, commitment hashes, session id, player-to-seat binding epochs, replay counters, and the active timer checkpoint. The campaign seed is never plaintext in schema v2. The timer checkpoint is written atomically whenever a timer starts, pauses, resumes, or closes and at least once per displayed second while running. Disconnect computes and persists the exact remaining duration before announcing pause. `visibilitychange` and `pagehide` attempt the same transition; after an unclean host death, load always restores the last checkpoint as paused rather than subtracting wall-clock time.

Not persisted: live WebRTC peer ids, connection objects, one-time QR tokens, per-binding phone keys, timer handles, DOM state, or rendered text. Transport keys are random per binding and never derived from the campaign seed. A reloaded phone or host must re-pair; the persisted epoch ensures messages from the retired binding remain invalid.

Campaign creation also generates a random recovery key. It wraps the campaign seed for the portable save and is stored locally only as a non-extractable Web Crypto key in a separate IndexedDB object store. The private setup screen offers a one-time recovery-code/download path; importing the save on another browser requires that recovery material. Losing both browser storage and the recovery material makes the campaign unrecoverable, which the UI must state before play. A determined user controlling the running host can still invoke the local key through instrumented code, matching Spec §16's stated malicious-host limit, but simply opening IndexedDB or an exported save reveals neither seed nor referee plaintext.

After unwrapping the campaign seed, referee material uses Web Crypto AES-GCM with a 256-bit key derived as specified by Spec §16, a fresh 96-bit nonce per encrypted record, and associated data binding schema version, campaign id, fact id, kind, and visibility. Duplicate nonces are a hard error; tampering or the wrong key fails the entire load without plaintext fallback.

M1 save migration is one-way: parse and replay v1 under the existing validator, generate the recovery/salt/key context, wrap the old plaintext campaign seed, encrypt referee material, require confirmation that recovery material was saved, and then persist/export v2 without the plaintext seed. A malformed or future-version save still fails loudly.

### 8.1 Approved social fact-catalog additions

| Kind | Payload | Visibility | Purpose |
|---|---|---|---|
| `objective.assigned` | `{playerId, objectiveId, successCondition}` | explicitly `private:[playerId]`; registry default remains referee as fail-closed | durable private objective state |
| `deferredReveal.minted` | `{playerId, objectiveFactId}` | referee | one spendable token created by a forced envelope burn |
| `deferredReveal.cashed` | `{tokenFactId}` | referee; atomic with the public `reveal` it causes | prevents one token being spent twice |
| `captain.assigned` | `{playerId, reason}` | public | latest fact is the captain projection |
| `crew.removed` | `{actorId, atHex, reason}` | public | records the governance outcome and feeds position/roster projections |

`agenda.actionTaken` needs a catalog-first payload revision to `{playerId, windowId, actionId, targetFactId?, clientCommandId, frameClaim?}`. Every selection/replacement is append-only; the latest valid fact for `(windowId, playerId)` is current, and `clientCommandId` makes retries idempotent. `frameClaim` remains unused/reserved unless the selected target determines it at queue time; it is never backfilled by mutation. At close, effects or `action.fizzled` link back through `causes`, and the resolver skips any intent that already has such a result. `confrontation.resolved` records let-it-lie, so that branch needs no new kind. Every addition/revision follows the catalog-first rule before registry or projection code.

`vote.recorded` also needs a catalog-first payload revision to include the immutable eligible-player list, threshold, per-player ballots, and topic status needed to audit the latest cumulative tally. It remains public and append-only; it does not store a mutable counter.

## 9. Package boundary

```text
packages/engine                 ledger, scoped views, phase commits
        │ buildPlayerDelivery(ledger, playerId, context)
        │ returns typed, authorized DTOs only
        ▼
packages/ui-shared              host bridge + QR; no ad hoc fact serialization
        │ scoped DTOs only
        ▼
packages/transport              protocol types, codecs, sequencing, encryption envelopes
        │                       no engine, React, trystero, or Ledger dependency
        ▼
packages/transport-webrtc       trystero adapter; no game rules or fact projection
        │
        ▼
packages/ui-phone              thin client state + controls
```

The engine owns the single auditable private-delivery boundary. `buildPlayerDelivery(ledger, playerId, context)` begins with `ledger.visibleTo(playerId)` for raw facts and has an explicit typed allowlist for referee-derived presentations that must cross scopes: the player's own agenda packet and a fizzle's `{templateKey, reasonCode}` feedback. Those projectors return presentation DTOs, never raw referee facts, arbitrary payload fields, or rendered prose. Each allowlisted derivation has a privacy test proving that changing `playerId` cannot expose it. Agenda widening after a burn still occurs through public `reveal` facts, not through this presentation path.

`packages/ui-shared` may pass a `Ledger` only to that engine API and may serialize only its returned DTOs. The transport package has no API capable of receiving a `Ledger`, `Fact`, referee view, or content callback. Transport fuzz tests inspect decoded DTOs as well as ciphertext routing to enforce INV-13.

Approved dependencies: the Spec-prescribed [trystero](https://trystero.dev/) in `packages/transport-webrtc`, and browser-capable [qrcode](https://github.com/soldair/node-qrcode) plus its TypeScript definitions in `packages/ui-shared`. Both new workspace packages must be added to the root typecheck gate; neither dependency enters `packages/engine`.

## 10. Accessibility and presentation acceptance

- Shared-screen body text renders at a 20px CSS-equivalent minimum at the supported table distance; critical timer and resolution text is larger.
- Timer changes have optional TTS-safe audio cues at open, ten seconds, five seconds, pause, and close. Visual operation remains complete when audio is muted.
- Connection, readiness, vote, pause, and audit states use text/icon labels as well as color. No secret-dependent status is exposed through color, animation, spacing, focus order, or audio.
- Every phone control is keyboard and switch accessible with a visible focus indicator, programmatic label, and confirmation for a final ballot. Focus moves to the new heading on snapshots and never jumps because another player acts.
- `prefers-reduced-motion` removes nonessential animation. Timers update an accessible label no more than once per second and do not flood a live region.
- QR pairing always offers the camera-independent private copy/paste/full-code path. Re-pair, replace, disconnect, and hotseat flows are operable without camera, drag gestures, or color perception.
- Automated accessibility checks cover both shells; manual acceptance covers screen reader pairing, keyboard-only COMMS/voting, reduced motion, 200% zoom, muted audio, and the shared-screen viewing-distance type requirement.

## 11. Appendix A touchpoints

- Campaign setup adds one public seed commitment before any random draw. Agenda setup then adds one private/referee deal result and one linked public draw commitment per player, including negative results.
- F14's secret cause-resolution draw gains its verifiable preimage record while the public commitment remains visible.
- The comms action that causes F11–F13 is queued as `agenda.actionTaken`, resolved only at window close, and may claim the incident frame without changing its surface.
- F22 includes the public per-player `vote.recorded` tally.
- F23 occurs only after that vote carries; the envelope burn, objective forfeit, and deferred-reveal mint share provenance.

## 12. Do-not summary

- No full ledger, referee fact, foreign-private fact, preimage, or key leaves the host in a client payload.
- No comms action resolves before host close, and tapping speed never affects order.
- No voluntary envelope-open control exists.
- No microphone, transcription, or free-text adjudication exists.
- No renderer output becomes an engine input.
- No documentation or UI claims the host is cryptographically unable to cheat.
