import { describe, expect, it } from "vitest";
import { createKindRegistry } from "../ledger/registry.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import { createLedger } from "../ledger/ledger.js";
import type { Fact } from "../ledger/types.js";
import type { GameTime } from "../time/index.js";
import { assembleInterrogationAnswer, commitInterrogationAnswer, factsOwnedBy, loadNpcDef, truthTierFor } from "./interrogation.js";

const T: GameTime = { day: 14, slot: "DOCKSIDE" };
const KESSLER = { kind: "npc", id: "npc:kessler" } as const;

let nextId = 0;
function ownFact(kind: string, payload: Record<string, unknown>): Fact {
  nextId += 1;
  return { id: `f${nextId}`, wall: 0, t: T, kind, actor: KESSLER, payload, visibility: { level: "referee" } };
}

describe("truthTierFor -- the interrogation ladder [Spec §12, sim-bot-policies.md §2]", () => {
  it("maps Effect to the exact Spec §12 ladder: E<0 evasion, 0-1 partial, 2-3 true-with-tell, 4+ true", () => {
    expect(truthTierFor(-5)).toBe("evasion");
    expect(truthTierFor(-1)).toBe("evasion");
    expect(truthTierFor(0)).toBe("partial");
    expect(truthTierFor(1)).toBe("partial");
    expect(truthTierFor(2)).toBe("trueWithTell");
    expect(truthTierFor(3)).toBe("trueWithTell");
    expect(truthTierFor(4)).toBe("true");
    expect(truthTierFor(10)).toBe("true");
  });
});

describe("factsOwnedBy -- an NPC may read its own facts regardless of visibility level", () => {
  it("returns facts whose actor is this npc, including referee-scoped ones, without exposing anyone else's", () => {
    const own = ownFact("cargo.diverted", { lotId: "L1", qty: 2, channel: "fence" });
    const other: Fact = { id: "other", wall: 0, t: T, kind: "cargo.diverted", actor: { kind: "npc", id: "npc:someone-else" }, payload: {}, visibility: { level: "referee" } };
    expect(factsOwnedBy([own, other], "npc:kessler")).toEqual([own]);
  });
});

describe("assembleInterrogationAnswer -- never invents, only selects among the NPC's own facts", () => {
  const npc = loadNpcDef({ id: "npc:kessler", disposition: "loyalist", tells: ["glances at the door before answering"] });
  const facts = [ownFact("presence.declared", { actor: "npc:kessler", station: "comms", day: 14, slot: "DOCKSIDE" }), ownFact("cargo.diverted", { lotId: "L1", qty: 2, channel: "fence" })];

  it("evasion (E<0): surfaces no facts at all", () => {
    const answer = assembleInterrogationAnswer(npc, "the missing crates", facts, -1);
    expect(answer.tier).toBe("evasion");
    expect(answer.visibleFactIds).toEqual([]);
    expect(answer.tell).toBeUndefined();
  });

  it("partial (0-1): true facts with a material omission -- withholds at least one", () => {
    const answer = assembleInterrogationAnswer(npc, "the missing crates", facts, 0);
    expect(answer.tier).toBe("partial");
    expect(answer.visibleFactIds.length).toBeLessThan(facts.length);
    expect(answer.tell).toBeUndefined();
  });

  it("true-with-tell (2-3): all facts, plus exactly one tells[] string appended", () => {
    const answer = assembleInterrogationAnswer(npc, "the missing crates", facts, 3);
    expect(answer.tier).toBe("trueWithTell");
    expect(answer.visibleFactIds).toEqual(facts.map((f) => f.id));
    expect(answer.tell).toBe("glances at the door before answering");
  });

  it("true (4+): all facts, no tell (the tell is specific to tier 3, not every high-Effect tier)", () => {
    const answer = assembleInterrogationAnswer(npc, "the missing crates", facts, 5);
    expect(answer.tier).toBe("true");
    expect(answer.visibleFactIds).toEqual(facts.map((f) => f.id));
    expect(answer.tell).toBeUndefined();
  });
});

describe("commitInterrogationAnswer -- npc.statement (table) + npc.truthTierAssigned (referee), linked by causes", () => {
  it("commits the split-visibility fact pair per fact-kinds-v0.md §3's rule", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const npc = loadNpcDef({ id: "npc:kessler", disposition: "loyalist", tells: [] });
    const answer = assembleInterrogationAnswer(npc, "the missing crates", [], 2);

    const { statement, tierAssignment } = commitInterrogationAnswer(ledger, answer, T);

    expect(statement.kind).toBe("npc.statement");
    expect(statement.visibility).toEqual({ level: "table" });
    expect(tierAssignment.kind).toBe("npc.truthTierAssigned");
    expect(tierAssignment.visibility).toEqual({ level: "referee" });
    expect(tierAssignment.payload.tier).toBe("trueWithTell");
    expect(tierAssignment.causes).toEqual([statement.id]);
  });
});

describe("loadNpcDef -- NPC def loading [Spec §12]", () => {
  it("loads a well-formed def", () => {
    const npc = loadNpcDef({ id: "npc:kessler", disposition: "loyalist", tells: ["a nervous tell"] });
    expect(npc).toEqual({ id: "npc:kessler", disposition: "loyalist", tells: ["a nervous tell"] });
  });

  it("rejects a def missing a required field", () => {
    expect(() => loadNpcDef({ disposition: "loyalist", tells: [] })).toThrow();
  });
});
