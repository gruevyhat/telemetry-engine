import type { Fact } from "../ledger/types.js";

/**
 * [fact-kinds-v0.md §1, §3] "Correlation keys in implies: sameActor, sameLocation,
 * timeWindow(±slot), sameObject." Only sameActor and timeWindow are encoded here —
 * sameLocation/sameObject correlations in the v0 catalog's prose (cargo.diverted's
 * "sameLocation=bay" against lock.cycled's `door` field, and against presence.declared's
 * station/hex) have no shared field name to correlate on, and cargo.diverted's own payload
 * ({lotId, qty, channel}) doesn't even carry a `bay` field to correlate from. Per fact-kinds
 * §1's own rule ("under-claiming merely makes evidence slightly less informative... when
 * unsure, omit"), those correlations are omitted rather than guessed at — the safe direction,
 * since dropping a constraint only widens the consistent-actor set, never narrows it falsely.
 */
export interface SameActorCorrelation {
  readonly kind: "sameActor";
}

export interface TimeWindowCorrelation {
  readonly kind: "timeWindow";
  readonly slots: number;
}

export type Correlation = SameActorCorrelation | TimeWindowCorrelation;

/**
 * One alternative in an implies clause. `fieldEquals` ties an implied fact's field to the
 * *cause* fact's own field by name (e.g. lock.cycled's implied access.granted must have the
 * same codeClass as the cause). `fieldOneOf` checks the implied fact's field against a fixed
 * literal set (e.g. camera.looped's "comms/computer station").
 */
export interface ImpliedFactPattern {
  readonly kind: string;
  readonly correlations?: readonly Correlation[];
  readonly fieldEquals?: Readonly<Record<string, string>>;
  readonly fieldOneOf?: Readonly<Record<string, readonly string[]>>;
}

/** OR: any one pattern in the clause satisfies it. */
export type ImpliesClause = readonly ImpliedFactPattern[];

/** AND: every clause must be satisfied. */
export type ImpliesRule = readonly ImpliesClause[];

export type ImpliesCatalog = Readonly<Record<string, ImpliesRule>>;

function hasSameActor(pattern: ImpliedFactPattern): boolean {
  return (pattern.correlations ?? []).some((c) => c.kind === "sameActor");
}

function timeWindowOf(pattern: ImpliedFactPattern): number | undefined {
  const found = (pattern.correlations ?? []).find((c): c is TimeWindowCorrelation => c.kind === "timeWindow");
  return found?.slots;
}

function matchesPattern(pattern: ImpliedFactPattern, candidate: Fact, causeFact: Fact): boolean {
  if (candidate.kind !== pattern.kind) {
    return false;
  }
  const slots = timeWindowOf(pattern);
  if (slots !== undefined && Math.abs(candidate.t.day - causeFact.t.day) > slots) {
    return false;
  }
  for (const [field, causeField] of Object.entries(pattern.fieldEquals ?? {})) {
    if (candidate.payload[field] !== causeFact.payload[causeField]) {
      return false;
    }
  }
  for (const [field, allowed] of Object.entries(pattern.fieldOneOf ?? {})) {
    if (typeof candidate.payload[field] !== "string" || !allowed.includes(candidate.payload[field] as string)) {
      return false;
    }
  }
  if (hasSameActor(pattern) && candidate.actor.id !== causeFact.actor.id) {
    return false;
  }
  return true;
}

/**
 * [fact-kinds-v0.md §3] "Consistent-worlds enumeration over the small actor set: for each
 * referee-scoped cause fact, enumerate actor assignments consistent with (visible facts ∪
 * implies closure ∪ position model)." Only clauses with at least one *unconstrained* pattern
 * (no sameActor correlation) narrow the actor set — an "any actor" match reveals *who* could
 * have done it. A clause where every alternative is sameActor-correlated is a self-consistency
 * check (does the bundle's own actor also have this other fact?), not an enumeration signal, and
 * is skipped here rather than treated as an empty candidate set that would wrongly collapse the
 * whole intersection to nothing.
 */
export function consistentActors(rule: ImpliesRule, causeFact: Fact, visibleFacts: readonly Fact[]): ReadonlySet<string> {
  let candidates: Set<string> | undefined;

  for (const clause of rule) {
    const unconstrained = clause.filter((pattern) => !hasSameActor(pattern));
    if (unconstrained.length === 0) {
      continue;
    }
    const clauseActors = new Set<string>();
    for (const fact of visibleFacts) {
      if (unconstrained.some((pattern) => matchesPattern(pattern, fact, causeFact))) {
        clauseActors.add(fact.actor.id);
      }
    }
    candidates = candidates === undefined ? clauseActors : new Set([...candidates].filter((id) => clauseActors.has(id)));
  }

  return candidates ?? new Set();
}

/**
 * [fact-kinds-v0.md §2's implies column] Mechanical transcription of the catalog's existing
 * annotations, for the kinds where every correlation is resolvable (see the module doc above
 * for the two documented omissions). New kinds' implies edges are added here as their own
 * catalog PR, per CLAUDE.md's hard rule.
 */
export const IMPLIES_V0: ImpliesCatalog = {
  "cargo.loaded": [[{ kind: "presence.declared", correlations: [{ kind: "sameActor" }, { kind: "timeWindow", slots: 0 }] }]],
  "cargo.unloaded": [[{ kind: "presence.declared", correlations: [{ kind: "sameActor" }, { kind: "timeWindow", slots: 0 }] }]],
  "cargo.diverted": [
    [{ kind: "lock.cycled", correlations: [{ kind: "timeWindow", slots: 0 }] }],
    [
      { kind: "presence.declared", correlations: [{ kind: "sameActor" }] },
      { kind: "access.granted", correlations: [{ kind: "sameActor" }], fieldOneOf: { codeClass: ["remote"] } },
    ],
  ],
  "lock.cycled": [[{ kind: "access.granted", fieldEquals: { codeClass: "codeClass" } }]],
  "camera.looped": [
    [
      { kind: "presence.declared", correlations: [{ kind: "sameActor" }, { kind: "timeWindow", slots: 1 }], fieldOneOf: { station: ["comms", "computer"] } },
      { kind: "access.granted", correlations: [{ kind: "sameActor" }], fieldOneOf: { codeClass: ["remote"] } },
    ],
  ],
};
