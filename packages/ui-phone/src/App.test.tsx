// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { loadPhaseScript, type AgendaDeck, type IncidentFrame } from "@telemetry/engine";
import { createEnvelopeChannel, encodePairingPayload, groupManualCode, type EnvelopeChannel } from "@telemetry/transport-webrtc";
import type { Room } from "trystero";
import type { EncryptedEnvelope } from "@telemetry/transport";
import { createHostSession } from "@telemetry/ui-shared/src/session/host-session.js";
import tradeDeckJson from "../../../content/decks/trade/frames.json";
import { App } from "./App.js";

afterEach(cleanup);

const T = { day: 7, slot: "COMMS" as const };

/** Same fake-hub shape as host-session.test.ts's, generalized to any number of connected React
 * clients rendered through the real App component instead of a hand-built PairingClient.
 * Delivery is fire-and-forget on both sides (App.tsx's onReceive handler, like host-session.ts's,
 * doesn't expose its processing promise) -- callers use testing-library's `waitFor` to observe
 * eventual delivery instead of a flush mechanism. */
function createFakeChannelHub() {
  type Handler = (envelope: EncryptedEnvelope, peerId: string) => void;
  let hostReceive: Handler | undefined;
  const clientReceivers = new Map<string, Handler>();

  const hostChannel: EnvelopeChannel = {
    send(envelope, targetPeerId) {
      if (targetPeerId === undefined) {
        for (const [peerId, receive] of clientReceivers) receive(envelope, peerId);
      } else {
        clientReceivers.get(targetPeerId)?.(envelope, "host");
      }
    },
    onReceive(handler) {
      hostReceive = handler;
    },
  };

  let nextPeerId = 0;
  function nextClientChannel(): EnvelopeChannel {
    const peerId = `peer-${nextPeerId}`;
    nextPeerId += 1;
    return {
      send(envelope) {
        hostReceive?.(envelope, peerId);
      },
      onReceive(handler) {
        clientReceivers.set(peerId, handler);
      },
    };
  }

  return { hostChannel, nextClientChannel };
}

/** Fake trystero room network for driving the REAL `createEnvelopeChannel` (not the hub fake
 * above): sends deliver only across established connections -- like real trystero, a send with
 * no connected peer silently reaches nobody -- and `connect` fires both sides' `onPeerJoin`.
 * This is the seam the BL-10 race test needs; the hub fake can't express "not yet connected". */
function createFakeRoomNetwork() {
  interface Node {
    room: Room;
    onMessage: () => ((data: unknown, context: { peerId: string }) => void) | null;
    deliver: (data: unknown, fromPeerId: string) => void;
    connected: Set<string>;
  }
  const nodes = new Map<string, Node>();

  function createRoom(peerId: string): Room {
    const connected = new Set<string>();
    let handler: ((data: unknown, context: { peerId: string }) => void) | null = null;
    const action = {
      onMessage: null as ((data: unknown, context: { peerId: string }) => void) | null,
      send: async (data: unknown, options?: { target?: string }) => {
        const targets = options?.target === undefined ? [...connected] : connected.has(options.target) ? [options.target] : [];
        for (const target of targets) nodes.get(target)?.deliver(data, peerId);
      },
    };
    const room = {
      makeAction: () => action,
      getPeers: () => Object.fromEntries([...connected].map((id) => [id, {}])),
      onPeerJoin: null,
    } as unknown as Room;
    void handler;
    nodes.set(peerId, {
      room,
      onMessage: () => action.onMessage,
      deliver: (data, fromPeerId) => action.onMessage?.(data, { peerId: fromPeerId }),
      connected,
    });
    return room;
  }

  function connect(aId: string, bId: string): void {
    const a = nodes.get(aId);
    const b = nodes.get(bId);
    if (!a || !b) throw new Error("connect before createRoom");
    a.connected.add(bId);
    b.connected.add(aId);
    (a.room as { onPeerJoin: ((peerId: string) => void) | null }).onPeerJoin?.(bId);
    (b.room as { onPeerJoin: ((peerId: string) => void) | null }).onPeerJoin?.(aId);
  }

  return { createRoom, connect };
}

const TRADE_DECK = tradeDeckJson as unknown as readonly IncidentFrame[];

const DECK: AgendaDeck = {
  id: "ui-phone-test-deck",
  odds: 1,
  tierWeights: { orthogonal: 1, parasitic: 0, hostile: 0 },
  routineObjective: { id: "routine-watch", successCondition: { kinds: ["clock.tick"], rankBy: "probative", threshold: 0 } },
  templates: { "agenda.skim.label": "Divert one crate off the manifest." },
  agendas: [
    {
      id: "agenda:independent-skim",
      faction: "independent",
      tier: "orthogonal",
      successCondition: { kinds: ["cargo.diverted"], rankBy: "probative", threshold: 1 },
      exposureCost: { clockId: "heat", delta: 1 },
      actions: [
        {
          id: "agenda:skim-crate",
          labelTemplate: "agenda.skim.label",
          access: { kind: "aboard" },
          proposals: [{ kind: "cargo.diverted", actor: { ref: "self" }, payload: { lotId: "L1", qty: 1, channel: "private" } }],
          implies: [],
          payout: 1,
          exposure: { clockId: "heat", delta: 1 },
        },
      ],
    },
  ],
};

