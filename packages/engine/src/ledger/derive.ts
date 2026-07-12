import { activeFactsOf } from "./ledger.js";
import type { Fact } from "./types.js";

/** [Spec §2.1] "All game state ... is derived by pure reducers over the fact stream and memoized." */
export const SCHEMA_VERSION = 1;

export interface Projection<S> {
  readonly initial: S;
  apply(state: S, fact: Fact): S;
}

/**
 * Pure, IO-free fold over the ledger's *active* facts (corrections already excluded — see
 * activeFactsOf). Fresh every call; this is the function INV-3's "derive(facts) run twice ...
 * yields byte-identical state" refers to.
 */
export function derive<S>(facts: readonly Fact[], projection: Projection<S>): S {
  return facts.reduce(projection.apply, projection.initial);
}

export interface MemoizedProjection<S> {
  readonly schemaVersion: number;
  derive(facts: readonly Fact[]): S;
}

/**
 * Avoids recomputing when the ledger hasn't grown since the last call. Full O(n) refold on any
 * growth, not an incremental per-fact cache: a correction fact can retroactively exclude a fact
 * that appeared earlier in the log, so a left-to-right incremental fold can't always be
 * corrected by processing only the newly appended tail. At campaign scale (Spec §2.3: "a
 * campaign is thousands of facts, not millions") an O(n) refold on change is the documented
 * cost, not a workaround.
 */
export function createMemoizedProjection<S>(
  projection: Projection<S>,
  schemaVersion: number = SCHEMA_VERSION,
): MemoizedProjection<S> {
  let cachedLength = -1;
  let cachedState = projection.initial;

  return {
    schemaVersion,
    derive(facts) {
      cachedState = derive(facts, projection);
      cachedLength = facts.length;
      return cachedState;
    },
  };
}

/**
 * Composes named sub-projections into one. Each sub-projection only reacts to the fact kinds it
 * cares about; if none of them change on a given fact, the combined state keeps its old
 * reference (cheap structural-equality checks for callers that want them).
 */
export function combineProjections<T extends Record<string, unknown>>(projections: {
  [K in keyof T]: Projection<T[K]>;
}): Projection<T> {
  const keys = Object.keys(projections) as (keyof T)[];
  const initial = keys.reduce((state, key) => {
    state[key] = projections[key].initial;
    return state;
  }, {} as T);

  return {
    initial,
    apply(state, fact) {
      let next: T | undefined;
      for (const key of keys) {
        const nextValue = projections[key].apply(state[key], fact);
        if (nextValue !== state[key]) {
          next ??= { ...state };
          next[key] = nextValue;
        }
      }
      return next ?? state;
    },
  };
}
