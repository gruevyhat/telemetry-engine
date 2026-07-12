import type { GameTime } from "../time/index.js";
import type { KindRegistry } from "./registry.js";
import type { ActorRef, Fact, FactID, Visibility } from "./types.js";

export interface AppendInput {
  t: GameTime;
  kind: string;
  actor: ActorRef;
  payload: Record<string, unknown>;
  visibility?: Visibility;
  causes?: FactID[];
  frame?: string;
}

export type Viewer =
  | { scope: "public" }
  | { scope: "table" }
  | { scope: "private"; playerId: string }
  | { scope: "referee" };

export interface Ledger {
  append(input: AppendInput): Fact;
  all(): readonly Fact[];
  activeFacts(): readonly Fact[];
  visibleTo(viewer: Viewer): readonly Fact[];
}

export function createLedger(registry: KindRegistry): Ledger {
  const facts: Fact[] = [];
  const nextId = () => crypto.randomUUID();

  function append(input: AppendInput): Fact {
    const def = registry.get(input.kind);
    if (!def) {
      throw new Error(`cannot append unregistered kind "${input.kind}"`);
    }
    const validation = registry.validate(input.kind, input.payload);
    if (!validation.ok) {
      throw new Error(`invalid payload for kind "${input.kind}": ${validation.errors.join("; ")}`);
    }

    const fact: Fact = {
      id: nextId(),
      wall: Date.now(),
      t: input.t,
      kind: input.kind,
      actor: input.actor,
      payload: input.payload,
      visibility: input.visibility ?? { level: def.defaultVisibility },
      ...(input.causes ? { causes: input.causes } : {}),
      ...(input.frame ? { frame: input.frame } : {}),
    };
    facts.push(fact);
    return fact;
  }

  function all(): readonly Fact[] {
    return facts.slice();
  }

  function activeFacts(): readonly Fact[] {
    return facts.slice();
  }

  function visibleTo(viewer: Viewer): readonly Fact[] {
    return facts.filter((fact) => isVisibleTo(fact.visibility, viewer));
  }

  return { append, all, activeFacts, visibleTo };
}

function isVisibleTo(visibility: Visibility, viewer: Viewer): boolean {
  if (viewer.scope === "referee") {
    return true;
  }
  if (visibility.level === "public") {
    return true;
  }
  if (visibility.level === "table") {
    return viewer.scope === "table";
  }
  if (visibility.level === "private") {
    return viewer.scope === "private" && visibility.playerIds.includes(viewer.playerId);
  }
  return false;
}
