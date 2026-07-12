import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createRng } from "../rng/index.js";
import { IMPLIES_V0, consistentActors } from "../validate/closure.js";
import type { Fact } from "../ledger/types.js";
import type { GameTime } from "../time/index.js";
import {
  checkIncidentAmbiguity,
  eligibleFrames,
  fireFrame,
  initialCooldownState,
  recordFired,
  type IncidentFrame,
} from "./frame.js";

const T: GameTime = { day: 14, slot: "DOCKSIDE" };

/**
 * A minimal, code-owned test fixture deck (not the real incident-content format — M1-11a owns
 * that). Two possible "lock event" twin outcomes, each keyed to a codeClass with >=2 roster
 * holders in ROSTER_FACTS below, so the ambiguity property test holds regardless of which one a
 * given RNG seed draws.
 */
const FIXTURE_FRAME: IncidentFrame = {
  id: "fixture:bay-lock-cycle",
  pillar: "trade",
  surfaceTables: {
    actor: [{ id: "npc:kessler", factFields: {}, surfaceFields: {} }],
    motive: [{ id: "unexplained", factFields: {}, surfaceFields: {} }],
    method: [{ id: "off-schedule-cycle", factFields: {}, surfaceFields: { detail: "off-schedule" } }],
    location: [{ id: "aft-bay", factFields: {}, surfaceFields: {} }],
    trace: [{ id: "log-entry", factFields: {}, surfaceFields: {} }],
  },
  innocentTwin: [
    {
      kind: "lock.cycled",
      tables: {
        actor: [{ id: "npc:kessler", factFields: {}, surfaceFields: {} }],
        motive: [{ id: "routine", factFields: {}, surfaceFields: {} }],
        method: [
          { id: "captain-override", factFields: { door: "aft-bay-door", codeClass: "CAPT-OVR", time: "0340" }, surfaceFields: {} },
          { id: "senior-crew-override", factFields: { door: "aft-bay-door", codeClass: "SR-CREW-OVR", time: "0340" }, surfaceFields: {} },
        ],
        location: [{ id: "aft-bay", factFields: {}, surfaceFields: {} }],
        trace: [{ id: "log-entry", factFields: {}, surfaceFields: {} }],
      },
    },
  ],
  evidenceTrail: [{ id: "camera-log", description: "aft bay camera" }],
  cooldownWeeks: 2,
};

let nextId = 0;
function grantFact(actorId: string, codeClass: string): Fact {
  nextId += 1;
  return {
    id: `f${nextId}`,
    wall: 0,
    t: T,
    kind: "access.granted",
    actor: { kind: actorId.startsWith("npc:") ? "npc" : "pc", id: actorId },
    payload: { actor: actorId, codeClass, grantor: "referee" },
    visibility: { level: "referee" },
  };
}

const ROSTER_FACTS: readonly Fact[] = [
  grantFact("pc:captain", "CAPT-OVR"),
  grantFact("pc:seniorcrew", "CAPT-OVR"),
  grantFact("pc:zhan", "SR-CREW-OVR"),
  grantFact("npc:kessler", "SR-CREW-OVR"),
];

describe("fireFrame — twin path only [Spec §8.2, claimant hook stubbed]", () => {
  it("produces a surface descriptor and referee-scoped cause proposals from the innocent twin", () => {
    const rng = createRng("seed-1");
    const fired = fireFrame(FIXTURE_FRAME, T, rng);

    expect(fired.frameId).toBe(FIXTURE_FRAME.id);
    expect(fired.surface.fields.detail).toBe("off-schedule");
    expect(fired.causeProposals).toHaveLength(1);
    expect(fired.causeProposals[0]!.kind).toBe("lock.cycled");
    expect(fired.causeProposals[0]!.actor).toEqual({ kind: "npc", id: "npc:kessler" });
    expect(fired.causeProposals[0]!.payload.door).toBe("aft-bay-door");
  });

  it("is deterministic for a given seed (replay: same seed, same day/slot -> identical fire)", () => {
    const first = fireFrame(FIXTURE_FRAME, T, createRng("seed-replay"));
    const second = fireFrame(FIXTURE_FRAME, T, createRng("seed-replay"));
    expect(second).toEqual(first);
  });
});

