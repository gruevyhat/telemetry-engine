import { describe, expect, it } from "vitest";
import { createKindRegistry } from "../ledger/registry.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import { createLedger, type Ledger } from "../ledger/ledger.js";
import type { IncidentFrame } from "../generate/frame.js";
import { createRng } from "../rng/index.js";
import type { GameTime } from "../time/index.js";
import { loadPhaseScript } from "./load.js";
import { createPhaseInterpreter, currentStepOf } from "./interpreter.js";
import type { PhaseScript } from "./types.js";

const REFEREE = { kind: "referee", id: "referee" } as const;
const T = (day: number): GameTime => ({ day, slot: "DOCKSIDE" });

// DOCKSIDE -> ... -> ARRIVAL, then cycles back — scripts have no special "end" step (§4: the
// turn is a repeating structure; a script is a closed graph, not a terminating one).
const FIXTURE_SCRIPT: PhaseScript = {
  frame: "trade-fixture",
  start: "dockside-announce",
  steps: [
    { id: "dockside-announce", kind: "announce", next: "dockside-tick" },
    { id: "dockside-tick", kind: "tickClock", next: "comms-window", tick: { clockId: "obligation", delta: -1 } },
    { id: "comms-window", kind: "commsWindow", next: "transit-check" },
    {
      id: "transit-check",
      kind: "check",
      next: "transit-check",
      check: { skillSlot: "pilot", difficulty: 8, onSuccess: "arrival-announce", onFail: "transit-branch" },
    },
    { id: "transit-branch", kind: "branch", next: { retry: "transit-check", abort: "arrival-announce" } },
    { id: "arrival-announce", kind: "announce", next: "dockside-announce" },
  ],
};

function freshLedger(): Ledger {
  return createLedger(createKindRegistry(KINDS_V0));
}

describe("phase interpreter integration [Spec §4]: scripted fixture turn DOCKSIDE -> ARRIVAL", () => {
  it("emits the expected fact sequence for a successful check", () => {
    const ledger = freshLedger();
    const script = loadPhaseScript(FIXTURE_SCRIPT);
    const interpreter = createPhaseInterpreter(ledger, script);

    const r1 = interpreter.advance(T(7), REFEREE);
    expect(r1).toMatchObject({ fromStep: "dockside-announce", toStep: "dockside-tick" });

    const r2 = interpreter.advance(T(7), REFEREE);
    expect(r2).toMatchObject({ fromStep: "dockside-tick", toStep: "comms-window" });
    expect(r2.committed.map((f) => f.kind)).toEqual(["clock.tick", "phase.transition"]);

    const r3 = interpreter.advance(T(7), REFEREE);
    expect(r3).toMatchObject({ fromStep: "comms-window", toStep: "transit-check" });

    const r4 = interpreter.advance(T(7), REFEREE, { checkTotal: 9 });
    expect(r4).toMatchObject({ fromStep: "transit-check", toStep: "arrival-announce" });

    const kinds = ledger.all().map((f) => f.kind);
    expect(kinds).toEqual([
      "phase.transition",
      "clock.tick",
      "phase.transition",
      "phase.transition",
      "phase.transition",
    ]);
    expect(interpreter.currentStep()).toBe("arrival-announce");
  });

  it("a failing check branches to onFail instead of onSuccess", () => {
    const ledger = freshLedger();
    const script = loadPhaseScript(FIXTURE_SCRIPT);
    const interpreter = createPhaseInterpreter(ledger, script);
    interpreter.advance(T(7), REFEREE); // dockside-announce -> dockside-tick
    interpreter.advance(T(7), REFEREE); // dockside-tick -> comms-window
    interpreter.advance(T(7), REFEREE); // comms-window -> transit-check

    const failed = interpreter.advance(T(7), REFEREE, { checkTotal: 2 });
    expect(failed).toMatchObject({ fromStep: "transit-check", toStep: "transit-branch" });

    const branched = interpreter.advance(T(7), REFEREE, { branchKey: "abort" });
    expect(branched).toMatchObject({ fromStep: "transit-branch", toStep: "arrival-announce" });
  });

  it("kill-and-resume mid-step produces the same facts as an uninterrupted run", () => {
    const uninterrupted = freshLedger();
    const uninterruptedScript = loadPhaseScript(FIXTURE_SCRIPT);
    const uninterruptedInterpreter = createPhaseInterpreter(uninterrupted, uninterruptedScript);
    uninterruptedInterpreter.advance(T(7), REFEREE);
    uninterruptedInterpreter.advance(T(7), REFEREE);
    uninterruptedInterpreter.advance(T(7), REFEREE);
    uninterruptedInterpreter.advance(T(7), REFEREE, { checkTotal: 9 });

    const resumed = freshLedger();
    const scriptA = loadPhaseScript(FIXTURE_SCRIPT);
    let interpreter = createPhaseInterpreter(resumed, scriptA);
    interpreter.advance(T(7), REFEREE);
    interpreter.advance(T(7), REFEREE);
    // "kill" — discard the interpreter object entirely, keep only the ledger (as if the
    // process restarted); currentStep() must still be derivable from the ledger alone.
    interpreter = undefined as unknown as ReturnType<typeof createPhaseInterpreter>;
    const scriptB = loadPhaseScript(FIXTURE_SCRIPT);
    const resumedInterpreter = createPhaseInterpreter(resumed, scriptB);
    expect(resumedInterpreter.currentStep()).toBe(currentStepOf(resumed.all(), scriptB));
    resumedInterpreter.advance(T(7), REFEREE);
    resumedInterpreter.advance(T(7), REFEREE, { checkTotal: 9 });

    expect(resumed.all().map((f) => ({ kind: f.kind, payload: f.payload }))).toEqual(
      uninterrupted.all().map((f) => ({ kind: f.kind, payload: f.payload })),
    );
  });
});

