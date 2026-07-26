import type { EncryptedEnvelope } from "@telemetry/transport";
import type { EnvelopeChannel } from "@telemetry/transport-webrtc";

export interface SeatIsolatedHostChannelConfig {
  readonly sessionId: string;
  readonly playerIds: readonly string[];
  readonly createChannel: (roomId: string) => EnvelopeChannel;
}

export function seatPairingRoomId(
  sessionId: string,
  playerId: string,
): string {
  return `${sessionId}:${encodeURIComponent(playerId)}`;
}

/**
 * BL-11: Trystero rooms form a full mesh, but pairing needs only a phone-to-host
 * star. Join one two-peer signaling room per seat, remember which room introduced
 * each opaque peer id, and preserve HostSession's single EnvelopeChannel boundary.
 * The encrypted envelope still carries the original protocol session id.
 */
export function createSeatIsolatedHostChannel(
  config: SeatIsolatedHostChannelConfig,
): EnvelopeChannel {
  type PendingDelivery = {
    readonly envelope: EncryptedEnvelope;
    readonly peerId: string;
  };

  const channels = config.playerIds.map((playerId) =>
    config.createChannel(seatPairingRoomId(config.sessionId, playerId)),
  );
  const channelByPeerId = new Map<string, EnvelopeChannel>();
  const pending: PendingDelivery[] = [];
  let receive:
    | ((envelope: EncryptedEnvelope, peerId: string) => void)
    | undefined;

  for (const channel of channels) {
    channel.onReceive((envelope, peerId) => {
      channelByPeerId.set(peerId, channel);
      if (receive) {
        receive(envelope, peerId);
      } else {
        pending.push({ envelope, peerId });
      }
    });
  }

  return {
    send(envelope, targetPeerId) {
      if (targetPeerId === undefined) {
        for (const channel of channels) channel.send(envelope);
        return;
      }
      const channel = channelByPeerId.get(targetPeerId);
      if (!channel) {
        throw new Error(`no seat signaling route for peer ${targetPeerId}`);
      }
      channel.send(envelope, targetPeerId);
    },
    onReceive(handler) {
      receive = handler;
      for (const delivery of pending.splice(0)) {
        handler(delivery.envelope, delivery.peerId);
      }
    },
  };
}
