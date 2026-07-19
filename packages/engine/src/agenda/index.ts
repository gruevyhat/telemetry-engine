import { evaluateAccess, matchesSelector, type AccessContext, type AccessPrecondition, type FactSelector } from "../evidence/index.js";
import type { AppendInput } from "../ledger/ledger.js";
import type { KindRegistry } from "../ledger/registry.js";
import type { ActorRef, Fact } from "../ledger/types.js";
import type { JsonValue } from "../persistence/index.js";
import { createSecretDrawCommitment, type Rng, type SecretDrawPreimage } from "../rng/index.js";
import type { GameTime } from "../time/index.js";
import { validate } from "../validate/index.js";

export type AgendaTier = "orthogonal" | "parasitic" | "hostile";
export type AgendaSelector = FactSelector & { readonly rankBy: "probative"; readonly threshold: number };
export type ActionValueRef =
  | { readonly ref: "self" | "currentDay" | "currentHex" }
  | { readonly ref: "target"; readonly field: string };
export interface ActionFactTemplate {
  readonly kind: string;
  readonly actor: ActorRef | { readonly ref: "self" };
  readonly payload: Readonly<Record<string, JsonValue | ActionValueRef>>;
}
export interface AgendaActionContent {
  readonly id: string;
  readonly labelTemplate: string;
  readonly access: AccessPrecondition;
  readonly target?: { readonly kinds: readonly [string, ...string[]]; readonly where?: Omit<FactSelector, "kinds"> };
  readonly proposals: readonly ActionFactTemplate[];
  readonly implies: readonly { readonly kind: string }[];
  readonly payout: number;
  readonly exposure: { readonly clockId: string; readonly delta: number };
}
export interface AgendaContent {
  readonly id: string;
  readonly faction: string;
  readonly tier: AgendaTier;
  readonly successCondition: AgendaSelector;
  readonly exposureCost: { readonly clockId: string; readonly delta: number };
  readonly actions: readonly AgendaActionContent[];
}
export interface AgendaDeck {
  readonly id: string;
  readonly odds: number;
  readonly tierWeights: Readonly<Record<AgendaTier, number>>;
  readonly routineObjective: { readonly id: string; readonly successCondition: AgendaSelector };
  readonly templates: Readonly<Record<string, string>>;
  readonly agendas: readonly AgendaContent[];
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

/** Runtime loader complements the JSON/content lint pass and rejects unsafe untyped callers. */
export function loadAgendaDeck(raw: unknown): AgendaDeck {
  const deck = record(raw, "agenda deck");
  if (typeof deck.id !== "string" || !deck.id) throw new Error("agenda deck id must be a non-empty string");
  if (typeof deck.odds !== "number" || deck.odds < 0 || deck.odds > 1) throw new Error("agenda deck odds must be between 0 and 1");
  const weights = record(deck.tierWeights, "agenda tierWeights");
  const agendas = deck.agendas;
  if (!Array.isArray(agendas) || agendas.length === 0) throw new Error("agenda deck must contain agendas");
  const agendaIds = new Set<string>();
  const actionIds = new Set<string>();
  for (const value of agendas) {
    const agenda = record(value, "agenda");
    if (typeof agenda.id !== "string" || !agenda.id || agendaIds.has(agenda.id)) throw new Error(`invalid or duplicate agenda id "${String(agenda.id)}"`);
    if (!Array.isArray(agenda.actions)) throw new Error(`agenda "${agenda.id}" actions must be an array`);
    agendaIds.add(agenda.id);
    for (const value of agenda.actions) {
      const action = record(value, "agenda action");
      if (typeof action.id !== "string" || !action.id || actionIds.has(action.id)) throw new Error(`invalid or duplicate agenda action id "${String(action.id)}"`);
      actionIds.add(action.id);
    }
  }
  for (const tier of ["orthogonal", "parasitic", "hostile"] as const) {
    if (typeof weights[tier] !== "number" || (weights[tier] as number) < 0) throw new Error(`invalid ${tier} tier weight`);
    if ((weights[tier] as number) > 0 && !agendas.some((agenda) => record(agenda, "agenda").tier === tier)) {
      throw new Error(`positive ${tier} tier weight has no agenda`);
    }
  }
  if (Math.abs((weights.orthogonal as number) + (weights.parasitic as number) + (weights.hostile as number) - 1) > 1e-9) {
    throw new Error("agenda tier weights must sum to 1");
  }
  record(deck.routineObjective, "routineObjective");
  record(deck.templates, "agenda templates");
  return raw as AgendaDeck;
}

export interface AgendaDealPlan {
  readonly proposals: readonly AppendInput[];
  readonly preimages: readonly SecretDrawPreimage<JsonValue>[];
}

export type AgendaActionResult =
  | { readonly ok: true; readonly proposals: readonly AppendInput[] }
  | { readonly ok: false; readonly reasonCode: string; readonly proposals: readonly [AppendInput] };

function fizzle(t: GameTime, actionId: string, reasonCode: string): AgendaActionResult {
  return {
    ok: false,
    reasonCode,
    proposals: [{ t, kind: "action.fizzled", actor: { kind: "referee", id: "referee" }, payload: { attemptedActionId: actionId, reason: reasonCode } }],
  };
}

function resolveActionValue(value: JsonValue | ActionValueRef, input: AgendaActionEvaluationInput): JsonValue {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("ref" in value)) return value as JsonValue;
  const ref = value as ActionValueRef;
  if (ref.ref === "self") return input.playerId;
  if (ref.ref === "currentDay") return input.t.day;
  if (ref.ref === "currentHex") return input.currentHex;
  if (ref.ref !== "target") throw new Error("unsupported action value reference");
  const resolved = input.target?.payload[ref.field];
  if (resolved === undefined || typeof resolved === "function" || typeof resolved === "symbol" || typeof resolved === "bigint") {
    throw new Error(`target field "${ref.field}" is unavailable`);
  }
  return resolved as JsonValue;
}

