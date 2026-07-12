/**
 * Bare GameTime/BeatSlot shape per Spec §3.1, needed to type Fact.t (Spec §2.1).
 * Advancement rules (only the phase interpreter advances time; TRANSIT/day math) are M0-04.
 */
export type BeatSlot = "DOCKSIDE" | "COMMS" | "TRANSIT" | "ARRIVAL" | "DOWNTIME";

export interface GameTime {
  day: number;
  slot: BeatSlot;
}

/**
 * [Spec §3.1, §3.2/INV-6] Pure time-arithmetic only. Which slot comes next is a content
 * decision, not an engine one — Spec §4's Do-not is explicit: "hard-code any beat sequence in
 * engine code. If a frame wants five beats, that's a content file." So the target slot is an
 * input here, not something this function derives; the engine only owns the day-arithmetic
 * rule for "transitioning into this target slot." These functions compute a value; nothing
 * calls them but the (M0-06) phase interpreter, and nothing but the interpreter may commit the
 * result to the ledger (already enforced by the M0-01 no-ledger-writes-outside-interpreter
 * lint rule) — so "advancement exposed only to the interpreter" doesn't need a second,
 * parallel lint rule here.
 */
export function advanceToSlot(current: GameTime, targetSlot: BeatSlot): GameTime {
  return { day: current.day, slot: targetSlot };
}

/** [Spec §3.1] "each evidence action advances day += 1." Slot is unaffected. */
export function advanceEvidenceAction(current: GameTime): GameTime {
  return { day: current.day, slot: current.slot };
}
