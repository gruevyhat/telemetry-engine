import { describe, expect, it } from "vitest";
import {
  createKindRegistry,
  createLedger,
  createPhaseInterpreter,
  createRng,
  KINDS_V0,
  loadPhaseScript,
  type AgendaActionContent,
} from "@telemetry/engine";
import { encryptMessage, decryptMessage, PROTOCOL_VERSION, type BoundHeader, type ProtocolMessage } from "@telemetry/transport";
import { createSocialSession } from "./social-session.js";

const T = { day: 7, slot: "COMMS" as const };
const SCRIPT = loadPhaseScript({
  frame: "session-fixture",
  start: "comms",
  steps: [
    { id: "comms", kind: "commsWindow" as const, next: "confrontation" },
    { id: "confrontation", kind: "confrontation" as const, next: "confrontation" },
  ],
});
const ACTION: AgendaActionContent = {
  id: "agenda:skim",
  labelTemplate: "agenda.skim.label",
  access: { kind: "aboard" },
  proposals: [{ kind: "cargo.diverted", actor: { ref: "self" }, payload: { lotId: "L1", qty: 1, channel: "private" } }],
  implies: [],
  payout: 1,
  exposure: { clockId: "heat", delta: 1 },
};
const key = new Uint8Array(32).fill(4);

function header(sequence: number, type: BoundHeader["type"]): BoundHeader {
  return { protocolVersion: PROTOCOL_VERSION, sessionId: "session-a", hostEpoch: 1, bindingEpoch: 1, sequence, messageId: `message-${sequence}`, type };
}

/** Round-trips a message the way a real phone -> host hop does: encrypt as the sender, decrypt
 * as the receiver. Nothing in this test calls the interpreter directly with plaintext. */
async function sendAndReceive(message: ProtocolMessage): Promise<ProtocolMessage> {
  const envelope = await encryptMessage(key, message);
  return decryptMessage(key, envelope);
}

describe("social session orchestrator [M2-15b, INV-6/13]", () => {
  it("drives one comms window and one confrontation through real transport-encoded messages", async () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const interpreter = createPhaseInterpreter(ledger, SCRIPT, {
      rng: createRng("session-seed"),
      deck: [],
      agenda: { actions: [ACTION], currentHex: "Regina", registry: createKindRegistry(KINDS_V0) },
    });
    const session = createSocialSession({ interpreter });

    const queueMessage: ProtocolMessage = {
      header: header(1, "comms.queue"),
      payload: { playerId: "pc:zhan", clientSequence: 1, clientCommandId: "zhan-1", windowId: "window-1", actionId: ACTION.id },
    };
    const receivedQueue = await sendAndReceive(queueMessage);
    expect(receivedQueue.payload).toEqual(queueMessage.payload);
    const ack = session.handleCommsQueue(T, receivedQueue.payload as typeof queueMessage.payload);
    const ackMessage: ProtocolMessage = { header: header(2, "comms.ack"), payload: ack };
    const receivedAck = await sendAndReceive(ackMessage);
    expect(receivedAck.payload).toEqual({ clientCommandId: "zhan-1", committedFactId: ack.committedFactId });
    expect(ledger.all().some((fact) => fact.id === ack.committedFactId && fact.kind === "agenda.actionTaken")).toBe(true);

    session.closeCommsWindow(T, { kind: "referee", id: "referee" });
    expect(ledger.all().some((fact) => fact.kind === "cargo.diverted" && fact.actor.id === "pc:zhan")).toBe(true);

    const objective = ledger.append({
      t: T, kind: "objective.assigned", actor: { kind: "referee", id: "referee" },
      payload: { playerId: "pc:zhan", objectiveId: "routine", successCondition: {} },
      visibility: { level: "private", playerIds: ["pc:zhan"] },
    });

    const topic = "burn:pc:zhan";
    for (const [playerId, value] of [["pc:zhan", false], ["pc:deuce", true], ["pc:brennan", true]] as const) {
      const castMessage: ProtocolMessage = { header: header(3, "vote.cast"), payload: { playerId, clientSequence: 1, topic, value } };
      const receivedCast = await sendAndReceive(castMessage);
      session.castVote(topic, (receivedCast.payload as { playerId: string }).playerId, (receivedCast.payload as { value: boolean }).value);
    }

    const closed = session.closeConfrontation({
      t: T, topic, declarer: "pc:deuce", target: { kind: "pc", id: "pc:zhan" },
      eligiblePlayerIds: ["pc:zhan", "pc:deuce", "pc:brennan"], objectiveFactId: objective.id, contents: "SESSION-CONTENTS",
    });
    const resolvedMessage: ProtocolMessage = { header: header(4, "vote.resolved"), payload: { topic, status: closed.status, outcome: closed.outcome } };
    const receivedResolved = await sendAndReceive(resolvedMessage);
    expect(receivedResolved.payload).toEqual({ topic, status: "carried", outcome: "burned" });
    expect(ledger.all().some((fact) => fact.kind === "envelope.opened" && fact.payload.playerId === "pc:zhan")).toBe(true);
  });
});
