import type { Projection } from "../ledger/derive.js";
import type { Fact } from "../ledger/types.js";

/**
 * [Spec §5, INV-7] "No clock changes except via committed clock.tick facts." A clock's derived
 * value is exactly the sum of its clock.tick deltas; label/max/direction/triggers (the rest of
 * the Clock shape) come from frame content, not from anything computable off the fact stream.
 */
export type ClockValues = Readonly<Record<string, number>>;

export const clocksProjection: Projection<ClockValues> = {
  initial: {},
  apply(state: ClockValues, fact: Fact): ClockValues {
    if (fact.kind !== "clock.tick") {
      return state;
    }
    const { clockId, delta } = fact.payload;
    if (typeof clockId !== "string" || typeof delta !== "number") {
      return state;
    }
    return { ...state, [clockId]: (state[clockId] ?? 0) + delta };
  },
};
