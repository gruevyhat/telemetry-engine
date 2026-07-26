import { describe, expect, it } from "vitest";
import { careerEdges, resolveEdge, useEdge, type EdgeUseFact } from "./edges.js";

/**
 * M3-09 acceptance tests — lead-authored and lead-implemented (frontier work; the dispatch
 * escalation was reclassified, so there is no worker/read-only split here). See PROJECT.md and
 * docs/design/travel-and-import-v1.md §5.4 addendum for the resolution this card's scope reflects:
 * no session-reset (no session-lifecycle substrate exists), reroll = a second `reportCheck`
 * (no new engine operation), `edge.used` public per the catalog, negotiated `targetFactId` is the
 * crew member's own `crew.imported` fact.
 */

const T = { day: 1, slot: "DOCKSIDE" } as const;

const ZHAN = { crewMemberId: "crew:zhan", career: "Merchant" };
const BRENNAN = { crewMemberId: "crew:brennan", career: "Scout" };
const OKONKWO = { crewMemberId: "crew:okonkwo", career: "Rogue" };

function checkFact(overrides: Partial<EdgeUseFact> = {}): EdgeUseFact {
  return { id: "fact:check-1", kind: "check.reported", payload: { skill: "Broker" }, ...overrides };
}

function crewImportedFact(crewMemberId: string): EdgeUseFact {
  return { id: `fact:imported-${crewMemberId}`, kind: "crew.imported", payload: { crewMemberId } };
}

describe("careerEdges registry [M3-09, Spec §15, rulebook §13.2]", () => {
  it("declares Merchant and Negotiated as available, Scout/Agent/Army/Marines as deferred with a milestone", () => {
    expect(careerEdges.Merchant!.availability).toBe("available");
    expect(careerEdges.Negotiated!.availability).toBe("available");
    for (const career of ["Scout", "Agent", "Army", "Marines"] as const) {
      expect(careerEdges[career]!.availability).toBe("deferred");
      expect(careerEdges[career]!.deferredUntil).toMatch(/^M[45]$/);
    }
  });

  it("an unrecognised career resolves to the negotiated edge, not an error and not Merchant", () => {
    const edge = resolveEdge("Barbarian");
    expect(edge).toBe(careerEdges.Negotiated);
  });
});

describe("useEdge — Merchant reroll [M3-09]", () => {
  it("a Merchant character gets exactly one Broker reroll, ever; the second attempt is refused as already-used", () => {
    const first = useEdge([], ZHAN, { checkFact: checkFact() }, T);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");
    expect(first.proposal.kind).toBe("edge.used");
    expect(first.proposal.payload).toMatchObject({ crewMemberId: "crew:zhan", edgeId: careerEdges.Merchant!.id, targetFactId: "fact:check-1" });

    const usedFact: EdgeUseFact = { id: "fact:used-1", kind: "edge.used", payload: first.proposal.payload };
    const second = useEdge([usedFact], ZHAN, { checkFact: checkFact({ id: "fact:check-2" }) }, T);
    expect(second).toEqual({ ok: false, reason: "already-used" });
  });

  it("offered on a Broker check, refused on a non-Broker check", () => {
    const result = useEdge([], ZHAN, { checkFact: checkFact({ payload: { skill: "Pilot" } }) }, T);
    expect(result).toEqual({ ok: false, reason: "wrong-check" });
  });

  it("emits a proposal, never a direct ledger write (INV-6): the proposal has no id/wall of its own", () => {
    const result = useEdge([], ZHAN, { checkFact: checkFact() }, T);
    if (!result.ok) throw new Error("expected ok");
    expect(result.proposal).not.toHaveProperty("id");
    expect(result.proposal).not.toHaveProperty("wall");
  });
});

describe("useEdge — deferred careers [M3-09]", () => {
  it("a Scout/Agent/Army/Marines character has its edge declared but firing it returns a typed deferred result", () => {
    const result = useEdge([], BRENNAN, { checkFact: checkFact() }, T);
    expect(result).toEqual({ ok: false, reason: "deferred" });
  });
});

describe("useEdge — negotiated fallback [M3-09]", () => {
  it("is usable exactly once, targeting the crew member's own crew.imported fact", () => {
    const imported = crewImportedFact("crew:okonkwo");
    const first = useEdge([imported], OKONKWO, { crewImportedFact: imported }, T);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("unreachable");
    expect(first.proposal.payload).toMatchObject({ crewMemberId: "crew:okonkwo", edgeId: careerEdges.Negotiated!.id, targetFactId: imported.id });

    const usedFact: EdgeUseFact = { id: "fact:used-2", kind: "edge.used", payload: first.proposal.payload };
    const second = useEdge([imported, usedFact], OKONKWO, { crewImportedFact: imported }, T);
    expect(second).toEqual({ ok: false, reason: "already-used" });
  });
});