export interface AgendaActionEvaluationInput {
  readonly action: AgendaActionContent;
  readonly playerId: string;
  readonly windowId: string;
  readonly clientCommandId: string;
  readonly target?: Fact;
  readonly t: GameTime;
  readonly currentHex: string;
  readonly accessContext: AccessContext;
  readonly priorFacts: readonly Fact[];
  readonly registry: KindRegistry;
}

/** Pure queue/effect expansion. M2-05 owns ordering and calls this only when the COMMS window closes. */
export function evaluateAgendaAction(input: AgendaActionEvaluationInput): AgendaActionResult {
  if (!evaluateAccess(input.action.access, input.accessContext).ok) return fizzle(input.t, input.action.id, "access-denied");
  if (input.action.target) {
    if (!input.target || !matchesSelector({ kinds: input.action.target.kinds, ...input.action.target.where }, input.target)) {
      return fizzle(input.t, input.action.id, "target-invalid");
    }
  }
  try {
    const intent: AppendInput = {
      t: input.t, kind: "agenda.actionTaken", actor: { kind: "pc", id: input.playerId },
      payload: { playerId: input.playerId, windowId: input.windowId, actionId: input.action.id, ...(input.target ? { targetFactId: input.target.id } : {}), clientCommandId: input.clientCommandId },
    };
    const effects = input.action.proposals.map((template): AppendInput => ({
      t: input.t,
      kind: template.kind,
      actor: "ref" in template.actor ? { kind: "pc", id: input.playerId } : template.actor,
      payload: Object.fromEntries(Object.entries(template.payload).map(([field, value]) => [field, resolveActionValue(value, input)])),
    }));
    if (effects.some((proposal) => input.registry.get(proposal.kind)?.defaultVisibility !== "referee")) {
      return fizzle(input.t, input.action.id, "visibility-invalid");
    }
    const proposals = [intent, ...effects];
    const checked = validate(proposals, input.priorFacts, input.registry);
    if (!checked.ok) return fizzle(input.t, input.action.id, `${checked.failures[0]!.pass}-invalid`);
    return { ok: true, proposals };
  } catch {
    return fizzle(input.t, input.action.id, "content-invalid");
  }
}

/** One agenda-deal stream sample per player; the sample also deterministically selects tier/content. */
export async function planAgendaDeal(input: {
  readonly t: GameTime;
  readonly players: readonly string[];
  readonly deck: AgendaDeck;
  readonly rng: Rng;
  readonly campaignSeed: string;
  readonly campaignSalt: string;
  readonly seedCommitment: { readonly factId: string; readonly hash: string };
}): Promise<AgendaDealPlan> {
  if (new Set(input.players).size !== input.players.length) throw new Error("agenda deal players must be unique");
  const proposals: AppendInput[] = [];
  const preimages: SecretDrawPreimage<JsonValue>[] = [];
  for (const playerId of input.players) {
    const draw = await createSecretDrawCommitment({
      ...input,
      streamId: "agenda-deal",
      resolve(unit) {
        if (unit >= input.deck.odds) return { result: false, tier: null, objectiveId: input.deck.routineObjective.id };
        const position = input.deck.odds === 0 ? 0 : unit / input.deck.odds;
        let tier: AgendaTier = "hostile";
        let tierStart = input.deck.tierWeights.orthogonal + input.deck.tierWeights.parasitic;
        if (position < input.deck.tierWeights.orthogonal) { tier = "orthogonal"; tierStart = 0; }
        else if (position < tierStart) { tier = "parasitic"; tierStart = input.deck.tierWeights.orthogonal; }
        const choices = input.deck.agendas.filter((agenda) => agenda.tier === tier);
        const localPosition = (position - tierStart) / input.deck.tierWeights[tier];
        const agenda = choices[Math.min(choices.length - 1, Math.floor(localPosition * choices.length))]!;
        return { result: true, tier, objectiveId: agenda.id };
      },
    });
    const outcome = draw.result as { result: boolean; tier: AgendaTier | null; objectiveId: string };
    const objective = outcome.result ? input.deck.agendas.find((agenda) => agenda.id === outcome.objectiveId)! : input.deck.routineObjective;
    proposals.push(
      { t: input.t, kind: "agenda.dealt", actor: { kind: "referee", id: "referee" }, payload: { playerId, result: outcome.result, ...(outcome.tier ? { tier: outcome.tier } : {}) } },
      { t: input.t, kind: "objective.assigned", actor: { kind: "referee", id: "referee" }, payload: { playerId, objectiveId: objective.id, successCondition: objective.successCondition }, visibility: { level: "private", playerIds: [playerId] } },
      draw.proposal,
    );
    preimages.push(draw.preimage);
  }
  return { proposals, preimages };
}
