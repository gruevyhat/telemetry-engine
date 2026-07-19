import type { EncryptedEnvelope } from "@telemetry/transport";
import type { DataPayload, Room } from "trystero";

const ENVELOPE_ACTION = "te-envelope";

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
