import { describe, expect, it } from "vitest";
import { createKindRegistry } from "../ledger/registry.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import { createLedger } from "../ledger/ledger.js";
import type { Fact } from "../ledger/types.js";
import { presenceProjection } from "../position/index.js";
import { derive } from "../ledger/derive.js";
import type { GameTime } from "../time/index.js";
import { commitEvidenceReveal, evaluateAccess, matchesSelector, rankAndPlanReveal, type EvidenceQuery } from "./evidence.js";

const T: GameTime = { day: 14, slot: "DOCKSIDE" };
const REFEREE = { kind: "referee", id: "referee" } as const;

let nextId = 0;
function fact(kind: string, actorId: string, payload: Record<string, unknown>, day = 14): Fact {
  nextId += 1;
  return {
    id: `f${nextId}`,
    wall: 0,
    t: { day, slot: "DOCKSIDE" },
    kind,
    actor: actorId === "referee" ? REFEREE : { kind: actorId.startsWith("npc:") ? "npc" : "pc", id: actorId },
    payload,
    visibility: { level: "referee" },
  };
}

describe("matchesSelector — conjunctive FactSelector [Spec §10.1]", () => {
  const lockFact = fact("lock.cycled", "npc:kessler", { door: "aft-bay-door", codeClass: "CAPT-OVR", time: "0340" }, 14);
  const cameraFact = fact("camera.looped", "npc:kessler", { camera: "aft-bay-cam", from: "0330", to: "0335" }, 14);
  const oldLockFact = fact("lock.cycled", "npc:kessler", { door: "bridge-door", codeClass: "CAPT-OVR", time: "0100" }, 1);

  it("matches an exact kind", () => {
    expect(matchesSelector({ kinds: ["lock.cycled"] }, lockFact)).toBe(true);
    expect(matchesSelector({ kinds: ["lock.cycled"] }, cameraFact)).toBe(false);
  });

  it("matches a prefix glob ('lock.*')", () => {
    expect(matchesSelector({ kinds: ["lock.*"] }, lockFact)).toBe(true);
    expect(matchesSelector({ kinds: ["camera.*"] }, lockFact)).toBe(false);
  });

  it("is conjunctive: every specified constraint must hold, not just one", () => {
    expect(matchesSelector({ kinds: ["lock.*"], timeRange: { fromDay: 10, toDay: 20 } }, lockFact)).toBe(true);
    expect(matchesSelector({ kinds: ["lock.*"], timeRange: { fromDay: 10, toDay: 20 } }, oldLockFact)).toBe(false);
  });

  it("matches actors by kind+id", () => {
    expect(matchesSelector({ actors: [{ kind: "npc", id: "npc:kessler" }] }, lockFact)).toBe(true);
    expect(matchesSelector({ actors: [{ kind: "pc", id: "pc:zhan" }] }, lockFact)).toBe(false);
  });

  it("returns an empty match set (not an error) when no selector constraint matches anything", () => {
    const nothingMatches = { kinds: ["nonexistent.kind"] };
    expect([lockFact, cameraFact].filter((f) => matchesSelector(nothingMatches, f))).toEqual([]);
  });

  it("an empty selector (no constraints) matches everything", () => {
    expect(matchesSelector({}, lockFact)).toBe(true);
  });
});

describe("evaluateAccess — access preconditions narrate without roll or day cost [Spec §10.1]", () => {
  it("aboard: fails when the actor is explicitly declared off-ship (a hex, not a station/berth)", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    ledger.append({ t: T, kind: "presence.declared", actor: { kind: "pc", id: "pc:zhan" }, payload: { actor: "pc:zhan", hex: "Vantage", day: 14, slot: "DOCKSIDE" } });
    const presence = derive(ledger.all(), presenceProjection);

    const result = evaluateAccess({ kind: "aboard" }, { presence, actorId: "pc:zhan", day: 14, slot: "DOCKSIDE", heldGear: new Set(), codeHolders: new Set(), holdsPrisoner: false });
    expect(result.ok).toBe(false);
  });

  it("aboard: passes when no declaration exists (absence resolves to berth, not unknown)", () => {
    const result = evaluateAccess(
      { kind: "aboard" },
      { presence: { declarations: {} }, actorId: "pc:zhan", day: 14, slot: "DOCKSIDE", heldGear: new Set(), codeHolders: new Set(), holdsPrisoner: false },
    );
    expect(result.ok).toBe(true);
  });

  it("hasCodes: passes only for an actor in the codeHolders set", () => {
    const context = { presence: { declarations: {} }, actorId: "pc:zhan", day: 14, slot: "DOCKSIDE", heldGear: new Set<string>(), codeHolders: new Set(["pc:zhan"]), holdsPrisoner: false };
    expect(evaluateAccess({ kind: "hasCodes" }, context).ok).toBe(true);
    expect(evaluateAccess({ kind: "hasCodes" }, { ...context, actorId: "pc:deuce" }).ok).toBe(false);
  });

  it("holdsGear: passes only for the named actor in the heldGear set", () => {
    const context = { presence: { declarations: {} }, actorId: "pc:zhan", day: 14, slot: "DOCKSIDE", heldGear: new Set(["pc:zhan"]), codeHolders: new Set<string>(), holdsPrisoner: false };
    expect(evaluateAccess({ kind: "holdsGear" }, context).ok).toBe(true);
    expect(evaluateAccess({ kind: "holdsGear" }, { ...context, actorId: "pc:deuce" }).ok).toBe(false);
  });

  it("holdsPrisoner: passes only when the context says so", () => {
    const context = { presence: { declarations: {} }, actorId: "pc:zhan", day: 14, slot: "DOCKSIDE", heldGear: new Set<string>(), codeHolders: new Set<string>(), holdsPrisoner: true };
    expect(evaluateAccess({ kind: "holdsPrisoner" }, context).ok).toBe(true);
    expect(evaluateAccess({ kind: "holdsPrisoner" }, { ...context, holdsPrisoner: false }).ok).toBe(false);
  });

  it("atLocation: passes only when presence places the actor at that hex", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    ledger.append({ t: T, kind: "presence.declared", actor: { kind: "pc", id: "pc:zhan" }, payload: { actor: "pc:zhan", hex: "Vantage", day: 14, slot: "DOCKSIDE" } });
    const presence = derive(ledger.all(), presenceProjection);
    const context = { presence, actorId: "pc:zhan", day: 14, slot: "DOCKSIDE", heldGear: new Set<string>(), codeHolders: new Set<string>(), holdsPrisoner: false };
    expect(evaluateAccess({ kind: "atLocation", hex: "Vantage" }, context).ok).toBe(true);
    expect(evaluateAccess({ kind: "atLocation", hex: "Regina" }, context).ok).toBe(false);
  });
});

