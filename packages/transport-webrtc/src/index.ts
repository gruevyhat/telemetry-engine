import {
  PROTOCOL_VERSION,
  createReplayGuard,
  decryptMessage,
  encryptMessage,
  type BoundHeader,
  type EncryptedEnvelope,
  type PlayerDeliveryDTO,
  type ProtocolMessage,
} from "@telemetry/transport";

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

export interface PairingHost {
  claim(peerId: string, claim: ClaimPayload): ClaimResult;
  reconnect(playerId: string, peerId: string): void;
  snapshot(
    playerId: string,
    delivery: PlayerDeliveryDTO,
    sequence: number,
    options?: SnapshotOptions,
  ): Promise<EncryptedEnvelope>;
}

interface Binding {
  readonly offer: PairingOffer;
  peerId?: string;
}

/** Matches the transport package's own default (`message-${sequence}`); stable per (player, sequence) so exact re-sends decrypt to an identical message and the client's replay guard classifies them "duplicate", not "rejected". */
function snapshotMessageId(playerId: string, sequence: number): string {
  return `state.snapshot:${playerId}:${sequence}`;
}

export function createPairingHost(config: PairingHostConfig): PairingHost {
  const bindings = new Map<string, Binding>(config.offers.map((offer) => [offer.playerId, { offer }]));

  function requireBinding(playerId: string): Binding {
    const binding = bindings.get(playerId);
    if (binding === undefined) throw new Error(`no pairing offer for player ${playerId}`);
    return binding;
  }

  return {
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
  };
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
