import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Fact } from "../ledger/types.js";
import { consistentActors, IMPLIES_V0, type ImpliesRule } from "./closure.js";

let nextId = 0;
function fact(kind: string, actorId: string, payload: Record<string, unknown>, day = 7): Fact {
  nextId += 1;
  return {
    id: `f${nextId}`,
    wall: 0,
    t: { day, slot: "DOCKSIDE" },
    kind,
    actor: { kind: actorId === "referee" ? "referee" : actorId.startsWith("npc:") ? "npc" : "pc", id: actorId },
    payload,
    visibility: { level: "referee" },
  };
}

describe("consistentActors — hand-computed Skim closure [fact-kinds-v0.md §3, Appendix A]", () => {
  it("F11 lock.cycled(door, codeClass:CAPT-OVR) implies access.granted(codeClass) -> exactly 3 live explanations", () => {
    const f11 = fact("lock.cycled", "npc:kessler", { door: "aft-bay-door", codeClass: "CAPT-OVR", time: "0340" });
    const visible: readonly Fact[] = [
      f11,
      fact("access.granted", "pc:captain", { actor: "pc:captain", codeClass: "CAPT-OVR", grantor: "referee" }),
      fact("access.granted", "pc:seniorcrew", { actor: "pc:seniorcrew", codeClass: "CAPT-OVR", grantor: "referee" }),
      fact("access.granted", "npc:kessler", { actor: "npc:kessler", codeClass: "CAPT-OVR", grantor: "referee" }),
      // A different codeClass must not leak in as a fourth "consistent" actor.
      fact("access.granted", "pc:zhan", { actor: "pc:zhan", codeClass: "CREW-STD", grantor: "referee" }),
    ];

    const actors = consistentActors(IMPLIES_V0["lock.cycled"]!, f11, visible);
    expect(actors).toEqual(new Set(["pc:captain", "pc:seniorcrew", "npc:kessler"]));
  });

  it("a unique codeClass holder collapses to one consistent actor (the ambiguity-violation shape M1-05 will reject)", () => {
    const f11 = fact("lock.cycled", "npc:kessler", { door: "aft-bay-door", codeClass: "SOLO-KEY", time: "0340" });
    const visible: readonly Fact[] = [f11, fact("access.granted", "npc:kessler", { actor: "npc:kessler", codeClass: "SOLO-KEY", grantor: "referee" })];

    const actors = consistentActors(IMPLIES_V0["lock.cycled"]!, f11, visible);
    expect(actors).toEqual(new Set(["npc:kessler"]));
  });
});

describe("consistentActors — camera.looped and cargo.diverted [Spec §8.2, fact-kinds-v0.md §3]", () => {
  it("camera.looped: a station match within the time window contributes that actor as consistent", () => {
    const f12 = fact("camera.looped", "npc:kessler", { camera: "aft-bay-cam", from: "0330", to: "0335" }, 7);
    const visible: readonly Fact[] = [
      f12,
      fact("presence.declared", "npc:kessler", { actor: "npc:kessler", station: "comms", day: 7, slot: "DOCKSIDE" }, 7),
    ];
    const actors = consistentActors(IMPLIES_V0["camera.looped"]!, f12, visible);
    expect(actors).toEqual(new Set(["npc:kessler"]));
  });

  it("camera.looped: a presence declared at a non-comms/computer station does not count", () => {
    const f12 = fact("camera.looped", "npc:kessler", { camera: "aft-bay-cam", from: "0330", to: "0335" }, 7);
    const visible: readonly Fact[] = [f12, fact("presence.declared", "npc:kessler", { actor: "npc:kessler", station: "galley", day: 7, slot: "DOCKSIDE" }, 7)];
    const actors = consistentActors(IMPLIES_V0["camera.looped"]!, f12, visible);
    expect(actors).toEqual(new Set());
  });

  it("cargo.diverted: an access.granted(remote) fact contributes that actor as consistent", () => {
    const f13 = fact("cargo.diverted", "npc:kessler", { lotId: "L1", qty: 2, channel: "fence" }, 7);
    const visible: readonly Fact[] = [f13, fact("access.granted", "npc:kessler", { actor: "npc:kessler", codeClass: "remote", grantor: "referee" }, 7)];
    const actors = consistentActors(IMPLIES_V0["cargo.diverted"]!, f13, visible);
    expect(actors).toEqual(new Set(["npc:kessler"]));
  });
});

describe("consistentActors — monotone and terminates on random fact sets", () => {
  const factArb = fc
    .record({
      kind: fc.constantFrom("access.granted", "presence.declared", "lock.cycled", "unrelated.kind"),
      actorId: fc.constantFrom("pc:a", "pc:b", "npc:c"),
      codeClass: fc.constantFrom("CAPT-OVR", "OTHER"),
    })
    .map(({ kind, actorId, codeClass }) => fact(kind, actorId, { actor: actorId, codeClass, door: "d", time: "t" }));

  it("adding more visible facts never shrinks the consistent-actor set (monotone)", () => {
    fc.assert(
      fc.property(fc.array(factArb, { minLength: 0, maxLength: 10 }), factArb, (baseFacts, extra) => {
        const cause = fact("lock.cycled", "npc:c", { door: "d", codeClass: "CAPT-OVR", time: "t" });
        const before = consistentActors(IMPLIES_V0["lock.cycled"]!, cause, [cause, ...baseFacts]);
        const after = consistentActors(IMPLIES_V0["lock.cycled"]!, cause, [cause, ...baseFacts, extra]);
        for (const actorId of before) {
          expect(after.has(actorId)).toBe(true);
        }
      }),
    );
  });

  it("terminates (completes synchronously) over a large random fact set", () => {
    const facts = Array.from({ length: 500 }, (_, i) => fact("access.granted", `pc:${i}`, { actor: `pc:${i}`, codeClass: "CAPT-OVR", grantor: "referee" }));
    const cause = fact("lock.cycled", "npc:kessler", { door: "d", codeClass: "CAPT-OVR", time: "t" });
    const actors = consistentActors(IMPLIES_V0["lock.cycled"]!, cause, [cause, ...facts]);
    expect(actors.size).toBe(500);
  });
});

describe("IMPLIES_V0 — mechanical transcription of fact-kinds-v0.md §2's implies column", () => {
  it("has an entry for every catalog kind that carries an implies annotation", () => {
    const withImplies: ImpliesRule = IMPLIES_V0["cargo.loaded"]!;
    expect(withImplies.length).toBeGreaterThan(0);
    expect(IMPLIES_V0["cargo.unloaded"]).toBeDefined();
    expect(IMPLIES_V0["cargo.diverted"]).toBeDefined();
    expect(IMPLIES_V0["lock.cycled"]).toBeDefined();
    expect(IMPLIES_V0["camera.looped"]).toBeDefined();
  });
});
