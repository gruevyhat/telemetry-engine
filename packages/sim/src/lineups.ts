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
  L4: [
    { actorId: "pc:solo", disposition: "diligent", isPC: true },
    { actorId: "npc:crew-a", disposition: "naive", isPC: false },
    { actorId: "npc:crew-b", disposition: "naive", isPC: false },
    { actorId: "npc:crew-c", disposition: "naive", isPC: false },
  ],
};
