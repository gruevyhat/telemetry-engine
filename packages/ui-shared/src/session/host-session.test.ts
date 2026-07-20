import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  loadPhaseScript,
  type AgendaDeck,
  type IncidentFrame,
} from "@telemetry/engine";
import { createPairingClient, type EnvelopeChannel, type PairingClient } from "@telemetry/transport-webrtc";
import { encryptMessage, PROTOCOL_VERSION, type EncryptedEnvelope } from "@telemetry/transport";
import { createHostSession } from "./host-session.js";

const T = { day: 7, slot: "COMMS" as const };

/** Models trystero's own targeted/broadcast send semantics (room.ts's `createEnvelopeChannel`)
 * with plain closures -- the same seam room.test.ts uses for a single peer pair, generalized to
 * one host and several named clients. Real message delivery is necessarily fire-and-forget (a
 * WebRTC send has no receipt promise, and host-session.ts's own onReceive handler is an
 * unawaited async closure to match), so this hub also tracks in-flight handler promises and
 * exposes `flush()` purely as a test affordance for waiting until the host has finished reacting
 * to a send before asserting on its effects. */
function createFakeChannelHub() {
  type Handler = (envelope: EncryptedEnvelope, peerId: string) => void;
  let hostReceive: Handler | undefined;
  const clientReceivers = new Map<string, Handler>();
  const pending: Promise<unknown>[] = [];

  function invoke(handler: Handler | undefined, envelope: EncryptedEnvelope, peerId: string): void {
    const result = handler?.(envelope, peerId) as unknown;
    if (result && typeof (result as Promise<unknown>).then === "function") pending.push(result as Promise<unknown>);
  }

  const hostChannel: EnvelopeChannel = {
    send(envelope, targetPeerId) {
      if (targetPeerId === undefined) {
        for (const [peerId, receive] of clientReceivers) invoke(receive, envelope, peerId);
      } else {
        invoke(clientReceivers.get(targetPeerId), envelope, "host");
      }
    },
    onReceive(handler) {
      hostReceive = handler;
    },
  };

  function clientChannel(peerId: string): EnvelopeChannel {
    return {
      send(envelope) {
        invoke(hostReceive, envelope, peerId);
      },
      onReceive(handler) {
        clientReceivers.set(peerId, handler);
      },
    };
  }

  async function flush(): Promise<void> {
    while (pending.length > 0) {
      await Promise.all(pending.splice(0, pending.length));
    }
  }

  return { hostChannel, clientChannel, flush };
}

const TRADE_DECK = JSON.parse(readFileSync(new URL("../../../../content/decks/trade/frames.json", import.meta.url), "utf8")) as readonly IncidentFrame[];

