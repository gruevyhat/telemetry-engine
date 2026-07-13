import { monotonicFactory } from "ulid";
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
  /**
   * [INV-11] Validates every input in the batch against the registry before appending any of
   * them, so a batch with one invalid input commits nothing — append()'s only failure modes
   * (unregistered kind, invalid payload) are both pre-checkable, so this needs no rollback to be
   * genuinely atomic.
   */
  appendAll(inputs: readonly AppendInput[]): Fact[];
  all(): readonly Fact[];
  activeFacts(): readonly Fact[];
  visibleTo(viewer: Viewer): readonly Fact[];
}

export function createLedger(registry: KindRegistry): Ledger {
  const facts: Fact[] = [];
  const nextId = monotonicFactory();

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

  function appendAll(inputs: readonly AppendInput[]): Fact[] {
    for (const input of inputs) {
      const def = registry.get(input.kind);
      if (!def) {
        throw new Error(`appendAll: cannot append unregistered kind "${input.kind}" (batch rejected, nothing committed)`);
      }
      const validation = registry.validate(input.kind, input.payload);
      if (!validation.ok) {
        throw new Error(`appendAll: invalid payload for kind "${input.kind}": ${validation.errors.join("; ")} (batch rejected, nothing committed)`);
      }
    }
    return inputs.map(append);
  }

  function all(): readonly Fact[] {
    return facts.slice();
  }

  function visibleTo(viewer: Viewer): readonly Fact[] {
    return facts.filter((fact) => isVisibleTo(fact.visibility, viewer));
  }

  return { append, appendAll, all, activeFacts: () => activeFactsOf(facts), visibleTo };
}

/**
 * The correction-supersession rule (a fact targeted by a later kind:'correction' fact is
 * excluded), factored out so both Ledger.activeFacts() and reducers/projections (M0-03) share
 * one definition of "active" instead of two.
 */
export function activeFactsOf(facts: readonly Fact[]): readonly Fact[] {
  const superseded = new Set<FactID>();
  for (const fact of facts) {
    if (fact.kind === "correction" && typeof fact.payload.supersedes === "string") {
      superseded.add(fact.payload.supersedes);
    }
  }
  return facts.filter((fact) => !superseded.has(fact.id));
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
