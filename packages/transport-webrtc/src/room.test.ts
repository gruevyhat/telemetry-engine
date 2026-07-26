import { describe, expect, it, vi } from "vitest";
import type { EncryptedEnvelope } from "@telemetry/transport";
import type { Room } from "trystero";
import { createEnvelopeChannel, joinSessionRoom } from "./room.js";

const joinRoomMock = vi.fn();
vi.mock("trystero", () => ({ joinRoom: (...args: unknown[]) => joinRoomMock(...args) }));

interface FakeAction {
  send: (data: unknown, options?: { target?: string }) => Promise<void>;
  onMessage: ((data: unknown, context: { peerId: string }) => void) | null;
}

/** In-memory seam standing in for two trystero peers; no live signaling. Already connected --
 * `getPeers` reports the other side from the start, matching the pre-BL-10 fakes' implicit
 * assumption. For the connects-later case use `createLateLinkedRoomPair` below. */
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
  const roomA = { makeAction: () => actionA, getPeers: () => ({ "peer-b": {} }), onPeerJoin: null } as unknown as Room;
  const roomB = { makeAction: () => actionB, getPeers: () => ({ "peer-a": {} }), onPeerJoin: null } as unknown as Room;
  return [roomA, roomB];
}

/** Linked pair whose peer connection completes only when `connect()` is called, mimicking real
 * trystero: `action.send` before any peer is connected delivers to nobody and reports nothing
 * (BL-10's root cause), and `onPeerJoin` fires on both sides at connection time. */
function createLateLinkedRoomPair(): { roomA: Room; roomB: Room; connect: () => void } {
  let connected = false;
  const actionA: FakeAction = {
    onMessage: null,
    send: async (data) => {
      if (connected) actionB.onMessage?.(data, { peerId: "peer-a" });
    },
  };
  const actionB: FakeAction = {
    onMessage: null,
    send: async (data) => {
      if (connected) actionA.onMessage?.(data, { peerId: "peer-b" });
    },
  };
  const roomA = { makeAction: () => actionA, getPeers: () => (connected ? { "peer-b": {} } : {}), onPeerJoin: null } as unknown as Room;
  const roomB = { makeAction: () => actionB, getPeers: () => (connected ? { "peer-a": {} } : {}), onPeerJoin: null } as unknown as Room;
  return {
    roomA,
    roomB,
    connect: () => {
      connected = true;
      (roomA as { onPeerJoin: ((peerId: string) => void) | null }).onPeerJoin?.("peer-b");
      (roomB as { onPeerJoin: ((peerId: string) => void) | null }).onPeerJoin?.("peer-a");
    },
  };
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

describe("envelope channel buffers sends until a peer can receive them [BL-10]", () => {
  function createSpyRoom(initialPeers: string[] = []) {
    const peers = new Set(initialPeers);
    const sends: { data: unknown; options?: { target?: string } }[] = [];
    const action: FakeAction = {
      onMessage: null,
      send: async (data, options) => {
        sends.push(options === undefined ? { data } : { data, options });
      },
    };
    const room = {
      makeAction: () => action,
      getPeers: () => Object.fromEntries([...peers].map((id) => [id, {}])),
      onPeerJoin: null,
    } as unknown as Room;
    const join = (peerId: string) => {
      peers.add(peerId);
      (room as { onPeerJoin: ((peerId: string) => void) | null }).onPeerJoin?.(peerId);
    };
    return { room, sends, join };
  }

  const second: EncryptedEnvelope = { ...envelope, header: { ...envelope.header, sequence: 2, messageId: "message-2" } };

  it("holds a broadcast sent with no peer connected, then flushes in order on the first join", () => {
    const { room, sends, join } = createSpyRoom();
    const channel = createEnvelopeChannel(room);

    channel.send(envelope);
    channel.send(second);
    expect(sends).toEqual([]);

    join("peer-h");
    expect(sends.map((s) => (s.data as EncryptedEnvelope).header.messageId)).toEqual(["message-1", "message-2"]);
  });

  it("holds a targeted send until that specific peer joins, not just any peer", () => {
    const { room, sends, join } = createSpyRoom();
    const channel = createEnvelopeChannel(room);

    channel.send(envelope, "peer-b");
    join("peer-a");
    expect(sends).toEqual([]);

    join("peer-b");
    expect(sends).toEqual([{ data: envelope, options: { target: "peer-b" } }]);
  });

  it("sends immediately when a peer is already connected", () => {
    const { room, sends } = createSpyRoom(["peer-h"]);
    const channel = createEnvelopeChannel(room);

    channel.send(envelope);
    expect(sends).toEqual([{ data: envelope }]);
  });

  it("delivers a claim sent before the peer connection exists -- the real pairing race", () => {
    const { roomA, roomB, connect } = createLateLinkedRoomPair();
    const phone = createEnvelopeChannel(roomA);
    const host = createEnvelopeChannel(roomB);
    const received: { envelope: EncryptedEnvelope; peerId: string }[] = [];
    host.onReceive((received_envelope, peerId) => received.push({ envelope: received_envelope, peerId }));

    phone.send(envelope);
    expect(received).toEqual([]);

    connect();
    expect(received).toEqual([{ envelope, peerId: "peer-a" }]);
  });
});

describe("session room join [M2-15b]", () => {
  it("joins trystero under the app's own appId and the session id as the room id, nothing else", () => {
    const fakeRoom = { makeAction: () => ({ send: async () => {}, onMessage: null }) } as unknown as Room;
    joinRoomMock.mockReturnValue(fakeRoom);

    const room = joinSessionRoom({ appId: "telemetry-engine", sessionId: "session-a" });

    expect(room).toBe(fakeRoom);
    expect(joinRoomMock).toHaveBeenCalledWith({ appId: "telemetry-engine" }, "session-a");
  });
});
