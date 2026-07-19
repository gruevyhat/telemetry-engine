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
import { createCommsWindowTimer } from "./comms-timer.js";

const T = { day: 7, slot: "COMMS" as const };
const SCRIPT = loadPhaseScript({
  frame: "disconnect-fixture",
  start: "comms",
  steps: [
    { id: "comms", kind: "commsWindow" as const, next: "after" },
    { id: "after", kind: "announce" as const, next: "comms" },
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

function fixture(seed: string) {
  const ledger = createLedger(createKindRegistry(KINDS_V0));
  const interpreter = createPhaseInterpreter(ledger, SCRIPT, {
    rng: createRng(seed),
    deck: [],
    agenda: { actions: [ACTION], currentHex: "Regina", registry: createKindRegistry(KINDS_V0) },
  });
  return { ledger, interpreter };
}

function resolvedSignature(facts: readonly { kind: string; actor: { id: string } }[]) {
  return facts.filter((fact) => fact.kind === "cargo.diverted" || fact.kind === "action.fizzled").map((fact) => ({ kind: fact.kind, actor: fact.actor.id }));
}

describe("disconnect pause and hotseat continuity [M2-13, INV-13/14]", () => {
  it("a forced disconnect mid-window pauses the host timer and resolves nothing early", () => {
    const { ledger, interpreter } = fixture("disconnect-seed");
    interpreter.queueCommsAction({ t: T, playerId: "pc:zhan", windowId: "window-1", actionId: ACTION.id, clientCommandId: "zhan-1" });

    const timer = createCommsWindowTimer(30);
    timer.tick(13);

    // pc:deuce drops mid-window before queuing; the host pauses rather than closing.
    timer.pause();
    expect(timer.remainingSeconds()).toBe(17);
    expect(ledger.all().filter((fact) => fact.kind === "cargo.diverted" || fact.kind === "action.fizzled")).toHaveLength(0);

    // real time passes while disconnected; the paused window admits no ticks and the host
    // never calls advance(), so the batch stays unresolved.
    timer.tick(9999);
    expect(timer.remainingSeconds()).toBe(17);
    expect(ledger.all().filter((fact) => fact.kind === "phase.transition")).toHaveLength(0);
  });

  it("reconnect resumes the same remaining window and yields the same facts as uninterrupted play", () => {
    const uninterrupted = fixture("reconnect-seed");
    uninterrupted.interpreter.queueCommsAction({ t: T, playerId: "pc:zhan", windowId: "window-1", actionId: ACTION.id, clientCommandId: "zhan-1" });
    uninterrupted.interpreter.queueCommsAction({ t: T, playerId: "pc:deuce", windowId: "window-1", actionId: ACTION.id, clientCommandId: "deuce-1" });
    const uTimer = createCommsWindowTimer(30);
    uTimer.tick(30);
    uTimer.close();
    uninterrupted.interpreter.advance(T, { kind: "referee", id: "referee" });

    const interrupted = fixture("reconnect-seed");
    interrupted.interpreter.queueCommsAction({ t: T, playerId: "pc:zhan", windowId: "window-1", actionId: ACTION.id, clientCommandId: "zhan-1" });
    const iTimer = createCommsWindowTimer(30);
    iTimer.tick(13);
    iTimer.pause(); // pc:deuce disconnects with 17s remaining
    iTimer.tick(500); // time passes while disconnected; ignored
    iTimer.resume(); // pc:deuce reconnects; same remaining duration
    expect(iTimer.remainingSeconds()).toBe(17);
    interrupted.interpreter.queueCommsAction({ t: T, playerId: "pc:deuce", windowId: "window-1", actionId: ACTION.id, clientCommandId: "deuce-1" });
    iTimer.tick(17);
    iTimer.close();
    interrupted.interpreter.advance(T, { kind: "referee", id: "referee" });

    expect(resolvedSignature(interrupted.ledger.all())).toHaveLength(2);
    expect(resolvedSignature(interrupted.ledger.all())).toEqual(resolvedSignature(uninterrupted.ledger.all()));
  });
});
