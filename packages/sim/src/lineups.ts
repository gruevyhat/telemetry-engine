import type { Disposition } from "../../engine/src/npc/policy.js";

export interface LineupMember {
  readonly actorId: string;
  readonly disposition: Disposition;
  readonly isPC: boolean;
}

export type LineupName = "L1" | "L2" | "L3" | "L4" | "L5";

/** [sim-bot-policies.md §3] All five standard lineups; L5 fixes agenda odds at 1 below. */
export const LINEUPS: Readonly<Record<LineupName, readonly LineupMember[]>> = {
  L1: [
    { actorId: "pc:crew-a", disposition: "naive", isPC: true },
    { actorId: "pc:crew-b", disposition: "naive", isPC: true },
    { actorId: "pc:crew-c", disposition: "naive", isPC: true },
    { actorId: "pc:crew-d", disposition: "naive", isPC: true },
  ],
  L2: [
    { actorId: "pc:captain", disposition: "loyalist", isPC: true },
    { actorId: "pc:diligent-crew", disposition: "diligent", isPC: true },
    { actorId: "pc:naive-crew", disposition: "naive", isPC: true },
    { actorId: "pc:selfish-crew", disposition: "selfish", isPC: true },
  ],
  L3: [
    { actorId: "pc:paranoid-a", disposition: "paranoid", isPC: true },
    { actorId: "pc:paranoid-b", disposition: "paranoid", isPC: true },
    { actorId: "pc:naive-a", disposition: "naive", isPC: true },
    { actorId: "pc:naive-b", disposition: "naive", isPC: true },
  ],
  L4: [
    { actorId: "pc:solo", disposition: "diligent", isPC: true },
    { actorId: "npc:crew-a", disposition: "naive", isPC: false },
    { actorId: "npc:crew-b", disposition: "naive", isPC: false },
    { actorId: "npc:crew-c", disposition: "naive", isPC: false },
  ],
  L5: [
    { actorId: "pc:captain", disposition: "loyalist", isPC: true },
    { actorId: "pc:diligent-crew", disposition: "diligent", isPC: true },
    { actorId: "pc:naive-crew", disposition: "naive", isPC: true },
    { actorId: "pc:selfish-crew", disposition: "selfish", isPC: true },
  ],
};

export const LINEUP_AGENDA_ODDS: Readonly<Record<LineupName, number>> = { L1: 0, L2: 0.28, L3: 0.28, L4: 0.28, L5: 1 };
