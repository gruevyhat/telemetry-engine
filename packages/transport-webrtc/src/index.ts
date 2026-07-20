import {
  PROTOCOL_VERSION,
  createReplayGuard,
  decryptMessage,
  encryptMessage,
  type BoundHeader,
  type EncryptedEnvelope,
  type PlayerDeliveryDTO,
  type ProtocolMessage,
  type ReplayGuard,
} from "@telemetry/transport";

export { createEnvelopeChannel, joinSessionRoom, type EnvelopeChannel, type SessionRoomConfig } from "./room.js";
export {
  decodeManualPairingCode,
  decodePairingFragment,
  encodePairingPayload,
  groupManualCode,
  type DecodedPairingMaterial,
  type PairingMaterial,
  type PairingRosterEntry,
} from "./pairing-material.js";

export interface PairingOffer {
  readonly playerId: string;
  readonly bindingEpoch: number;
  readonly claimToken: string;
  readonly key: Uint8Array;
}

export interface PairingHostConfig {
  readonly sessionId: string;
  readonly hostEpoch: number;
  readonly offers: readonly PairingOffer[];
}

export interface ClaimPayload {
  readonly playerId: string;
  readonly bindingEpoch: number;
  readonly claimToken: string;
}

export type ClaimResult =
  | { readonly status: "accepted"; readonly playerId: string }
  | {
      readonly status: "rejected";
      readonly playerId: string;
      readonly reasonCode: "unknown-player" | "token-mismatch" | "claimed-by-other";
    };

export interface SnapshotOptions {
  readonly remainingSeconds?: number;
  readonly paused?: boolean;
}

export type ReceiveResult =
  | { readonly status: "accepted"; readonly playerId: string; readonly message: ProtocolMessage }
  | { readonly status: "rejected"; readonly reasonCode: "unknown-peer" | "decrypt-failed" | "replay" };

export interface PairingHost {
  claim(peerId: string, claim: ClaimPayload): ClaimResult;
  reconnect(playerId: string, peerId: string): void;
  snapshot(
    playerId: string,
    delivery: PlayerDeliveryDTO,
    sequence: number,
    options?: SnapshotOptions,
  ): Promise<EncryptedEnvelope>;
  /** Decrypts an inbound envelope with the key bound to `peerId` and applies that binding's own
   * replay guard (M2-15b). The host never guesses a decrypting key from the payload's claimed
   * `playerId` -- routing comes only from the trystero-level peerId a binding accepted at claim
   * time (INV-13: a client cannot make its message decrypt, or be attributed, under another
   * seat's key just by writing a different playerId in the plaintext). */
  receive(peerId: string, envelope: EncryptedEnvelope): Promise<ReceiveResult>;
  /** Resolves an inbound `pair.claim` envelope to the right offer by trying each offer's own key
   * in turn -- the host cannot look a key up by peerId until a claim has already succeeded, so
   * this is the one place that ordering is inverted (INV-13: only a genuinely correct per-offer
   * key ever decrypts, so this never widens which envelope binds to which player). A resend of
   * the same claim token from a new peer id (a real WebRTC reconnect commonly changes trystero's
   * peer id) is treated as reconnect, not rejected as claimed-by-other. Returns `undefined` when
   * no offer's key decrypts the envelope at all -- unattributable noise, not a rejection of any
   * particular claim. */
  receiveClaim(peerId: string, envelope: EncryptedEnvelope): Promise<ClaimResult | undefined>;
}

interface Binding {
  readonly offer: PairingOffer;
  readonly inboundGuard: ReplayGuard;
  peerId?: string;
}

/** Matches the transport package's own default (`message-${sequence}`); stable per (player, sequence) so exact re-sends decrypt to an identical message and the client's replay guard classifies them "duplicate", not "rejected". */
function snapshotMessageId(playerId: string, sequence: number): string {
  return `state.snapshot:${playerId}:${sequence}`;
}

