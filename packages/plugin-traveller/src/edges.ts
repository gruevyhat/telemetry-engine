/**
 * [M3-09, Spec §15, rulebook §13.2] Career pillar edges. No `@telemetry/engine` dependency here
 * (M3-01/06/07 precedent): the actual `edge.used` ledger commit lives in
 * `packages/engine/src/phases/commits.ts` (INV-6), which accepts this module's `EdgeProposal`
 * structurally, without either package importing the other.
 *
 * "Once per session" has no session-lifecycle substrate anywhere in this codebase (no fact
 * kind, no phase step, no milestone scheduled to build one) — see the escalation resolution in
 * `docs/design/travel-and-import-v1.md` §5.4 addendum and PROJECT.md. An edge here is
 * available until used, once, for the life of the campaign; that is honest given what exists
 * today, not a faked "per session" mechanic.
 */

export type EdgeAvailability = "available" | "deferred";

export interface TravellerEdgeDef {
  readonly id: string;
  readonly career: string;
  readonly label: string;
  readonly availability: EdgeAvailability;
  readonly deferredUntil: string | undefined;
}

/** A fact as this module needs to see one — structurally compatible with the engine's real
 * `Fact`, but this module never imports that type (see file header). */
export interface EdgeUseFact {
  readonly id: string;
  readonly kind: string;
  readonly payload: Record<string, unknown>;
}

/** What `commitEdgeUsed` (`phases/commits.ts`) appends, minus the ledger-assigned `id`/`wall`. */
export interface EdgeProposal {
  readonly t: { readonly day: number; readonly slot: string };
  readonly kind: "edge.used";
  readonly actor: { readonly kind: "pc"; readonly id: string };
  readonly payload: {
    readonly crewMemberId: string;
    readonly edgeId: string;
    readonly targetFactId: string;
  };
}

export type EdgeUseResult =
  | { readonly ok: true; readonly proposal: EdgeProposal }
  | { readonly ok: false; readonly reason: "already-used" }
  | { readonly ok: false; readonly reason: "deferred" }
  | { readonly ok: false; readonly reason: "wrong-check" };

export interface EdgeUseContext {
  /** Required for the Merchant edge: the reroll's own `check.reported` fact. A reroll needs no
   * new engine operation — Spec §6's "the engine never rolls for a PC" means it is just a
   * second player-reported check via the existing `reportCheck` interpreter method. */
  readonly checkFact?: EdgeUseFact;
  /** Required for the negotiated edge: the crew member's own `crew.imported` fact, since the
   * grant is recorded once, at import, and has no check to target. */
  readonly crewImportedFact?: EdgeUseFact;
}

const BROKER_SKILL = "broker";

const NEGOTIATED: TravellerEdgeDef = {
  id: "negotiated",
  career: "Negotiated",
  label: "Negotiate a pillar edge with MAGGIE at import.",
  availability: "available",
  deferredUntil: undefined,
};

export const careerEdges: Record<string, TravellerEdgeDef> = {
  Merchant: {
    id: "merchant-broker-reroll",
    career: "Merchant",
    label: "Reroll one Broker check.",
    availability: "available",
    deferredUntil: undefined,
  },
  Scout: {
    id: "scout-survey-question",
    career: "Scout",
    label: "Ask MAGGIE one free survey question.",
    availability: "deferred",
    deferredUntil: "M4",
  },
  Agent: {
    id: "agent-legend-fact",
    career: "Agent",
    label: "Receive one extra legend fact.",
    availability: "deferred",
    deferredUntil: "M5",
  },
  Army: {
    id: "army-engagement-boon",
    career: "Army",
    label: "Take a Boon on one engagement decision.",
    availability: "deferred",
    deferredUntil: "M5",
  },
  Marines: {
    id: "marines-engagement-boon",
    career: "Marines",
    label: "Take a Boon on one engagement decision.",
    availability: "deferred",
    deferredUntil: "M5",
  },
  Negotiated: NEGOTIATED,
};

/** An unrecognised or absent career falls back to the negotiated edge — never an error, never
 * Merchant's edge by accident. */
export function resolveEdge(career: string | undefined): TravellerEdgeDef {
  if (career !== undefined && career in careerEdges) {
    return careerEdges[career]!;
  }
  return NEGOTIATED;
}

function hasUsedEdge(facts: readonly EdgeUseFact[], crewMemberId: string, edgeId: string): boolean {
  return facts.some(
    (fact) => fact.kind === "edge.used" && fact.payload.crewMemberId === crewMemberId && fact.payload.edgeId === edgeId,
  );
}

/**
 * Attempts to use the career edge for `crewMember`, given the current fact stream and whichever
 * of `context.checkFact`/`context.crewImportedFact` the edge in question needs. Returns a
 * proposal only (INV-6) — the caller commits it via `phases/commits.ts`'s `commitEdgeUsed`.
 */
export function useEdge(
  facts: readonly EdgeUseFact[],
  crewMember: { readonly crewMemberId: string; readonly career: string | undefined },
  context: EdgeUseContext,
  t: { readonly day: number; readonly slot: string },
): EdgeUseResult {
  const edge = resolveEdge(crewMember.career);

  if (edge.availability === "deferred") {
    return { ok: false, reason: "deferred" };
  }

  if (hasUsedEdge(facts, crewMember.crewMemberId, edge.id)) {
    return { ok: false, reason: "already-used" };
  }

  let targetFactId: string;
  if (edge.id === careerEdges.Merchant!.id) {
    const checkFact = context.checkFact;
    if (!checkFact || typeof checkFact.payload.skill !== "string" || checkFact.payload.skill.toLowerCase() !== BROKER_SKILL) {
      return { ok: false, reason: "wrong-check" };
    }
    targetFactId = checkFact.id;
  } else {
    if (!context.crewImportedFact) {
      return { ok: false, reason: "wrong-check" };
    }
    targetFactId = context.crewImportedFact.id;
  }

  return {
    ok: true,
    proposal: {
      t,
      kind: "edge.used",
      actor: { kind: "pc", id: crewMember.crewMemberId },
      payload: { crewMemberId: crewMember.crewMemberId, edgeId: edge.id, targetFactId },
    },
  };
}