describe("rankAndPlanReveal — Effect-ranked, identity-fields-last [fact-kinds-v0.md §3]", () => {
  const lockFact = fact("lock.cycled", "npc:kessler", { door: "aft-bay-door", codeClass: "CAPT-OVR", time: "0340" });

  it("at low Effect, widens non-identity fields only, most-probative-first, never the identity field", () => {
    const query: EvidenceQuery = {
      target: { kinds: ["lock.cycled"] },
      access: { kind: "aboard" },
      probativeWeights: { "lock.cycled": 10 },
      identityFields: new Set(["actor"]),
    };
    const plan = rankAndPlanReveal(query, [lockFact], /* effect */ 2, T);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const revealed = plan.revealProposals.filter((p) => p.kind === "reveal").flatMap((p) => p.payload.fields as string[]);
    expect(revealed).not.toContain("actor");
    expect(revealed.length).toBeLessThanOrEqual(2);
  });

  it("identity fields only widen once every non-identity field (across all ranked facts) has already widened", () => {
    const query: EvidenceQuery = {
      target: { kinds: ["lock.cycled"] },
      access: { kind: "aboard" },
      probativeWeights: { "lock.cycled": 10 },
      identityFields: new Set(["actor"]),
    };
    // lockFact's non-identity payload fields: door, codeClass, time (3). Effect 4 spends 3 on
    // those, leaving exactly 1 to spend on the identity-bearing "actor" field (fact.actor.id is
    // exposed as a payload-shaped field for reveal purposes -- see evidence.ts's doc comment).
    const plan = rankAndPlanReveal(query, [lockFact], /* effect */ 4, T);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const revealed = plan.revealProposals.filter((p) => p.kind === "reveal").flatMap((p) => p.payload.fields as string[]);
    expect(revealed).toContain("actor");
  });

  it("access failure narrates without spending a roll or a day (no proposals at all)", () => {
    const query: EvidenceQuery = {
      target: { kinds: ["lock.cycled"] },
      access: { kind: "hasCodes" },
      probativeWeights: { "lock.cycled": 10 },
      identityFields: new Set(["actor"]),
    };
    const context = { presence: { declarations: {} }, actorId: "pc:zhan", day: 14, slot: "DOCKSIDE", heldGear: new Set<string>(), codeHolders: new Set<string>(), holdsPrisoner: false };
    const plan = rankAndPlanReveal(query, [lockFact], 4, T, context);
    expect(plan.ok).toBe(false);
    if (plan.ok) return;
    expect(plan.reason).toBe("access-denied");
  });

  it("an empty-result query (access passes, nothing matches) still costs the day -- you paid to look", () => {
    const query: EvidenceQuery = {
      target: { kinds: ["no.such.kind"] },
      access: { kind: "aboard" },
      probativeWeights: {},
      identityFields: new Set(),
    };
    const plan = rankAndPlanReveal(query, [lockFact], 4, T);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.revealProposals.some((p) => p.kind === "reveal")).toBe(false);
    expect(plan.revealProposals.some((p) => p.kind === "clock.tick")).toBe(true);
  });
});

describe("commitEvidenceReveal — atomic via ledger.appendAll [INV-11]", () => {
  it("commits the reveal fact(s) and the day-cost clock.tick in one atomic transaction", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const lockFact = fact("lock.cycled", "npc:kessler", { door: "aft-bay-door", codeClass: "CAPT-OVR", time: "0340" });
    const query: EvidenceQuery = {
      target: { kinds: ["lock.cycled"] },
      access: { kind: "aboard" },
      probativeWeights: { "lock.cycled": 10 },
      identityFields: new Set(["actor"]),
    };
    const plan = rankAndPlanReveal(query, [lockFact], 2, T);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;

    const committed = commitEvidenceReveal(ledger, plan);
    expect(committed.map((f) => f.kind)).toContain("reveal");
    expect(committed.map((f) => f.kind)).toContain("clock.tick");
    expect(ledger.all()).toHaveLength(committed.length);
  });
});