export function createPairingHost(config: PairingHostConfig): PairingHost {
  const bindings = new Map<string, Binding>(config.offers.map((offer) => [offer.playerId, { offer, inboundGuard: createReplayGuard() }]));

  function requireBinding(playerId: string): Binding {
    const binding = bindings.get(playerId);
    if (binding === undefined) throw new Error(`no pairing offer for player ${playerId}`);
    return binding;
  }

  function bindingByPeerId(peerId: string): { playerId: string; binding: Binding } | undefined {
    for (const [playerId, binding] of bindings) {
      if (binding.peerId === peerId) return { playerId, binding };
    }
    return undefined;
  }

  const host: PairingHost = {
    claim(peerId, claim) {
      const binding = bindings.get(claim.playerId);
      if (binding === undefined) {
        return { status: "rejected", playerId: claim.playerId, reasonCode: "unknown-player" };
      }
      if (binding.offer.bindingEpoch !== claim.bindingEpoch || binding.offer.claimToken !== claim.claimToken) {
        return { status: "rejected", playerId: claim.playerId, reasonCode: "token-mismatch" };
      }
      if (binding.peerId !== undefined && binding.peerId !== peerId) {
        return { status: "rejected", playerId: claim.playerId, reasonCode: "claimed-by-other" };
      }
      binding.peerId = peerId;
      return { status: "accepted", playerId: claim.playerId };
    },
    reconnect(playerId, peerId) {
      const binding = requireBinding(playerId);
      if (binding.peerId === undefined) throw new Error(`cannot reconnect unclaimed seat ${playerId}`);
      binding.peerId = peerId;
    },
    async snapshot(playerId, delivery, sequence, options) {
      const binding = requireBinding(playerId);
      const header: BoundHeader<"state.snapshot"> = {
        protocolVersion: PROTOCOL_VERSION,
        sessionId: config.sessionId,
        hostEpoch: config.hostEpoch,
        bindingEpoch: binding.offer.bindingEpoch,
        sequence,
        messageId: snapshotMessageId(playerId, sequence),
        type: "state.snapshot",
      };
      const message: ProtocolMessage = {
        header,
        payload: {
          delivery,
          remainingSeconds: options?.remainingSeconds ?? 0,
          paused: options?.paused ?? false,
        },
      };
      return encryptMessage(binding.offer.key, message);
    },
    async receive(peerId, envelope) {
      const found = bindingByPeerId(peerId);
      if (found === undefined) return { status: "rejected", reasonCode: "unknown-peer" };
      let message: ProtocolMessage;
      try {
        message = await decryptMessage(found.binding.offer.key, envelope);
      } catch {
        return { status: "rejected", reasonCode: "decrypt-failed" };
      }
      if (found.binding.inboundGuard.accept(envelope.header) === "rejected") {
        return { status: "rejected", reasonCode: "replay" };
      }
      return { status: "accepted", playerId: found.playerId, message };
    },
    async receiveClaim(peerId, envelope) {
      for (const [playerId, binding] of bindings) {
        let message: ProtocolMessage;
        try {
          message = await decryptMessage(binding.offer.key, envelope);
        } catch {
          continue;
        }
        if (message.header.type !== "pair.claim") continue;
        const payload = message.payload as { playerId: string; claimToken: string };
        if (payload.playerId !== playerId || payload.claimToken !== binding.offer.claimToken) continue;
        if (binding.peerId !== undefined && binding.peerId !== peerId) {
          host.reconnect(playerId, peerId);
          return { status: "accepted", playerId };
        }
        return host.claim(peerId, { playerId, bindingEpoch: binding.offer.bindingEpoch, claimToken: payload.claimToken });
      }
      return undefined;
    },
  };
  return host;
}

export interface PairingClientConfig {
  readonly playerId: string;
  readonly bindingEpoch: number;
  readonly claimToken: string;
  readonly key: Uint8Array;
}

export interface PairingClient {
  readonly claim: ClaimPayload;
  receive(envelope: EncryptedEnvelope): Promise<ProtocolMessage>;
}

export function createPairingClient(config: PairingClientConfig): PairingClient {
  const guard = createReplayGuard();
  return {
    claim: { playerId: config.playerId, bindingEpoch: config.bindingEpoch, claimToken: config.claimToken },
    async receive(envelope) {
      const message = await decryptMessage(config.key, envelope);
      if (guard.accept(envelope.header) === "rejected") {
        throw new Error("rejected out-of-order or reused transport message");
      }
      return message;
    },
  };
}