const DECK: AgendaDeck = {
  id: "host-session-test-deck",
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

async function send(
  hub: { flush(): Promise<void> },
  channel: EnvelopeChannel,
  key: Uint8Array,
  header: Parameters<typeof encryptMessage>[1]["header"],
  payload: unknown,
): Promise<void> {
  const envelope = await encryptMessage(key, { header, payload } as Parameters<typeof encryptMessage>[1]);
  channel.send(envelope);
  await hub.flush();
}

describe("host session [M2-15b]", () => {
  it("pairs three phones, deals agendas, resolves a comms window, surfaces an incident, carries an accusation vote, and verifies the black box", async () => {
    const hub = createFakeChannelHub();
    const players = [
      { playerId: "pc:zhan", label: "Zhan" },
      { playerId: "pc:deuce", label: "Deuce" },
      { playerId: "pc:brennan", label: "Brennan" },
    ];

    const host = createHostSession({
      sessionId: "session-a",
      origin: "https://example.test/telemetry-engine/",
      campaignSeed: "host-session-test-seed",
      campaignSalt: "host-session-test-salt",
      t: T,
      script: SCRIPT,
      deck: DECK,
      currentHex: "Regina",
      incidentDeck: TRADE_DECK,
      players,
      channel: hub.hostChannel,
    });

    // Each phone learns its own pairing material from the shared screen's QR/manual code, builds
    // a real transport client from it, and sends a real encrypted pair.claim -- the host never
    // sees a peer id it can attribute to a player until this round-trips.
    const clients = new Map<string, PairingClient>();
    for (const player of players) {
      const material = host.pairingMaterialFor(player.playerId);
      const client = createPairingClient({ playerId: player.playerId, bindingEpoch: material.bindingEpoch, claimToken: material.claimToken, key: material.transportKey });
      clients.set(player.playerId, client);
      const channel = hub.clientChannel(`peer-${player.playerId}`);
      channel.onReceive((envelope) => {
        void client.receive(envelope);
      });
      await send(
        hub,
        channel,
        material.transportKey,
        { protocolVersion: PROTOCOL_VERSION, sessionId: "session-a", hostEpoch: 1, bindingEpoch: material.bindingEpoch, sequence: 1, messageId: `claim-${player.playerId}`, type: "pair.claim" },
        { playerId: player.playerId, claimToken: material.claimToken },
      );
    }

    expect([...host.claimedPlayerIds()].sort()).toEqual(["pc:brennan", "pc:deuce", "pc:zhan"]);

    await host.dealAgendas();
    const dealtCount = host.ledger.all().filter((fact) => fact.kind === "objective.assigned" && fact.payload.objectiveId === "agenda:independent-skim").length;
    expect(dealtCount).toBeGreaterThan(0);

    // Whichever player was actually dealt the real agenda queues it through a real transport
    // round trip (a genuine comms.queue, not a direct interpreter call).
    const dealt = host.ledger.all().find((fact) => fact.kind === "objective.assigned" && fact.payload.objectiveId === "agenda:independent-skim");
    if (dealt) {
      const playerId = dealt.payload.playerId as string;
      const material = host.pairingMaterialFor(playerId);
      await send(
        hub,
        hub.clientChannel(`peer-${playerId}`),
        material.transportKey,
        { protocolVersion: PROTOCOL_VERSION, sessionId: "session-a", hostEpoch: 1, bindingEpoch: material.bindingEpoch, sequence: 2, messageId: `${playerId}-queue-1`, type: "comms.queue" },
        { playerId, clientSequence: 1, clientCommandId: `${playerId}-comms-1`, windowId: "window-1", actionId: "agenda:skim-crate" },
      );
    }

    await host.advanceStep(); // closes the comms window (seeded close-order)
    await host.advanceStep(); // fires the incident generate step
    expect(host.ledger.all().some((fact) => fact.kind === "lock.cycled")).toBe(true);

    // deuce accuses zhan; opening the confrontation and its voting context happens together, off
    // one real transport-encoded confrontation.command.
    const deuceMaterial = host.pairingMaterialFor("pc:deuce");
    await send(
      hub,
      hub.clientChannel("peer-pc:deuce"),
      deuceMaterial.transportKey,
      { protocolVersion: PROTOCOL_VERSION, sessionId: "session-a", hostEpoch: 1, bindingEpoch: deuceMaterial.bindingEpoch, sequence: 3, messageId: "deuce-accuse-1", type: "confrontation.command" },
      { playerId: "pc:deuce", clientSequence: 1, clientCommandId: "deuce-accuse-1", command: "accuse", targetId: "pc:zhan" },
    );
    expect(host.ledger.all().some((fact) => fact.kind === "confrontation.opened")).toBe(true);

    for (const [playerId, value] of [["pc:zhan", false], ["pc:deuce", true], ["pc:brennan", true]] as const) {
      const material = host.pairingMaterialFor(playerId);
      await send(
        hub,
        hub.clientChannel(`peer-${playerId}`),
        material.transportKey,
        { protocolVersion: PROTOCOL_VERSION, sessionId: "session-a", hostEpoch: 1, bindingEpoch: material.bindingEpoch, sequence: 4, messageId: `${playerId}-vote-1`, type: "vote.cast" },
        { playerId, clientSequence: 1, topic: "burn:pc:zhan", value },
      );
    }

    expect(host.ledger.all().some((fact) => fact.kind === "envelope.opened" && fact.payload.playerId === "pc:zhan")).toBe(true);

    const { artifact, verification } = await host.assembleBlackBox();
    expect(verification.seed).toEqual({ ok: true });
    expect(verification.failedCount).toBe(0);
    expect(artifact.draws.length).toBeGreaterThan(0);
  });
});
