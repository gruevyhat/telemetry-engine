import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createKindRegistry } from "../ledger/registry.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import { createLedger } from "../ledger/ledger.js";
import { buildPlayerDelivery } from "./index.js";

const T = { day: 7, slot: "COMMS" as const };

describe("buildPlayerDelivery [M2-09, INV-13]", () => {
  it("fuzzes serialized deliveries so referee and foreign-private markers never cross the boundary", () => {
    fc.assert(fc.property(fc.string({ minLength: 4, maxLength: 24 }), fc.string({ minLength: 4, maxLength: 24 }), (ownMarker, foreignMarker) => {
      fc.pre(ownMarker !== foreignMarker);
      const ledger = createLedger(createKindRegistry(KINDS_V0));
      ledger.append({ t: T, kind: "confrontation.resolved", actor: { kind: "pc", id: "pc:zhan" }, payload: { outcome: "open", logNote: "public-record" } });
      ledger.append({ t: T, kind: "objective.assigned", actor: { kind: "referee", id: "referee" }, payload: { playerId: "pc:zhan", objectiveId: ownMarker, successCondition: {} }, visibility: { level: "private", playerIds: ["pc:zhan"] } });
      ledger.append({ t: T, kind: "objective.assigned", actor: { kind: "referee", id: "referee" }, payload: { playerId: "pc:deuce", objectiveId: foreignMarker, successCondition: {} }, visibility: { level: "private", playerIds: ["pc:deuce"] } });
      ledger.append({ t: T, kind: "action.fizzled", actor: { kind: "pc", id: "pc:deuce" }, payload: { attemptedActionId: foreignMarker, reason: foreignMarker } });

      const serialized = JSON.stringify(buildPlayerDelivery(ledger, "pc:zhan", { agendaActionsByObjectiveId: {} }));
      expect(serialized).toContain(ownMarker);
      expect(serialized).not.toContain(foreignMarker);
      expect(serialized).not.toContain("action.fizzled");
    }));
  });

  it("derives only the addressed player's typed fizzle feedback and agenda action menu", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    ledger.append({ t: T, kind: "objective.assigned", actor: { kind: "referee", id: "referee" }, payload: { playerId: "pc:zhan", objectiveId: "objective:zhan", successCondition: {} }, visibility: { level: "private", playerIds: ["pc:zhan"] } });
    const fizzle = ledger.append({ t: T, kind: "action.fizzled", actor: { kind: "pc", id: "pc:zhan" }, payload: { attemptedActionId: "skim", reason: "target-conflict" } });
    const delivery = buildPlayerDelivery(ledger, "pc:zhan", { agendaActionsByObjectiveId: { "objective:zhan": [{ actionId: "skim", templateKey: "agenda.skim.label" }] } });
    expect(delivery.agendaPacket).toMatchObject({ objectiveId: "objective:zhan", sealedStatus: "sealed", actions: [{ actionId: "skim", templateKey: "agenda.skim.label" }] });
    expect(delivery.feedback).toEqual([{ feedbackId: fizzle.id, templateKey: "feedback.action-fizzled", reasonCode: "target-conflict" }]);
  });
});
