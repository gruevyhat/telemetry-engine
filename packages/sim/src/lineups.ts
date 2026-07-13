import type { Disposition } from "../../engine/src/npc/policy.js";

export interface LineupMember {
  readonly actorId: string;
  readonly disposition: Disposition;
  readonly isPC: boolean;
}

export type LineupName = "L1" | "L2" | "L4";

/**
 * [sim-bot-policies.md §3, M1-12] L3 ("witch hunt") and L5 ("all dirty") are also named in the
 * design doc, but this card's own integration bullet only requires L1/L2/L4 to complete headless
 * -- L3's stress case and L5's agenda-odds=1.0 stress case both need M2 machinery (agendas,
 * confrontation/vote) this milestone doesn't build, so only the three M1-reachable lineups are
 * defined here. L2's "selfish@odds" member is seated as plain `selfish`; the "@odds" qualifier is
 * an M2 agenda-odds parameter with nothing in M1 for it to modify yet.
 */
/** [M1-12, red] Not yet populated. */
export const LINEUPS: Readonly<Record<LineupName, readonly LineupMember[]>> = {
  L1: [],
  L2: [],
  L4: [],
};