const SCRIPT = loadPhaseScript({
  frame: "social-scene",
  start: "comms",
  steps: [
    { id: "comms", kind: "commsWindow" as const, next: "incident" },
    { id: "incident", kind: "generate" as const, gen: { frameId: "trade:bay-lock-cycle" }, next: "confrontation" },
    { id: "confrontation", kind: "confrontation" as const, next: "confrontation" },
  ],
});

describe("ui-phone App [M2-15b]", () => {
  it("pairs by manual code, queues a dealt action, then accuses and votes -- all through real transport-encoded messages", async () => {
    const hub = createFakeChannelHub();
    const players = [
      { playerId: "pc:zhan", label: "Zhan" },
      { playerId: "pc:deuce", label: "Deuce" },
    ];
    const host = createHostSession({
      sessionId: "session-a",
      origin: "https://example.test/telemetry-engine/",
      campaignSeed: "ui-phone-test-seed",
      campaignSalt: "ui-phone-test-salt",
      t: T,
      script: SCRIPT,
      deck: DECK,
      currentHex: "Regina",
      incidentDeck: TRADE_DECK,
      players,
      channel: hub.hostChannel,
    });

    const material = host.pairingMaterialFor("pc:zhan");
    const code = groupManualCode(encodePairingPayload(material));

    render(<App createChannel={() => hub.nextClientChannel()} />);
    fireEvent.change(screen.getByRole("textbox", { name: "pairing code" }), { target: { value: code } });
    fireEvent.click(screen.getByRole("button", { name: "Pair" }));

    await waitFor(() => expect(host.claimedPlayerIds()).toContain("pc:zhan"));

    await host.dealAgendas();

    const zhanGotAgenda = host.ledger.all().some((fact) => fact.kind === "objective.assigned" && fact.payload.playerId === "pc:zhan" && fact.payload.objectiveId === "agenda:independent-skim");
    if (zhanGotAgenda) {
      const button = await screen.findByRole("button", { name: "agenda.skim.label" });
      fireEvent.click(button);
      await waitFor(() => expect(host.ledger.all().some((fact) => fact.kind === "agenda.actionTaken" && fact.payload.playerId === "pc:zhan")).toBe(true));
    } else {
      await screen.findByText("Private traffic. Nothing to queue this window.");
    }

    await host.advanceStep();
    await host.advanceStep();

    await waitFor(() => expect(screen.getByRole("heading", { name: "Accuse" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Accuse Deuce" }));

    await waitFor(() => expect(host.ledger.all().some((fact) => fact.kind === "confrontation.opened" && fact.payload.target === "pc:deuce")).toBe(true));

    await waitFor(() => expect(screen.getByRole("heading", { name: "Vote" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Yes" }));

    await waitFor(() => expect(host.ledger.all().some((fact) => fact.kind === "vote.recorded" && (fact.payload.ballots as Record<string, unknown>)?.["pc:zhan"] === true)).toBe(true));
  });

  it("completes pairing when the WebRTC peer connection arrives after the claim was sent [BL-10]", async () => {
    const net = createFakeRoomNetwork();
    const players = [
      { playerId: "pc:zhan", label: "Zhan" },
      { playerId: "pc:deuce", label: "Deuce" },
    ];
    const host = createHostSession({
      sessionId: "session-race",
      origin: "https://example.test/telemetry-engine/",
      campaignSeed: "ui-phone-race-seed",
      campaignSalt: "ui-phone-race-salt",
      t: T,
      script: SCRIPT,
      deck: DECK,
      currentHex: "Regina",
      incidentDeck: TRADE_DECK,
      players,
      channel: createEnvelopeChannel(net.createRoom("host")),
    });

    const material = host.pairingMaterialFor("pc:zhan");
    const code = groupManualCode(encodePairingPayload(material));

    // Wrap the phone's real channel only to observe when the claim leaves App.tsx -- the claim
    // send goes through async encryptMessage, so without this the test would race its own
    // connect() call instead of pinning BL-10's race.
    let claimLeftApp = false;
    const createPhoneChannel = (): EnvelopeChannel => {
      const real = createEnvelopeChannel(net.createRoom("phone-zhan"));
      return {
        send(sendEnvelope, targetPeerId) {
          claimLeftApp = true;
          real.send(sendEnvelope, targetPeerId);
        },
        onReceive(handler) {
          real.onReceive(handler);
        },
      };
    };

    render(<App createChannel={createPhoneChannel} />);
    fireEvent.change(screen.getByRole("textbox", { name: "pairing code" }), { target: { value: code } });
    fireEvent.click(screen.getByRole("button", { name: "Pair" }));

    // The claim has left the app; no peer connection exists yet. This is BL-10's exact race.
    await waitFor(() => expect(claimLeftApp).toBe(true));
    expect(host.claimedPlayerIds()).toEqual([]);
    expect(screen.getByText("Waiting for the host.")).toBeTruthy();

    net.connect("host", "phone-zhan");

    await waitFor(() => expect(host.claimedPlayerIds()).toContain("pc:zhan"));
    // And the snapshot the host answers with must reach the phone: it leaves the waiting state.
    await waitFor(() => expect(screen.queryByText("Waiting for the host.")).toBeNull());
  });
});
