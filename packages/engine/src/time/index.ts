/**
 * Bare GameTime/BeatSlot shape per Spec §3.1, needed to type Fact.t (Spec §2.1).
 * Advancement rules (only the phase interpreter advances time; TRANSIT/day math) are M0-04.
 */
export type BeatSlot = "DOCKSIDE" | "COMMS" | "TRANSIT" | "ARRIVAL" | "DOWNTIME";

export interface GameTime {
  day: number;
  slot: BeatSlot;
}
