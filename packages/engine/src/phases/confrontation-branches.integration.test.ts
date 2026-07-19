import { describe, expect, it } from "vitest";
import { derive } from "../ledger/derive.js";
import { createKindRegistry } from "../ledger/registry.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import { createLedger } from "../ledger/ledger.js";
import { captainProjection } from "../position/index.js";
import { loadPhaseScript } from "./load.js";
import { createPhaseInterpreter } from "./interpreter.js";

const T = { day: 15, slot: "ARRIVAL" as const };
const SCRIPT = loadPhaseScript({ frame: "confrontation", start: "declare", steps: [{ id: "declare", kind: "confrontation", next: "declare" }] });

function fixture() {
  const ledger = createLedger(createKindRegistry(KINDS_V0));
  return { ledger, interpreter: createPhaseInterpreter(ledger, SCRIPT) };
}

describe("confrontation resolution branches [M2-07b, INV-6/11]", () => {
  it("search reuses evidence access/ranking and atomically commits the day cost with findings", () => {
    const { ledger, interpreter } = fixture();
    const secret = ledger.append({ t: T, kind: "lock.cycled", actor: { kind: "npc", id: "npc:kessler" }, payload: { door: "aft", codeClass: "CREW", time: "0340" } });
    const result = interpreter.resolveConfrontationSearch({
      t: T, actorId: "pc:zhan", check: { skill: "Investigate", dm: 1, total: 10, difficulty: 8 },
      query: { target: { kinds: ["lock.cycled"] }, access: { kind: "aboard" }, probativeWeights: { "lock.cycled": 10 }, identityFields: new Set(["actor"]) },
      accessContext: { presence: { declarations: {} }, actorId: "pc:zhan", day: 15, slot: "ARRIVAL", heldGear: new Set(), codeHolders: new Set(), holdsPrisoner: false },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.committed.map((fact) => fact.kind)).toEqual(["check.reported", "reveal", "clock.tick", "confrontation.resolved"]);
    expect(result.committed[1]!.payload.targets).toEqual([secret.id]);
  });

  it("let-it-lie records the unresolved loss without revealing a hidden cause", () => {
    const { ledger, interpreter } = fixture();
    const secret = ledger.append({ t: T, kind: "cargo.diverted", actor: { kind: "npc", id: "npc:kessler" }, payload: { lotId: "L1", qty: 2, channel: "fence" } });
    const result = interpreter.resolveConfrontationBranch({ kind: "let-lie", t: T, actorId: "pc:zhan", reason: "crew-declined" });
    expect(result.committed.map((fact) => fact.kind)).toEqual(["confrontation.resolved"]);
    expect(ledger.visibleTo({ scope: "table" }).some((fact) => fact.id === secret.id)).toBe(false);
  });

  it("replaces a captain by strict majority and projects the latest committed assignment", () => {
    const { ledger, interpreter } = fixture();
    const result = interpreter.resolveConfrontationBranch({ kind: "replace-captain", t: T, actorId: "pc:zhan", candidateId: "pc:brennan", eligiblePlayerIds: ["pc:zhan", "pc:deuce", "pc:brennan"], ballots: { "pc:zhan": true, "pc:deuce": false, "pc:brennan": true } });
    expect(result.committed.map((fact) => fact.kind)).toEqual(["vote.recorded", "captain.assigned", "confrontation.resolved"]);
    expect(derive(ledger.all(), captainProjection)).toBe("pc:brennan");
    const failed = fixture();
    const retained = failed.interpreter.resolveConfrontationBranch({ kind: "replace-captain", t: T, actorId: "pc:zhan", candidateId: "pc:brennan", eligiblePlayerIds: ["pc:zhan", "pc:deuce", "pc:brennan"], ballots: { "pc:zhan": true, "pc:deuce": false, "pc:brennan": false } });
    expect(retained.committed.map((fact) => fact.kind)).toEqual(["vote.recorded", "confrontation.resolved"]);
    expect(derive(failed.ledger.all(), captainProjection)).toBeUndefined();
  });

  it("puts a target off ship only with every other eligible PC, while timeout is owned by the captain", () => {
    const { interpreter } = fixture();
    const removed = interpreter.resolveConfrontationBranch({ kind: "put-off-ship", t: T, actorId: "pc:zhan", targetId: "pc:deuce", atHex: "Vantage", eligiblePlayerIds: ["pc:zhan", "pc:deuce", "pc:brennan"], ballots: { "pc:zhan": true, "pc:brennan": true } });
    expect(removed.committed.map((fact) => fact.kind)).toEqual(["vote.recorded", "crew.removed", "presence.declared", "confrontation.resolved"]);
    const failed = fixture().interpreter.resolveConfrontationBranch({ kind: "put-off-ship", t: T, actorId: "pc:zhan", targetId: "pc:deuce", atHex: "Vantage", eligiblePlayerIds: ["pc:zhan", "pc:deuce", "pc:brennan"], ballots: { "pc:zhan": true, "pc:brennan": false } });
    expect(failed.committed.map((fact) => fact.kind)).toEqual(["vote.recorded", "confrontation.resolved"]);
    const timeout = interpreter.resolveConfrontationBranch({ kind: "timer-expiry", t: T, captainId: "pc:brennan", decision: "let-lie" });
    expect(timeout.committed[0]).toMatchObject({ kind: "confrontation.resolved", actor: { kind: "pc", id: "pc:brennan" }, payload: { outcome: "let-lie", logNote: "timer-expired-captain-owned" } });
  });
});
