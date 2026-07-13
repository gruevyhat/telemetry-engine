import type { AppendInput, Ledger } from "../ledger/ledger.js";
import type { ActorRef, Fact } from "../ledger/types.js";
import { presenceOf, type PresenceState } from "../position/index.js";
import type { GameTime } from "../time/index.js";

const REFEREE: ActorRef = { kind: "referee", id: "referee" };

/**
 * [Spec §10.1] "FactSelector: deliberately weak declarative filter. Conjunctive only. No joins.
 * No negation in v1." Transcribed verbatim from the Spec's interface -- do not widen it; the
 * task's own Do-not routes any expressiveness need to the owner (Plan §4.5).
 */
export interface FactSelector {
  readonly kinds?: readonly string[];
  readonly actors?: readonly ActorRef[];
  readonly timeRange?: { readonly fromDay: number; readonly toDay: number };
  readonly location?: string;
  readonly tags?: readonly string[];
}

function kindMatches(pattern: string, kind: string): boolean {
  return pattern.endsWith(".*") ? kind.startsWith(pattern.slice(0, -1)) : pattern === kind;
}

export function matchesSelector(selector: FactSelector, fact: Fact): boolean {
  if (selector.kinds && !selector.kinds.some((pattern) => kindMatches(pattern, fact.kind))) {
    return false;
  }
  if (selector.actors && !selector.actors.some((a) => a.kind === fact.actor.kind && a.id === fact.actor.id)) {
    return false;
  }
  if (selector.timeRange && (fact.t.day < selector.timeRange.fromDay || fact.t.day > selector.timeRange.toDay)) {
    return false;
  }
  if (selector.location !== undefined) {
    const location = typeof fact.payload.hex === "string" ? fact.payload.hex : typeof fact.payload.bay === "string" ? fact.payload.bay : undefined;
    if (location !== selector.location) {
      return false;
    }
  }
  if (selector.tags) {
    const factTags = Array.isArray(fact.payload.tags) ? (fact.payload.tags as unknown[]) : [];
    if (!selector.tags.every((tag) => factTags.includes(tag))) {
      return false;
    }
  }
  return true;
}

/** [Spec §10.1] "aboard | holdsGear(actor) | hasCodes | holdsPrisoner | atLocation(hex)" --
 * transcribed verbatim as a discriminated union. */
export type AccessPrecondition =
  | { readonly kind: "aboard" }
  | { readonly kind: "holdsGear" }
  | { readonly kind: "hasCodes" }
  | { readonly kind: "holdsPrisoner" }
  | { readonly kind: "atLocation"; readonly hex: string };

/**
 * What evaluateAccess needs beyond the precondition itself. holdsGear/hasCodes/holdsPrisoner
 * have no dedicated fact kind yet in the v0 catalog (no gear or prisoner tracking exists) --
 * scoped here as caller-derived sets/flags rather than inventing new fact kinds this task
 * doesn't own. "aboard" and "atLocation" *do* have a real signal (presence.declared) and use it.
 */
export interface AccessContext {
  readonly presence: PresenceState;
  readonly actorId: string;
  readonly day: number;
  readonly slot: string;
  readonly heldGear: ReadonlySet<string>;
  readonly codeHolders: ReadonlySet<string>;
  readonly holdsPrisoner: boolean;
}

export interface AccessResult {
  readonly ok: boolean;
  readonly reason?: string;
}

/** [Spec §10.1] "Access evaluates against derived position/inventory state -- failure narrates
 * why you can't reach it, no roll, no day spent." */
export function evaluateAccess(precondition: AccessPrecondition, context: AccessContext): AccessResult {
  const declared = presenceOf(context.presence, context.actorId, context.day, context.slot);

  switch (precondition.kind) {
    case "aboard":
      return declared.kind === "hex" ? { ok: false, reason: `actor "${context.actorId}" is declared off-ship at "${declared.hex}"` } : { ok: true };
    case "atLocation":
      return declared.kind === "hex" && declared.hex === precondition.hex
        ? { ok: true }
        : { ok: false, reason: `actor "${context.actorId}" is not at "${precondition.hex}"` };
    case "holdsGear":
      return context.heldGear.has(context.actorId) ? { ok: true } : { ok: false, reason: `actor "${context.actorId}" holds no qualifying gear` };
    case "hasCodes":
      return context.codeHolders.has(context.actorId) ? { ok: true } : { ok: false, reason: `actor "${context.actorId}" holds no access codes` };
    case "holdsPrisoner":
      return context.holdsPrisoner ? { ok: true } : { ok: false, reason: "no prisoner is held" };
  }
}

