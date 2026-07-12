import type { Projection } from "../ledger/derive.js";
import type { Fact } from "../ledger/types.js";

/**
 * [fact-kinds-v0.md §2 position model, Spec §24 item 1] "Every PC/NPC has exactly one
 * presence.declared per (day, slot) aboard ship; absence of a declaration means 'berth/common,'
 * never 'unknown.' This closes the reachability check's domain." No dedicated Spec §1 module
 * covers position/presence, so this is a new small directory (same reasoning as M0-01's
 * plugin-stub: a well-justified addition, not a new fact kind).
 */
export type PresenceLocation = { kind: "station"; station: string } | { kind: "hex"; hex: string } | { kind: "berth" };

export interface PresenceState {
  readonly declarations: Readonly<Record<string, PresenceLocation>>;
}

function declarationKey(actor: string, day: number, slot: string): string {
  return `${actor}|${day}|${slot}`;
}

export const presenceProjection: Projection<PresenceState> = {
  initial: { declarations: {} },
  apply(state: PresenceState, fact: Fact): PresenceState {
    if (fact.kind !== "presence.declared") {
      return state;
    }
    const { actor, station, hex, day, slot } = fact.payload;
    if (typeof actor !== "string" || typeof day !== "number" || typeof slot !== "string") {
      return state;
    }
    const location: PresenceLocation =
      typeof station === "string" ? { kind: "station", station } : typeof hex === "string" ? { kind: "hex", hex } : { kind: "berth" };
    return {
      declarations: { ...state.declarations, [declarationKey(actor, day, slot)]: location },
    };
  },
};

/** Absent declaration resolves to berth/common — never "unknown" (closes the reachability domain). */
export function presenceOf(state: PresenceState, actor: string, day: number, slot: string): PresenceLocation {
  return state.declarations[declarationKey(actor, day, slot)] ?? { kind: "berth" };
}
