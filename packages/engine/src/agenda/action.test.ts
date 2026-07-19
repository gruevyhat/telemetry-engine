import { describe, expect, it } from "vitest";
import type { Fact } from "../ledger/types.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import { createKindRegistry } from "../ledger/registry.js";
import type { AccessContext } from "../evidence/index.js";
import { evaluateAgendaAction, type AgendaActionContent } from "./index.js";

const T = { day: 7, slot: "COMMS" as const };
const TARGET: Fact = {
  id: "cargo-1", wall: 0, t: T, kind: "cargo.loaded", actor: { kind: "pc", id: "pc:zhan" },
  payload: { lotId: "L1", tons: 20, manifestId: "M1", bay: "cargo-hold", tags: ["listed"] },
  visibility: { level: "public" },
};
const ACTION: AgendaActionContent = {
  id: "agenda:divert", labelTemplate: "agenda.divert.label", access: { kind: "aboard" },
  target: { kinds: ["cargo.loaded"], where: { location: "cargo-hold", tags: ["listed"] } },
  proposals: [{
    kind: "cargo.diverted", actor: { ref: "self" },
    payload: { lotId: { ref: "target", field: "lotId" }, qty: 1, channel: "private" },
  }],
  implies: [{ kind: "presence.declared" }], payout: 1000, exposure: { clockId: "heat", delta: 1 },
};
const ACCESS: AccessContext = {
  presence: { declarations: {} }, actorId: "pc:zhan", day: T.day, slot: T.slot,
  heldGear: new Set(), codeHolders: new Set(), holdsPrisoner: false,
};

function evaluate(overrides = {}) {
  return evaluateAgendaAction({
    action: ACTION, playerId: "pc:zhan", windowId: "window-1", clientCommandId: "command-1",
    target: TARGET, t: T, currentHex: "Regina", accessContext: ACCESS, priorFacts: [TARGET],
    registry: createKindRegistry(KINDS_V0), ...overrides,
  });
}

describe("pure agenda action evaluation [M2-04, INV-5/6]", () => {
  it("emits queued intent followed by host-expanded action proposals without writing a ledger", () => {
    const result = evaluate();
    expect(result).toMatchObject({ ok: true });
    expect(result.proposals.map((proposal) => proposal.kind)).toEqual(["agenda.actionTaken", "cargo.diverted"]);
    expect(result.proposals[0]!.payload).toEqual({
      playerId: "pc:zhan", windowId: "window-1", actionId: "agenda:divert", targetFactId: "cargo-1", clientCommandId: "command-1",
    });
    expect(result.proposals[1]).toMatchObject({ actor: { kind: "pc", id: "pc:zhan" }, payload: { lotId: "L1", qty: 1, channel: "private" } });
  });

  it("returns one typed fizzle and no action effects when access fails", () => {
    const result = evaluate({ accessContext: { ...ACCESS, presence: { declarations: { "pc:zhan|7|COMMS": { kind: "hex", hex: "Regina" } } } } });
    expect(result).toMatchObject({ ok: false, reasonCode: "access-denied" });
    expect(result.proposals).toEqual([expect.objectContaining({ kind: "action.fizzled", payload: { attemptedActionId: ACTION.id, reason: "access-denied" } })]);
  });

  it("returns one typed fizzle and no action effects when timeline validation fails", () => {
    const future = { ...TARGET, id: "future", t: { ...T, day: 9 } };
    const result = evaluate({ priorFacts: [future] });
    expect(result).toMatchObject({ ok: false, reasonCode: "timeline-invalid" });
    expect(result.proposals.map((proposal) => proposal.kind)).toEqual(["action.fizzled"]);
  });
});