const GENERATE_FIXTURE_FRAME: IncidentFrame = {
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
        method: [{ id: "captain-override", factFields: { door: "aft-bay-door", codeClass: "CAPT-OVR", time: "0340" }, surfaceFields: {} }],
        location: [{ id: "aft-bay", factFields: {}, surfaceFields: {} }],
        trace: [{ id: "log-entry", factFields: {}, surfaceFields: {} }],
      },
    },
  ],
  evidenceTrail: [{ id: "camera-log", description: "aft bay camera" }],
  cooldownWeeks: 2,
};

const GENERATE_SCRIPT: PhaseScript = {
  frame: "generate-fixture",
  start: "incident",
  steps: [{ id: "incident", kind: "generate", gen: { frameId: GENERATE_FIXTURE_FRAME.id }, next: "incident" }],
};

describe("phase interpreter integration [Spec §8.2, M1-05]: a generate step fires an incident frame", () => {
  it("commits the twin's cause facts referee-scoped and surfaces a stub-rendered line", () => {
    const ledger = freshLedger();
    const script = loadPhaseScript(GENERATE_SCRIPT);
    const interpreter = createPhaseInterpreter(ledger, script, { rng: createRng("seed"), deck: [GENERATE_FIXTURE_FRAME] });

    const result = interpreter.advance(T(7), REFEREE);

    const causeFact = ledger.all().find((f) => f.kind === "lock.cycled");
    expect(causeFact).toBeDefined();
    expect(causeFact!.visibility).toEqual({ level: "referee" });
    expect(causeFact!.payload.codeClass).toBe("CAPT-OVR");
    expect(result.rendered).toContain("off-schedule");
  });

  it("throws a clear error if a generate step fires with no rng/deck wired in", () => {
    const ledger = freshLedger();
    const script = loadPhaseScript(GENERATE_SCRIPT);
    const interpreter = createPhaseInterpreter(ledger, script);
    expect(() => interpreter.advance(T(7), REFEREE)).toThrow(/rng.*deck|deck.*rng/i);
  });
});

const ORACLE_SCRIPT: PhaseScript = {
  frame: "oracle-fixture",
  start: "ask-step",
  steps: [{ id: "ask-step", kind: "oracle", oracle: { question: "Is anyone watching the door?", likelihood: "even" }, next: "ask-step" }],
};

describe("phase interpreter integration [Spec §8.4, M1-06]: an oracle step commits oracle.answered", () => {
  it("commits an oracle.answered fact table-scoped, matching the requested question/likelihood", () => {
    const ledger = freshLedger();
    const script = loadPhaseScript(ORACLE_SCRIPT);
    const interpreter = createPhaseInterpreter(ledger, script, { rng: createRng("seed"), deck: [] });

    interpreter.advance(T(7), REFEREE);

    const answered = ledger.all().find((f) => f.kind === "oracle.answered");
    expect(answered).toBeDefined();
    expect(answered!.visibility).toEqual({ level: "table" });
    expect(answered!.payload.question).toBe("Is anyone watching the door?");
    expect(answered!.payload.likelihood).toBe("even");
    expect(["YES", "NO"]).toContain(answered!.payload.answer);
  });

  it("throws a clear error if an oracle step fires with no rng wired in", () => {
    const ledger = freshLedger();
    const script = loadPhaseScript(ORACLE_SCRIPT);
    const interpreter = createPhaseInterpreter(ledger, script);
    expect(() => interpreter.advance(T(7), REFEREE)).toThrow(/rng/i);
  });
});
