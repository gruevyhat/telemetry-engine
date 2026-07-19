import { describe, expect, it } from "vitest";
import type { EncryptedEnvelope } from "@telemetry/transport";
import type { Room } from "trystero";
import { createEnvelopeChannel } from "./room.js";

interface FakeAction {
  send: (data: unknown, options?: { target?: string }) => Promise<void>;
  onMessage: ((data: unknown, context: { peerId: string }) => void) | null;
}

/** In-memory seam standing in for two trystero peers; no live signaling. */
function createLinkedRoomPair(): [Room, Room] {
  const actionA: FakeAction = {
    onMessage: null,
    send: async (data) => {
      actionB.onMessage?.(data, { peerId: "peer-a" });
    },
  };
  const actionB: FakeAction = {
    onMessage: null,
    send: async (data) => {
      actionA.onMessage?.(data, { peerId: "peer-b" });
    },
  };
  const roomA = { makeAction: () => actionA } as unknown as Room;
  const roomB = { makeAction: () => actionB } as unknown as Room;
  return [roomA, roomB];
}

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

describe("thin trystero envelope channel [M2-11, INV-13]", () => {
  it("transports encrypted envelopes only, over an injected room seam", () => {
    const [roomA, roomB] = createLinkedRoomPair();
    const channelA = createEnvelopeChannel(roomA);
    const channelB = createEnvelopeChannel(roomB);
    const received: { envelope: EncryptedEnvelope; peerId: string }[] = [];
    channelB.onReceive((received_envelope, peerId) => received.push({ envelope: received_envelope, peerId }));

    channelA.send(envelope, "peer-b");

    expect(received).toEqual([{ envelope, peerId: "peer-a" }]);
  });
});