const DEFAULT_ACCESS_CONTEXT: AccessContext = {
  presence: { declarations: {} },
  actorId: "",
  day: 0,
  slot: "DOCKSIDE",
  heldGear: new Set(),
  codeHolders: new Set(),
  holdsPrisoner: false,
};

export interface EvidenceQuery {
  readonly target: FactSelector;
  readonly access: AccessPrecondition;
  /** [Spec §10.1] "content assigns probativeWeight per fact kind in the deck." */
  readonly probativeWeights: Readonly<Record<string, number>>;
  /** [fact-kinds-v0.md §3] Fields priced as the last reveal tier. "actor" is a synthetic field
   * name standing in for the fact's own ActorRef.id -- identity isn't a payload key, but it's
   * exactly the field the catalog's worked example says must reveal last. */
  readonly identityFields: ReadonlySet<string>;
}

export type EvidencePlan = { readonly ok: true; readonly revealProposals: readonly AppendInput[] } | { readonly ok: false; readonly reason: "access-denied"; readonly message: string };

function fieldsOf(fact: Fact): readonly string[] {
  return [...Object.keys(fact.payload), "actor"];
}

/**
 * [Spec §10.1, fact-kinds-v0.md §3] "Effect maps to how many result facts widen visibility
 * toward table, most-probative-first... identity fields reveal last." Non-identity fields
 * across *all* ranked facts spend the Effect budget before any identity field does anywhere
 * (a global ordering, not per-fact) -- this is what Appendix A's F21/F24 pair shows: F21 widens
 * F11's {time, door, code-class} at one Effect tier, F24 widens the actor identity separately,
 * later. The day cost still commits even when nothing matches (Spec §10.1: access gates the
 * roll; once past access, the reported check's cost is paid regardless of result count).
 */
export function rankAndPlanReveal(
  query: EvidenceQuery,
  candidateFacts: readonly Fact[],
  effect: number,
  t: GameTime,
  context: AccessContext = DEFAULT_ACCESS_CONTEXT,
  /** [extrapolation] Which clock an evidence action costs, and by how much, is a content/
   * balance decision, not an engine constant -- this default (obligation, -1 day) only matches
   * Appendix A's F19 as a reasonable placeholder for callers that don't supply their own. */
  costTick: { clockId: string; delta: number } = { clockId: "obligation", delta: -1 },
): EvidencePlan {
  const access = evaluateAccess(query.access, context);
  if (!access.ok) {
    return { ok: false, reason: "access-denied", message: access.reason ?? "access denied" };
  }

  const ranked = candidateFacts
    .filter((fact) => matchesSelector(query.target, fact))
    .sort((a, b) => (query.probativeWeights[b.kind] ?? 0) - (query.probativeWeights[a.kind] ?? 0));

  let budget = effect;
  const revealProposals: AppendInput[] = [];

  for (const tier of ["non-identity", "identity"] as const) {
    for (const fact of ranked) {
      if (budget <= 0) {
        break;
      }
      const fieldsInTier = fieldsOf(fact).filter((field) => query.identityFields.has(field) === (tier === "identity"));
      const spend = Math.min(budget, fieldsInTier.length);
      if (spend > 0) {
        revealProposals.push({
          t,
          kind: "reveal",
          actor: REFEREE,
          payload: { targets: [fact.id], fields: fieldsInTier.slice(0, spend) },
        });
        budget -= spend;
      }
    }
  }

  revealProposals.push({ t, kind: "clock.tick", actor: REFEREE, payload: costTick });
  return { ok: true, revealProposals };
}

/**
 * [INV-11] Commits a plan's proposals atomically via M1-07 part 1/3's ledger.appendAll. Every
 * proposal rankAndPlanReveal builds is valid-by-construction (reveal's targets/fields are
 * always arrays; costTick's clockId/delta are always well-typed), so there is no reachable input
 * here that makes appendAll itself reject a real plan -- appendAll's own atomicity is already
 * covered directly (ledger.test.ts) against a genuinely invalid batch. A test asserting this
 * function is atomic would have nothing to make it fail.
 */
export function commitEvidenceReveal(ledger: Ledger, plan: Extract<EvidencePlan, { ok: true }>): Fact[] {
  return ledger.appendAll(plan.revealProposals);
}
