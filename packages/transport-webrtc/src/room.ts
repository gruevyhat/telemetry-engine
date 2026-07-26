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
 */
export function createEnvelopeChannel(room: Room): EnvelopeChannel {
  // EncryptedEnvelope is a plain JSON-shaped object, but trystero's DataPayload requires an
  // explicit string index signature; the cast at this boundary is the only place that fact
  // needs stating. Nothing else about the envelope's shape changes across the boundary.
  const action = room.makeAction(ENVELOPE_ACTION);
  return {
    send(envelope, targetPeerId) {
      void action.send(envelope as unknown as DataPayload, targetPeerId === undefined ? undefined : { target: targetPeerId });
    },
    onReceive(handler) {
      action.onMessage = (data, context) => handler(data as unknown as EncryptedEnvelope, context.peerId);
    },
  };
}
