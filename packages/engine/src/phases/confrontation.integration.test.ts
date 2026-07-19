import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createKindRegistry } from "../ledger/registry.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import { createLedger } from "../ledger/ledger.js";
import { loadPhaseScript } from "./load.js";
import { createPhaseInterpreter } from "./interpreter.js";

const T = { day: 15, slot: "ARRIVAL" as const };
const SCRIPT = loadPhaseScript({ frame: "confrontation", start: "declare", steps: [
  { id: "declare", kind: "confrontation", timer: 300, next: "declare" },
] });

function fixture() {
  const ledger = createLedger(createKindRegistry(KINDS_V0));
  const agenda = ledger.append({ t: T, kind: "agenda.dealt", actor: { kind: "referee", id: "referee" }, payload: { playerId: "pc:deuce", result: false } });
  const objective = ledger.append({ t: T, kind: "objective.assigned", actor: { kind: "referee", id: "referee" }, payload: { playerId: "pc:deuce", objectiveId: "routine", successCondition: {} }, visibility: { level: "private", playerIds: ["pc:deuce"] } });
  return { ledger, agenda, objective, interpreter: createPhaseInterpreter(ledger, SCRIPT) };
}

describe("forced confrontation burn [M2-07, INV-2/4/6]", () => {
  it("a carried strict majority records the vote then atomically burns, forfeits, mints, and widens", () => {
    const { ledger, agenda, objective, interpreter } = fixture();
    const result = interpreter.resolveConfrontation({ t: T, declarer: "pc:zhan", target: { kind: "pc", id: "pc:deuce" }, eligiblePlayerIds: ["pc:zhan", "pc:deuce", "pc:brennan"], ballots: { "pc:zhan": true, "pc:deuce": false, "pc:brennan": true }, objectiveFactId: objective.id, contents: "LOYAL" });
    expect(result.committed.map((fact) => fact.kind)).toEqual(["vote.recorded", "envelope.opened", "objective.forfeit", "deferredReveal.minted", "reveal", "reveal", "confrontation.resolved"]);
    const vote = result.committed[0]!;
    expect(result.committed.slice(1).every((fact) => fact.causes?.includes(vote.id))).toBe(true);
    expect(ledger.visibleTo({ scope: "public" }).some((fact) => fact.id === agenda.id)).toBe(true);
    expect(ledger.visibleTo({ scope: "public" }).some((fact) => fact.id === objective.id)).toBe(true);
  });

  it("a failed vote records its fixed tally and resolution but never burns or widens", () => {
    const { ledger, objective, interpreter } = fixture();
    const result = interpreter.resolveConfrontation({ t: T, declarer: "pc:zhan", target: { kind: "pc", id: "pc:deuce" }, eligiblePlayerIds: ["pc:zhan", "pc:deuce", "pc:brennan"], ballots: { "pc:zhan": true, "pc:deuce": false, "pc:brennan": false }, objectiveFactId: objective.id, contents: "LOYAL" });
    expect(result.committed.map((fact) => fact.kind)).toEqual(["vote.recorded", "confrontation.resolved"]);
    expect(ledger.visibleTo({ scope: "public" }).some((fact) => fact.id === objective.id)).toBe(false);
  });

  it("rejects NPC burn targets", () => {
    const { interpreter, objective } = fixture();
    expect(() => interpreter.resolveConfrontation({ t: T, declarer: "pc:zhan", target: { kind: "npc", id: "npc:kessler" }, eligiblePlayerIds: ["pc:zhan"], ballots: { "pc:zhan": true }, objectiveFactId: objective.id, contents: "x" })).toThrow(/NPC.*burn/i);
  });

  it("replays byte-identical payloads and widening across ballot patterns", () => {
    fc.assert(fc.property(fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }), (votes) => {
      const run = () => {
        const f = fixture();
        f.interpreter.resolveConfrontation({ t: T, declarer: "pc:zhan", target: { kind: "pc", id: "pc:deuce" }, eligiblePlayerIds: ["a", "b", "c"], ballots: { a: votes[0]!, b: votes[1]!, c: votes[2]! }, objectiveFactId: f.objective.id, contents: "sealed" });
        const stableIds = new Map([[f.agenda.id, "<agenda>"], [f.objective.id, "<objective>"]]);
        return f.ledger.all().map((fact) => ({
          kind: fact.kind,
          payload: Object.fromEntries(Object.entries(fact.payload).map(([key, value]) => [key,
            key === "objectiveFactId" && typeof value === "string" ? stableIds.get(value) :
              key === "targets" && Array.isArray(value) ? value.map((id) => stableIds.get(id as string)) : value,
          ])),
          visibility: fact.visibility,
        }));
      };
      expect(run()).toEqual(run());
    }));
  });
});
