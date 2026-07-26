import { describe, expect, it, vi } from "vitest";
import type { EncryptedEnvelope } from "@telemetry/transport";
import type { EnvelopeChannel } from "@telemetry/transport-webrtc";
import {
  createSeatIsolatedHostChannel,
  seatPairingRoomId,
} from "./seat-isolated-channel.js";

const envelope: EncryptedEnvelope = {
  header: {
    protocolVersion: 1,
    sessionId: "session-a",
    hostEpoch: 1,
    bindingEpoch: 1,
    sequence: 1,
    messageId: "message-1",
    type: "state.snapshot",
  },
  iv: "ab",
  ciphertext: "cd",
};

describe("seat-isolated host signaling [BL-11, INV-13]", () => {
  it("derives one signaling room per seat without changing the protocol session id", () => {
    expect(seatPairingRoomId("session-a", "pc:zhan")).toBe(
      "session-a:pc%3Azhan",
    );
    expect(envelope.header.sessionId).toBe("session-a");
  });

  it("routes each encrypted reply only through the seat channel that received its peer", () => {
    type Handler = (message: EncryptedEnvelope, peerId: string) => void;
    const receivers = new Map<string, Handler>();
    const sends = new Map<
      string,
      { message: EncryptedEnvelope; targetPeerId?: string }[]
    >();
    const createChannel = vi.fn((roomId: string): EnvelopeChannel => {
      sends.set(roomId, []);
      return {
        send(message, targetPeerId) {
          sends
            .get(roomId)
            ?.push(
              targetPeerId === undefined
                ? { message }
                : { message, targetPeerId },
            );
        },
        onReceive(handler) {
          receivers.set(roomId, handler);
        },
      };
    });
    const host = createSeatIsolatedHostChannel({
      sessionId: "session-a",
      playerIds: ["pc:zhan", "pc:deuce"],
      createChannel,
    });
    const received: string[] = [];
    host.onReceive((_message, peerId) => received.push(peerId));

    receivers.get("session-a:pc%3Azhan")?.(envelope, "peer-zhan");
    receivers.get("session-a:pc%3Adeuce")?.(envelope, "peer-deuce");
    host.send(envelope, "peer-deuce");

    expect(received).toEqual(["peer-zhan", "peer-deuce"]);
    expect(sends.get("session-a:pc%3Azhan")).toEqual([]);
    expect(sends.get("session-a:pc%3Adeuce")).toEqual([
      { message: envelope, targetPeerId: "peer-deuce" },
    ]);
  });
});
