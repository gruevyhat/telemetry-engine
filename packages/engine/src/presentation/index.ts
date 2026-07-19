import type { Ledger } from "../ledger/ledger.js";
import type { Fact } from "../ledger/types.js";
import type { JsonValue } from "../persistence/index.js";

export interface PresentedFact {
  readonly id: string;
  readonly t: { readonly day: number; readonly slot: string };
  readonly kind: string;
  readonly actor: { readonly kind: string; readonly id: string };
  readonly payload: Readonly<Record<string, JsonValue>>;
  readonly scope: "public" | "private";
  readonly causes?: readonly string[];
}

export interface PrivateActionPresentation {
  readonly actionId: string;
  readonly templateKey: string;
}

export interface PlayerDeliveryContext {
  readonly agendaActionsByObjectiveId: Readonly<Record<string, readonly PrivateActionPresentation[]>>;
}

export interface PlayerDelivery {
  readonly schemaVersion: 1;
  readonly playerId: string;
  readonly publicFacts: readonly PresentedFact[];
  readonly privateFacts: readonly PresentedFact[];
  readonly agendaPacket?: {
    readonly objectiveId: string;
    readonly successCondition: Readonly<Record<string, JsonValue>>;
    readonly sealedStatus: "sealed" | "burned";
    readonly actions: readonly PrivateActionPresentation[];
  };
  readonly feedback: readonly { readonly feedbackId: string; readonly templateKey: "feedback.action-fizzled"; readonly reasonCode: string }[];
}

function jsonRecord(value: Readonly<Record<string, unknown>>): Readonly<Record<string, JsonValue>> {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new Error("player delivery payload must be JSON serializable");
  return JSON.parse(serialized) as Readonly<Record<string, JsonValue>>;
}

function present(fact: Fact, scope: "public" | "private"): PresentedFact {
  return {
    id: fact.id,
    t: fact.t,
    kind: fact.kind,
    actor: fact.actor,
    payload: jsonRecord(fact.payload),
    scope,
    ...(fact.causes ? { causes: [...fact.causes] } : {}),
  };
}

/** [M2-09, INV-13] The only full-ledger-to-client boundary. Raw facts begin with scoped ledger
 * views; the only referee-derived additions are explicitly typed agenda and fizzle DTOs. */
export function buildPlayerDelivery(ledger: Ledger, playerId: string, context: PlayerDeliveryContext): PlayerDelivery {
  const publicView = ledger.visibleTo({ scope: "public" });
  const publicIds = new Set(publicView.map((fact) => fact.id));
  const privateView = ledger.visibleTo({ scope: "private", playerId }).filter((fact) => !publicIds.has(fact.id));
  const objective = [...privateView].reverse().find((fact) => fact.kind === "objective.assigned" && fact.payload.playerId === playerId);
  const objectiveId = typeof objective?.payload.objectiveId === "string" ? objective.payload.objectiveId : undefined;
  const burned = publicView.some((fact) => fact.kind === "envelope.opened" && fact.payload.playerId === playerId);
  const feedback = ledger.all().filter((fact) => fact.kind === "action.fizzled" && fact.actor.kind === "pc" && fact.actor.id === playerId).flatMap((fact) => {
    const reasonCode = fact.payload.reason;
    return typeof reasonCode === "string" ? [{ feedbackId: fact.id, templateKey: "feedback.action-fizzled" as const, reasonCode }] : [];
  });

  return {
    schemaVersion: 1,
    playerId,
    publicFacts: publicView.map((fact) => present(fact, "public")),
    privateFacts: privateView.map((fact) => present(fact, "private")),
    ...(objective && objectiveId ? { agendaPacket: {
      objectiveId,
      successCondition: jsonRecord(objective.payload.successCondition as Readonly<Record<string, unknown>>),
      sealedStatus: burned ? "burned" : "sealed",
      actions: context.agendaActionsByObjectiveId[objectiveId] ?? [],
    } } : {}),
    feedback,
  };
}
