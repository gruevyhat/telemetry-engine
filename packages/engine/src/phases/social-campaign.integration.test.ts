import { describe, expect, it } from "vitest";
import { createKindRegistry } from "../ledger/registry.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import { createLedger } from "../ledger/ledger.js";
import { createRng, type SecretDrawPreimage } from "../rng/index.js";
import { assembleBlackBoxArtifact, verifyBlackBoxArtifact } from "../rng/black-box.js";
import { fireFrame, type IncidentFrame } from "../generate/frame.js";
import type { SlotEntry } from "../generate/compose.js";
import { loadPhaseScript } from "./load.js";
import { createPhaseInterpreter } from "./interpreter.js";
import type { AgendaDeck } from "../agenda/index.js";

const T = { day: 7, slot: "COMMS" as const };
const CAMPAIGN_SEED = "capstone-seed";
const CAMPAIGN_SALT = "capstone-salt";

const SHARED_CRATE_ACTION = {
  id: "agenda:skim-crate",
  labelTemplate: "agenda.skim.label",
  access: { kind: "aboard" as const },
  target: { kinds: ["cargo.loaded"] as const },
  proposals: [{ kind: "cargo.diverted", actor: { ref: "self" as const }, payload: { lotId: { ref: "target" as const, field: "lotId" }, qty: 1, channel: "private" } }],
  implies: [],
  payout: 1,
  exposure: { clockId: "heat", delta: 1 },
};

const DECK: AgendaDeck = {
  id: "capstone-deck",
  odds: 1,
  tierWeights: { orthogonal: 1, parasitic: 0, hostile: 0 },
  routineObjective: { id: "routine", successCondition: { kinds: ["cargo.diverted"], rankBy: "probative", threshold: 1 } },
  templates: {},
  agendas: [
    {
      id: "agenda:orthogonal-skim",
      faction: "independent",
      tier: "orthogonal",
      successCondition: { kinds: ["cargo.diverted"], rankBy: "probative", threshold: 1 },
      exposureCost: { clockId: "heat", delta: 1 },
      actions: [SHARED_CRATE_ACTION],
    },
  ],
};

const SCRIPT = loadPhaseScript({
  frame: "capstone-social-campaign",
  start: "comms",
  steps: [
    { id: "comms", kind: "commsWindow" as const, next: "confrontation" },
    { id: "confrontation", kind: "confrontation" as const, next: "confrontation" },
  ],
});

function minimalSlotTables(overrides: Partial<Record<"actor" | "motive" | "method" | "location" | "trace", readonly SlotEntry[]>> = {}) {
  return {
    actor: [{ id: "npc:kessler", factFields: {}, surfaceFields: {} }],
    motive: [{ id: "revenge", factFields: {}, surfaceFields: {} }],
    method: [{ id: "cargo-diversion", factFields: {}, surfaceFields: {} }],
    location: [{ id: "aft-bay", factFields: {}, surfaceFields: {} }],
    trace: [{ id: "camera-loop", factFields: {}, surfaceFields: {} }],
    ...overrides,
  };
}

const INCIDENT_FRAME: IncidentFrame = {
  id: "capstone-incident",
  pillar: "trade",
  surfaceTables: minimalSlotTables(),
  claimant: { agendaActionId: SHARED_CRATE_ACTION.id },
  innocentTwin: [{
    kind: "cargo.diverted",
    tables: minimalSlotTables({ actor: [{ id: "npc:kessler", factFields: { lotId: "L-innocent", qty: 1, channel: "spoilage" }, surfaceFields: {} }] }),
  }],
  evidenceTrail: [],
  cooldownWeeks: 4,
};

