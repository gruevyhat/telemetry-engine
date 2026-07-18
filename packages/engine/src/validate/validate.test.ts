import { describe, expect, it } from "vitest";
import { createKindRegistry } from "../ledger/registry.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import type { AppendInput } from "../ledger/ledger.js";
import type { Fact } from "../ledger/types.js";
import type { GameTime } from "../time/index.js";
import { validate } from "./validate.js";

const REGISTRY = createKindRegistry(KINDS_V0);
const REFEREE = { kind: "referee", id: "referee" } as const;
const ZHAN = { kind: "pc", id: "pc:zhan" } as const;
const T: GameTime = { day: 7, slot: "DOCKSIDE" };

let nextId = 0;
function committed(input: AppendInput): Fact {
  nextId += 1;
  return { id: `f${nextId}`, wall: 0, t: input.t, kind: input.kind, actor: input.actor, payload: input.payload, visibility: { level: "public" } };
}

describe("validate — pass 1 schema [Spec §9]", () => {
  it("rejects a payload that fails the kind's registered schema", () => {
    const result = validate([{ t: T, kind: "sale.settled", actor: REFEREE, payload: { lotId: "L1" } }], [], REGISTRY);
    expect(result.ok).toBe(false);
    expect(result.failures[0]).toMatchObject({ pass: "schema" });
  });
});

describe("validate — pass 2 referential integrity [Spec §9]", () => {
  it("rejects an npc actor that was never introduced via npc.hired (dangling reference)", () => {
    const result = validate(
      [{ t: T, kind: "npc.statement", actor: { kind: "npc", id: "npc:ghost" }, payload: { npcId: "npc:ghost", topic: "weather" } }],
      [],
      REGISTRY,
    );
    expect(result.ok).toBe(false);
    expect(result.failures[0]).toMatchObject({ pass: "referential" });
  });

  it("accepts an npc actor introduced by a prior npc.hired fact", () => {
    const hired = committed({ t: T, kind: "npc.hired", actor: REFEREE, payload: { npcId: "npc:kessler", role: "engineer", wage: 100 } });
    const result = validate(
      [{ t: T, kind: "npc.statement", actor: { kind: "npc", id: "npc:kessler" }, payload: { npcId: "npc:kessler", topic: "weather" } }],
      [hired],
      REGISTRY,
    );
    expect(result.ok).toBe(true);
  });

  it("never requires pc/world/referee actors to be introduced first (campaign setup isn't fact-modeled in v0)", () => {
    const result = validate([{ t: T, kind: "cargo.loaded", actor: ZHAN, payload: { lotId: "L1", tons: 20, manifestId: "M1", bay: "aft" } }], [], REGISTRY);
    expect(result.ok).toBe(true);
  });
});

describe("validate — pass 3 reachability [Spec §9, §16]", () => {
  it("rejects an action at a bay when the actor is explicitly declared elsewhere for that beat", () => {
    const declared = committed({
      t: T,
      kind: "presence.declared",
      actor: ZHAN,
      payload: { actor: "pc:zhan", station: "bridge", day: T.day, slot: T.slot },
    });
    const result = validate(
      [{ t: T, kind: "cargo.loaded", actor: ZHAN, payload: { lotId: "L1", tons: 20, manifestId: "M1", bay: "aft" } }],
      [declared],
      REGISTRY,
    );
    expect(result.ok).toBe(false);
    expect(result.failures[0]).toMatchObject({ pass: "reachability" });
  });

  it("accepts the action when no declaration contradicts it (absence resolves to berth/common, not unknown)", () => {
    const result = validate(
      [{ t: T, kind: "cargo.loaded", actor: ZHAN, payload: { lotId: "L1", tons: 20, manifestId: "M1", bay: "aft" } }],
      [],
      REGISTRY,
    );
    expect(result.ok).toBe(true);
  });
});

describe("validate — pass 4 timeline [Spec §9]", () => {
  it("rejects a proposal whose day is earlier than the latest already-committed fact (no time travel backward)", () => {
    const later = committed({ t: { day: 20, slot: "ARRIVAL" }, kind: "sale.settled", actor: REFEREE, payload: { lotId: "L1", amount: 100, countDelivered: 1, buyer: "b" } });
    const result = validate(
      [{ t: { day: 10, slot: "DOCKSIDE" }, kind: "cargo.loaded", actor: ZHAN, payload: { lotId: "L2", tons: 5, manifestId: "M2", bay: "aft" } }],
      [later],
      REGISTRY,
    );
    expect(result.ok).toBe(false);
    expect(result.failures[0]).toMatchObject({ pass: "timeline" });
  });

  it("accepts a same-day proposal (most of a beat shares one day — equality is not a backward jump)", () => {
    const earlier = committed({ t: T, kind: "sale.settled", actor: REFEREE, payload: { lotId: "L1", amount: 100, countDelivered: 1, buyer: "b" } });
    const result = validate(
      [{ t: T, kind: "cargo.loaded", actor: ZHAN, payload: { lotId: "L2", tons: 5, manifestId: "M2", bay: "aft" } }],
      [earlier],
      REGISTRY,
    );
    expect(result.ok).toBe(true);
  });
});

describe("validate — pure function, does not touch the ledger [INV-6]", () => {
  it("accepts a bundle of multiple facts, validating each against the ledger plus the bundle's own earlier facts", () => {
    const result = validate(
      [
        { t: T, kind: "npc.hired", actor: REFEREE, payload: { npcId: "npc:kessler", role: "engineer", wage: 100 } },
        { t: T, kind: "npc.statement", actor: { kind: "npc", id: "npc:kessler" }, payload: { npcId: "npc:kessler", topic: "weather" } },
      ],
      [],
      REGISTRY,
    );
    expect(result.ok).toBe(true);
  });
});
