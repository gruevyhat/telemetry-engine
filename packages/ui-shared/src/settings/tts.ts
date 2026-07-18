import { announcementText, type AnnounceTemplates, type PhaseStep } from "@telemetry/engine";

/** The slice of `window.speechSynthesis` this module actually calls -- narrowed so tests can
 * inject a plain object instead of depending on jsdom implementing the Web Speech API (it
 * doesn't). */
export interface SpeechSynth {
  speak(utterance: unknown): void;
}

function defaultMakeUtterance(text: string): SpeechSynthesisUtterance {
  return new SpeechSynthesisUtterance(text);
}

/**
 * [Spec §14: "TTS (flagged): browser speechSynthesis reading MAGGIE's announce steps... a spoken
 * referee lifts eyes off the screen and makes the comms-window ritual land."] `enabled` is the
 * settings flag; no in-app settings store exists yet (no task has built one), so it's an
 * explicit parameter rather than read from a global this module would have to invent.
 */
export function speakAnnouncement(
  text: string,
  enabled: boolean,
  synth: SpeechSynth,
  makeUtterance: (text: string) => unknown = defaultMakeUtterance,
): void {
  if (!enabled) {
    return;
  }
  synth.speak(makeUtterance(text));
}

/** Combines the engine's announce-step lookup with the flag-gated speak above -- the one call a
 * future live turn loop needs to "read announce steps" aloud. */
export function speakAnnounceStep(
  step: PhaseStep,
  templates: AnnounceTemplates,
  enabled: boolean,
  synth: SpeechSynth,
  makeUtterance: (text: string) => unknown = defaultMakeUtterance,
): void {
  const text = announcementText(templates, step);
  if (text === undefined) {
    return;
  }
  speakAnnouncement(text, enabled, synth, makeUtterance);
}