describe("integrated social campaign [M2-15, INV-5/8/10/11/13]", () => {
  it("deals agendas, resolves colliding comms actions, surfaces one ambiguous incident, carries an accusation vote, and verifies its black box", async () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const rng = createRng(CAMPAIGN_SEED);
    const interpreter = createPhaseInterpreter(ledger, SCRIPT, {
      rng,
      deck: [],
      commitReveal: { campaignSeed: CAMPAIGN_SEED, campaignSalt: CAMPAIGN_SALT },
      agenda: { actions: [SHARED_CRATE_ACTION], currentHex: "Regina", registry: createKindRegistry(KINDS_V0) },
    });

    // 1. Deal agendas: guaranteed odds means both players get the real orthogonal agenda.
    const deal = await interpreter.dealAgendas({ t: T, players: ["pc:zhan", "pc:deuce"], deck: DECK });
    const drawPreimages: SecretDrawPreimage[] = [...deal.commitmentPreimages.draws];
    const zhanObjective = ledger.all().find((fact) => fact.kind === "objective.assigned" && fact.payload.playerId === "pc:zhan")!;
    const deuceObjective = ledger.all().find((fact) => fact.kind === "objective.assigned" && fact.payload.playerId === "pc:deuce")!;
    expect(zhanObjective.payload.objectiveId).toBe("agenda:orthogonal-skim");
    expect(deuceObjective.payload.objectiveId).toBe("agenda:orthogonal-skim");

    // 2. Colliding comms actions: both target the same crate; only one wins, the other fizzles.
    const crate = ledger.append({ t: T, kind: "cargo.loaded", actor: { kind: "world", id: "world" }, payload: { lotId: "L1", tons: 2, manifestId: "M1", bay: "hold" } });
    interpreter.queueCommsAction({ t: T, playerId: "pc:zhan", windowId: "window-1", actionId: SHARED_CRATE_ACTION.id, targetFactId: crate.id, clientCommandId: "zhan-1" });
    interpreter.queueCommsAction({ t: T, playerId: "pc:deuce", windowId: "window-1", actionId: SHARED_CRATE_ACTION.id, targetFactId: crate.id, clientCommandId: "deuce-1" });
    const closed = await interpreter.advanceCommitted(T, { kind: "referee", id: "referee" });
    drawPreimages.push(...closed.commitmentPreimages.draws);

    const diverted = ledger.all().filter((fact) => fact.kind === "cargo.diverted");
    const fizzled = ledger.all().filter((fact) => fact.kind === "action.fizzled");
    expect(diverted).toHaveLength(1);
    expect(fizzled).toHaveLength(1);
    expect(new Set([...diverted.map((f) => f.actor.id), ...fizzled.map((f) => f.actor.id)])).toEqual(new Set(["pc:zhan", "pc:deuce"]));

    // 3. Surface one ambiguous incident: identical surface either way, cause facts differ.
    const fired = fireFrame(INCIDENT_FRAME, T, rng);
    expect(fired.causeSource).toBe("innocentTwin");
    for (const proposal of fired.causeProposals) ledger.append(proposal);
    expect(fired.innocentAlternativeProposals).toEqual(fired.causeProposals);

    // 4. Accusation vote carries: the winning diverter is accused and burned.
    const winner = diverted[0]!.actor.id;
    const winnerObjective = winner === "pc:zhan" ? zhanObjective : deuceObjective;
    const confrontation = interpreter.resolveConfrontation({
      t: T, declarer: winner === "pc:zhan" ? "pc:deuce" : "pc:zhan",
      target: { kind: "pc", id: winner },
      eligiblePlayerIds: ["pc:zhan", "pc:deuce", "pc:brennan"],
      ballots: { "pc:zhan": true, "pc:deuce": true, "pc:brennan": true },
      objectiveFactId: winnerObjective.id,
      contents: "GUILTY-OF-THE-SKIM",
    });
    expect(confrontation.committed.map((fact) => fact.kind)).toContain("envelope.opened");
    expect(ledger.all().some((fact) => fact.kind === "envelope.opened" && fact.payload.playerId === winner)).toBe(true);

    // 5. Black box verifies end to end.
    const artifact = await assembleBlackBoxArtifact({
      facts: ledger.all(),
      seedPreimage: deal.commitmentPreimages.seed!,
      drawPreimages,
    });
    const verification = await verifyBlackBoxArtifact(artifact);
    expect(verification.seed).toEqual({ ok: true });
    expect(verification.failedCount).toBe(0);
    expect(verification.verifiedCount).toBe(drawPreimages.length);
  });
});
