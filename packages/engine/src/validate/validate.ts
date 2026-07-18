import { activeFactsOf } from "../ledger/ledger.js";
import type { AppendInput } from "../ledger/ledger.js";
import type { KindRegistry } from "../ledger/registry.js";
import type { Fact } from "../ledger/types.js";
import { presenceOf, presenceProjection, type PresenceLocation } from "../position/index.js";
import { derive } from "../ledger/derive.js";

/**
 * [Spec §9] Passes 1-4, in order, fail-fast per proposal. Pass 5 (ambiguity) is out of scope —
 * M1-05 wires that in using the closure engine this task also builds (validate/closure.ts),
 * as checkIncidentAmbiguity in generate/frame.ts -- kept separate from this pipeline because it
 * needs the IMPLIES_V0 catalog and incident-firing context this module doesn't otherwise touch.
 */
export type ValidationFailure =
  | { readonly pass: "schema"; readonly kind: string; readonly errors: readonly string[] }
  | { readonly pass: "referential"; readonly message: string }
  | { readonly pass: "reachability"; readonly message: string }
  | { readonly pass: "timeline"; readonly message: string }
  | { readonly pass: "ambiguity"; readonly message: string };

export interface ValidateResult {
  readonly ok: boolean;
  readonly failures: readonly ValidationFailure[];
}

/**
 * [Spec §9 pass 2] "Every referenced actor/object/location exists." Scoped to actor existence
 * only for v0 — object/location catalogs (valid hexes, valid cargo lots) don't exist yet, so
 * that half of the check is a documented gap, not silently glossed over. PC/world/referee
 * actors are always considered to exist: campaign setup (character creation) isn't fact-modeled
 * in v0, so there's no "introduction" fact for them to check against. NPCs must be introduced by
 * a prior npc.hired fact before acting — npc.hired's own actor is a referee/pc, so it never
 * needs to satisfy the check it exists to establish.
 */
function checkReferentialIntegrity(proposal: AppendInput, priorFacts: readonly Fact[]): ValidationFailure | undefined {
  if (proposal.actor.kind !== "npc") {
    return undefined;
  }
  const introduced = priorFacts.some(
    (fact) => fact.kind === "npc.hired" && fact.payload.npcId === proposal.actor.id,
  );
  if (!introduced) {
    return { pass: "referential", message: `npc actor "${proposal.actor.id}" was never introduced by an npc.hired fact` };
  }
  return undefined;
}

function locationField(payload: Record<string, unknown>): string | undefined {
  return typeof payload.bay === "string" ? payload.bay : typeof payload.hex === "string" ? payload.hex : undefined;
}

function declaredElsewhere(declared: PresenceLocation, required: string): boolean {
  if (declared.kind === "berth") {
    return false; // absence/berth is compatible with any aboard-ship action (position/index.ts's rule)
  }
  const declaredPlace = declared.kind === "station" ? declared.station : declared.hex;
  return declaredPlace !== required;
}

/**
 * [Spec §9 pass 3, §16] "The acting entity has a position/access chain supporting the act at
 * the stated time." Scoped to the one position signal that already exists (presence.declared):
 * if the actor is explicitly declared somewhere else for this (day, slot), an action requiring
 * a different bay/hex is unreachable. No declaration at all resolves to berth/common, which is
 * compatible with any aboard-ship action (fact-kinds-v0.md §2.1's position model).
 */
function checkReachability(proposal: AppendInput, priorFacts: readonly Fact[]): ValidationFailure | undefined {
  const required = locationField(proposal.payload);
  if (required === undefined || proposal.actor.kind !== "pc") {
    return undefined;
  }
  const presence = derive(priorFacts, presenceProjection);
  const declared = presenceOf(presence, proposal.actor.id, proposal.t.day, proposal.t.slot);
  if (declaredElsewhere(declared, required)) {
    return {
      pass: "reachability",
      message: `actor "${proposal.actor.id}" is declared elsewhere for day ${proposal.t.day} slot ${proposal.t.slot}, cannot act at "${required}"`,
    };
  }
  return undefined;
}

/**
 * [Spec §9 pass 4] "No contradiction with prior facts." Scoped to the one contradiction that's
 * unambiguous without a full contradiction ontology: time never runs backward. Same-day
 * proposals are fine (most of a beat shares one day) — only a strictly earlier day rejects.
 */
function checkTimeline(proposal: AppendInput, priorFacts: readonly Fact[]): ValidationFailure | undefined {
  const latestDay = priorFacts.reduce((max, fact) => Math.max(max, fact.t.day), -Infinity);
  if (proposal.t.day < latestDay) {
    return { pass: "timeline", message: `proposal day ${proposal.t.day} is earlier than the latest committed day ${latestDay}` };
  }
  return undefined;
}

function validateOne(proposal: AppendInput, priorFacts: readonly Fact[], registry: KindRegistry): ValidationFailure | undefined {
  const schema = registry.validate(proposal.kind, proposal.payload);
  if (!schema.ok) {
    return { pass: "schema", kind: proposal.kind, errors: schema.errors };
  }
  const active = activeFactsOf(priorFacts);
  return checkReferentialIntegrity(proposal, active) ?? checkReachability(proposal, active) ?? checkTimeline(proposal, active);
}

/**
 * [Spec §9] "Build the validator as a pure function validate(bundle, ledgerView) so both
 * directions [legends' reverse validation, §11] are the same code." Validates each proposal in
 * order against ledgerView plus the bundle's own earlier proposals (already committed within
 * the same bundle establish referential integrity for later ones — e.g. npc.hired then
 * npc.statement in one bundle).
 */
export function validate(bundle: readonly AppendInput[], ledgerView: readonly Fact[], registry: KindRegistry): ValidateResult {
  const failures: ValidationFailure[] = [];
  const priorFacts: Fact[] = [...ledgerView];

  for (const proposal of bundle) {
    const failure = validateOne(proposal, priorFacts, registry);
    if (failure) {
      failures.push(failure);
      break;
    }
    priorFacts.push({
      id: `pending-${priorFacts.length}`,
      wall: 0,
      t: proposal.t,
      kind: proposal.kind,
      actor: proposal.actor,
      payload: proposal.payload,
      visibility: proposal.visibility ?? { level: "public" },
      ...(proposal.causes ? { causes: proposal.causes } : {}),
    });
  }

  return { ok: failures.length === 0, failures };
}
