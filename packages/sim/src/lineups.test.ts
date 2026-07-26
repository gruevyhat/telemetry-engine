import { describe, expect, it } from "vitest";
import { LINEUPS } from "./lineups.js";

describe("LINEUPS [sim-bot-policies.md §3, M1-12]", () => {
  it("L1 'book club' is 4x naive", () => {
    expect(LINEUPS.L1.map((m) => m.disposition)).toEqual(["naive", "naive", "naive", "naive"]);
  });

  it("L2 'reference' is captain-loyalist, diligent, naive, selfish", () => {
    expect(LINEUPS.L2.map((m) => m.disposition)).toEqual(["loyalist", "diligent", "naive", "selfish"]);
  });

  it("L4 'quiet ship' is 1 diligent PC-bot + 3 NPC crew", () => {
    expect(LINEUPS.L4.filter((m) => m.isPC)).toHaveLength(1);
    expect(LINEUPS.L4.find((m) => m.isPC)!.disposition).toBe("diligent");
    expect(LINEUPS.L4.filter((m) => !m.isPC)).toHaveLength(3);
  });

  it("every lineup seats exactly 4 actors with unique ids", () => {
    for (const members of Object.values(LINEUPS)) {
      expect(members).toHaveLength(4);
      expect(new Set(members.map((m) => m.actorId)).size).toBe(4);
    }
  });

  it("adds the L3 witch-hunt and L5 all-dirty stress lineups", () => {
    expect(LINEUPS.L3.map((m) => m.disposition)).toEqual(["paranoid", "paranoid", "naive", "naive"]);
    expect(LINEUPS.L5).toEqual(LINEUPS.L2);
  });
});
