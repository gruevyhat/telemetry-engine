import type { EncryptedEnvelope } from "@telemetry/transport";
import { joinRoom, type DataPayload, type Room } from "trystero";

const ENVELOPE_ACTION = "te-envelope";

export interface SessionRoomConfig {
  readonly appId: string;
  readonly sessionId: string;
}

/** [M2-15b] The one place `trystero`'s own `joinRoom` is called. `sessionId` is the room id --
 * every player pairing into the same campaign session joins the same trystero room -- and
 * nothing beyond `{appId, sessionId}` is passed, since the encrypted-envelope boundary
 * (`createEnvelopeChannel`) is the only thing that ever needs to know a session exists. */
export function joinSessionRoom(config: SessionRoomConfig): Room {
  return joinRoom({ appId: config.appId }, config.sessionId);
}

export interface EnvelopeChannel {
  send(envelope: EncryptedEnvelope, targetPeerId?: string): void;
  onReceive(handler: (envelope: EncryptedEnvelope, peerId: string) => void): void;
}

/**
 * Thin trystero wiring: the only payload this ever moves is an already-encrypted
 * `EncryptedEnvelope`. There is no API here that accepts a Ledger, Fact, or plaintext
 * payload, so this adapter cannot become a second full-ledger boundary (INV-13).
 *
 * [BL-10] Sends are buffered until a peer that can receive them is connected: trystero's
 * `action.send` delivers to currently-connected peers only and reports nothing when there are
 * none, so an envelope sent during the seconds between `joinRoom` and the WebRTC handshake
 * (the phone's `pair.claim` is always in that window) would otherwise vanish. Held envelopes
 * flush in send order the moment a peer they can reach joins — a broadcast on the first join,
 * a targeted envelope on its target's join — which is what screens-v2's protocol table means
 * by `pair.claim`'s "retry while offer is valid". The channel owns `room.onPeerJoin` for this;
 * anything else wanting join notifications must go through this module, not the raw room.
 */
export function createEnvelopeChannel(room: Room): EnvelopeChannel {
  // EncryptedEnvelope is a plain JSON-shaped object, but trystero's DataPayload requires an
  // explicit string index signature; the cast at this boundary is the only place that fact
  // needs stating. Nothing else about the envelope's shape changes across the boundary.
  const action = room.makeAction(ENVELOPE_ACTION);
  const held: { envelope: EncryptedEnvelope; targetPeerId?: string }[] = [];

  const canReceive = (targetPeerId?: string): boolean => {
    const peerIds = Object.keys(room.getPeers());
    return targetPeerId === undefined ? peerIds.length > 0 : peerIds.includes(targetPeerId);
  };

  const dispatch = (envelope: EncryptedEnvelope, targetPeerId?: string): void => {
    void action.send(envelope as unknown as DataPayload, targetPeerId === undefined ? undefined : { target: targetPeerId });
  };

  room.onPeerJoin = (peerId) => {
    for (let i = 0; i < held.length; ) {
      const entry = held[i];
      if (entry !== undefined && (entry.targetPeerId === undefined || entry.targetPeerId === peerId)) {
        held.splice(i, 1);
        dispatch(entry.envelope, entry.targetPeerId);
      } else {
        i += 1;
      }
    }
  };

  return {
    send(envelope, targetPeerId) {
      if (canReceive(targetPeerId)) {
        dispatch(envelope, targetPeerId);
      } else {
        held.push(targetPeerId === undefined ? { envelope } : { envelope, targetPeerId });
      }
    },
    onReceive(handler) {
      action.onMessage = (data, context) => handler(data as unknown as EncryptedEnvelope, context.peerId);
    },
  };
}
