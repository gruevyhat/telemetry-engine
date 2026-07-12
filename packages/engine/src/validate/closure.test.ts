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

describe("IMPLIES_V0 encodes camera.looped and cargo.diverted [Spec §8.2, fact-kinds-v0.md §3]", () => {
  // Both are on the Skim's closure path (fact-kinds-v0.md §3: F11 lock.cycled, F12
  // camera.looped, F13 cargo.diverted) and the closure computation walks every visible fact's
  // kind, so both need encoding here even though — unlike lock.cycled's F11 case — every
  // alternative in their clauses is sameActor-correlated: a self-consistency check (does the
  // bundle's own actor also have this other fact?), not an "any actor" enumeration signal.
  // What that self-consistency check means for a *candidate* actor under test is M1-05's
  // question (it needs the incident frame's context to know which role an unconstrained match
  // plays) — this task only has to get the data encoding right, not resolve that seam.
  it("camera.looped's clause offers a comms/computer-station alternative and a remote-access alternative, both sameActor", () => {
    const clause = IMPLIES_V0["camera.looped"]![0]!;
    expect(clause).toHaveLength(2);
    expect(clause.every((pattern) => (pattern.correlations ?? []).some((c) => c.kind === "sameActor"))).toBe(true);
    expect(clause[0]!.fieldOneOf).toEqual({ station: ["comms", "computer"] });
    expect(clause[1]!.fieldOneOf).toEqual({ codeClass: ["remote"] });
  });

  it("cargo.diverted's rule is an AND of two clauses: an unconstrained lock.cycled gate, then a sameActor OR", () => {
    const rule = IMPLIES_V0["cargo.diverted"]!;
    expect(rule).toHaveLength(2);
    expect(rule[0]![0]!.kind).toBe("lock.cycled");
    expect((rule[0]![0]!.correlations ?? []).some((c) => c.kind === "sameActor")).toBe(false);
    expect(rule[1]).toHaveLength(2);
    expect(rule[1]!.every((pattern) => (pattern.correlations ?? []).some((c) => c.kind === "sameActor"))).toBe(true);
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