describe("INV-10 property: a twin-fired incident always has >=2 consistent actors, never a unique one", () => {
  it("holds across random seeds (the fixture's two possible codeClasses both have >=2 roster holders)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (seed) => {
        const rng = createRng(seed);
        const fired = fireFrame(FIXTURE_FRAME, T, rng);
        const causeFact: Fact = { id: "pending", wall: 0, ...fired.causeProposals[0]!, visibility: { level: "referee" } };
        const actors = consistentActors(IMPLIES_V0["lock.cycled"]!, causeFact, [...ROSTER_FACTS, causeFact]);
        expect(actors.size).toBeGreaterThanOrEqual(2);
      }),
    );
  });
});

describe("checkIncidentAmbiguity [Spec §9 pass 5, INV-10]", () => {
  it("passes when the cause fact's implies closure yields >=2 consistent actors", () => {
    const causeFact: Fact = {
      id: "cause",
      wall: 0,
      t: T,
      kind: "lock.cycled",
      actor: { kind: "npc", id: "npc:kessler" },
      payload: { door: "aft-bay-door", codeClass: "CAPT-OVR", time: "0340" },
      visibility: { level: "referee" },
    };
    const result = checkIncidentAmbiguity(causeFact, IMPLIES_V0["lock.cycled"]!, [...ROSTER_FACTS, causeFact]);
    expect(result).toBeUndefined();
  });

  it("fails when the cause fact's implies closure collapses to a single actor (a broken fixture)", () => {
    const causeFact: Fact = {
      id: "cause",
      wall: 0,
      t: T,
      kind: "lock.cycled",
      actor: { kind: "npc", id: "npc:kessler" },
      payload: { door: "aft-bay-door", codeClass: "SOLO-KEY", time: "0340" },
      visibility: { level: "referee" },
    };
    const result = checkIncidentAmbiguity(causeFact, IMPLIES_V0["lock.cycled"]!, [grantFact("npc:kessler", "SOLO-KEY"), causeFact]);
    expect(result).toMatchObject({ pass: "ambiguity" });
  });
});

describe("cooldowns and recurrence [Spec §8.3]", () => {
  it("a frame is eligible before it has ever fired", () => {
    const eligible = eligibleFrames([FIXTURE_FRAME], initialCooldownState, 1);
    expect(eligible.map((e) => e.frame.id)).toEqual([FIXTURE_FRAME.id]);
  });

  it("recordFired puts the frame on cooldown for cooldownWeeks and increments its recurrence count", () => {
    const afterFirstFire = recordFired(initialCooldownState, FIXTURE_FRAME, 1);
    expect(afterFirstFire.fireCount[FIXTURE_FRAME.id]).toBe(1);

    const stillCoolingPool = eligibleFrames([FIXTURE_FRAME], afterFirstFire, 2, /* minPoolSize */ 0);
    expect(stillCoolingPool).toEqual([]);

    const readyAgainPool = eligibleFrames([FIXTURE_FRAME], afterFirstFire, 3, /* minPoolSize */ 0);
    expect(readyAgainPool.map((e) => e.frame.id)).toEqual([FIXTURE_FRAME.id]);
  });

  it("weight-decays a cooling frame back into the pool when it would otherwise thin out completely", () => {
    const afterFirstFire = recordFired(initialCooldownState, FIXTURE_FRAME, 1);
    const pool = eligibleFrames([FIXTURE_FRAME], afterFirstFire, 2, /* minPoolSize */ 1);
    expect(pool).toHaveLength(1);
    expect(pool[0]!.weight).toBeLessThan(1);
  });
});
