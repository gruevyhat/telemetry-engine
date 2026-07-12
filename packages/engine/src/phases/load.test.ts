import { describe, expect, it } from "vitest";
import { loadPhaseScript } from "./load.js";
import type { PhaseScript } from "./types.js";

describe("loadPhaseScript [Spec §4: exactly one active step]", () => {
  it("accepts a well-formed script", () => {
    const script: PhaseScript = {
      frame: "trade",
      start: "a",
      steps: [
        { id: "a", kind: "announce", next: "b" },
        { id: "b", kind: "announce", next: "a" },
      ],
    };
    const loaded = loadPhaseScript(script);
    expect(loaded.start).toBe("a");
    expect(loaded.stepsById.size).toBe(2);
  });

  it("rejects a script whose start step doesn't exist", () => {
    const script: PhaseScript = {
      frame: "trade",
      start: "nowhere",
      steps: [{ id: "a", kind: "announce", next: "a" }],
    };
    expect(() => loadPhaseScript(script)).toThrow(/unknown start step/);
  });

  it("rejects a script with a dangling next target", () => {
    const script: PhaseScript = {
      frame: "trade",
      start: "a",
      steps: [{ id: "a", kind: "announce", next: "nowhere" }],
    };
    expect(() => loadPhaseScript(script)).toThrow(/unknown step "nowhere"/);
  });

  it("rejects a script with a dangling branch-table target", () => {
    const script: PhaseScript = {
      frame: "trade",
      start: "a",
      steps: [{ id: "a", kind: "branch", next: { yes: "a", no: "nowhere" } }],
    };
    expect(() => loadPhaseScript(script)).toThrow(/unknown step "nowhere"/);
  });

  it("rejects a check step with a dangling onSuccess/onFail target", () => {
    const script: PhaseScript = {
      frame: "trade",
      start: "a",
      steps: [
        {
          id: "a",
          kind: "check",
          next: "a",
          check: { skillSlot: "pilot", difficulty: 8, onSuccess: "a", onFail: "nowhere" },
        },
      ],
    };
    expect(() => loadPhaseScript(script)).toThrow(/unknown step "nowhere"/);
  });

  it("rejects a check step with no check config", () => {
    const script: PhaseScript = {
      frame: "trade",
      start: "a",
      steps: [{ id: "a", kind: "check", next: "a" }],
    };
    expect(() => loadPhaseScript(script)).toThrow(/missing check/);
  });

  it("rejects a tickClock step with no tick config", () => {
    const script: PhaseScript = {
      frame: "trade",
      start: "a",
      steps: [{ id: "a", kind: "tickClock", next: "a" }],
    };
    expect(() => loadPhaseScript(script)).toThrow(/missing tick/);
  });
});
