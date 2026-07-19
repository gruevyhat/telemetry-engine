import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { AgendaActionContent } from "../agenda/index.js";
import { privateAgendaFeedback } from "../agenda/index.js";
import { createKindRegistry } from "../ledger/registry.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import { createLedger } from "../ledger/ledger.js";
import { createRng } from "../rng/index.js";
import { loadPhaseScript } from "./load.js";
import { createPhaseInterpreter } from "./interpreter.js";

const T = { day: 7, slot: "COMMS" as const };
const SCRIPT = loadPhaseScript({
  frame: "comms-fixture", start: "comms",
  steps: [{ id: "comms", kind: "commsWindow" as const, next: "after" }, { id: "after", kind: "announce" as const, next: "comms" }],
});
const ACTION: AgendaActionContent = {
  id: "agenda:skim", labelTemplate: "agenda.skim.label", access: { kind: "aboard" },
  target: { kinds: ["cargo.loaded"] },
  proposals: [{ kind: "cargo.diverted", actor: { ref: "self" }, payload: { lotId: { ref: "target", field: "lotId" }, qty: 1, channel: "private" } }],
  implies: [], payout: 1, exposure: { clockId: "heat", delta: 1 },
};

function fixture(seed = "comms-seed") {
  const ledger = createLedger(createKindRegistry(KINDS_V0));
  ledger.append({ t: T, kind: "cargo.loaded", actor: { kind: "world", id: "world" }, payload: { lotId: "L1", tons: 2, manifestId: "M1", bay: "hold" } });
  const make = () => createPhaseInterpreter(ledger, SCRIPT, {
    rng: createRng(seed), deck: [],
    agenda: { actions: [ACTION], currentHex: "Regina" },
  });
  return { ledger, make };
}

function resolvedSignature(facts: readonly { kind: string; actor: { id: string }; payload: Record<string, unknown> }[]) {
  return facts.filter((fact) => fact.kind === "cargo.diverted" || fact.kind === "action.fizzled").map((fact) => ({ kind: fact.kind, actor: fact.actor.id, payload: fact.payload }));
}

describe("durable COMMS close [M2-05, INV-3/5/6]", () => {
  it("enqueue timing/order never affects resolution; only the seeded comms-order permutation does", () => {
    fc.assert(fc.property(fc.string({ minLength: 1 }), (seed) => {
      const a = fixture(seed);
      const ai = a.make();
      const targetA = a.ledger.all().find((fact) => fact.kind === "cargo.loaded")!.id;
      ai.queueCommsAction({ t: T, playerId: "pc:zhan", windowId: "window-1", actionId: ACTION.id, targetFactId: targetA, clientCommandId: "z-1" });
      ai.queueCommsAction({ t: T, playerId: "pc:deuce", windowId: "window-1", actionId: ACTION.id, targetFactId: targetA, clientCommandId: "d-1" });
      ai.advance(T, { kind: "referee", id: "referee" });

      const b = fixture(seed);
      const bi = b.make();
      const targetB = b.ledger.all().find((fact) => fact.kind === "cargo.loaded")!.id;
      bi.queueCommsAction({ t: T, playerId: "pc:deuce", windowId: "window-1", actionId: ACTION.id, targetFactId: targetB, clientCommandId: "d-1" });
      bi.queueCommsAction({ t: T, playerId: "pc:zhan", windowId: "window-1", actionId: ACTION.id, targetFactId: targetB, clientCommandId: "z-1" });
      bi.advance(T, { kind: "referee", id: "referee" });

      expect(resolvedSignature(a.ledger.all())).toHaveLength(2);
      expect(resolvedSignature(b.ledger.all())).toEqual(resolvedSignature(a.ledger.all()));
    }), { numRuns: 30 });
  });

  it("restart before close reconstructs the same order and facts as uninterrupted resolution", () => {
    const uninterrupted = fixture("restart-seed");
    const ui = uninterrupted.make();
    const uTarget = uninterrupted.ledger.all()[0]!.id;
    for (const playerId of ["pc:zhan", "pc:deuce"]) ui.queueCommsAction({ t: T, playerId, windowId: "window-1", actionId: ACTION.id, targetFactId: uTarget, clientCommandId: playerId });
    ui.advance(T, { kind: "referee", id: "referee" });

    const restarted = fixture("restart-seed");
    const beforeKill = restarted.make();
    const rTarget = restarted.ledger.all()[0]!.id;
    for (const playerId of ["pc:zhan", "pc:deuce"]) beforeKill.queueCommsAction({ t: T, playerId, windowId: "window-1", actionId: ACTION.id, targetFactId: rTarget, clientCommandId: playerId });
    restarted.make().advance(T, { kind: "referee", id: "referee" });

    expect(resolvedSignature(uninterrupted.ledger.all())).toHaveLength(2);
    expect(resolvedSignature(restarted.ledger.all())).toEqual(resolvedSignature(uninterrupted.ledger.all()));
  });

  it("resolves one shared resource sequentially, fizzles the later actor, routes feedback privately, and deduplicates retries", () => {
    const { ledger, make } = fixture("collision-seed");
    const interpreter = make();
    const targetFactId = ledger.all()[0]!.id;
    const command = { t: T, playerId: "pc:zhan", windowId: "window-1", actionId: ACTION.id, targetFactId, clientCommandId: "same-command" };
    const first = interpreter.queueCommsAction(command);
    expect(interpreter.queueCommsAction(command).id).toBe(first.id);
    interpreter.queueCommsAction({ ...command, playerId: "pc:deuce", clientCommandId: "deuce-command" });

    const closed = interpreter.advance(T, { kind: "referee", id: "referee" });
    expect(closed.committed.filter((fact) => fact.kind === "phase.transition")).toHaveLength(1);
    expect(ledger.all().filter((fact) => fact.kind === "cargo.diverted")).toHaveLength(1);
    const fizzles = ledger.all().filter((fact) => fact.kind === "action.fizzled");
    expect(fizzles).toHaveLength(1);
    const loser = fizzles[0]!.actor.id;
    expect(privateAgendaFeedback(loser, ledger.all())).toHaveLength(1);
    expect(privateAgendaFeedback(loser === "pc:zhan" ? "pc:deuce" : "pc:zhan", ledger.all())).toEqual([]);
  });
});
