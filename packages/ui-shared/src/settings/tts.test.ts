import { describe, expect, it, vi } from "vitest";
import type { PhaseStep } from "@telemetry/engine";
import { speakAnnounceStep, speakAnnouncement } from "./tts.js";

describe("speakAnnouncement — TTS behind a settings flag [Spec §14: browser speechSynthesis reading MAGGIE's announce steps]", () => {
  it("does nothing when the flag is off", () => {
    const synth = { speak: vi.fn() };
    speakAnnouncement("Dockside at Vantage.", false, synth, (text) => text);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("speaks the given text via the injected synth when the flag is on", () => {
    const synth = { speak: vi.fn() };
    speakAnnouncement("Dockside at Vantage.", true, synth, (text) => text);
    expect(synth.speak).toHaveBeenCalledWith("Dockside at Vantage.");
  });
});

const TEMPLATES = { "demo.dockside": "Dockside systems are open." };

function announceStep(overrides: Partial<PhaseStep> = {}): PhaseStep {
  return { id: "s1", kind: "announce", next: "s2", ...overrides };
}

describe("speakAnnounceStep — reads an announce step's looked-up text aloud, flag-gated", () => {
  it("speaks the announce step's template text when the flag is on", () => {
    const synth = { speak: vi.fn() };
    speakAnnounceStep(announceStep({ render: "demo.dockside" }), TEMPLATES, true, synth, (text) => text);
    expect(synth.speak).toHaveBeenCalledWith("Dockside systems are open.");
  });

  it("does not speak when the flag is off", () => {
    const synth = { speak: vi.fn() };
    speakAnnounceStep(announceStep({ render: "demo.dockside" }), TEMPLATES, false, synth, (text) => text);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("does nothing for a step with no render key, regardless of the flag", () => {
    const synth = { speak: vi.fn() };
    speakAnnounceStep(announceStep({ automatic: true }), TEMPLATES, true, synth, (text) => text);
    expect(synth.speak).not.toHaveBeenCalled();
  });
});
