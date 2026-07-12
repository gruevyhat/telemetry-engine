import type { BeatSlot } from "@telemetry/engine";
import { TYPE_FLOOR_PX } from "./styles.js";

const TURN_BEATS: readonly BeatSlot[] = ["DOCKSIDE", "COMMS", "TRANSIT", "ARRIVAL", "DOWNTIME"];

export interface PhaseTrackProps {
  currentSlot: BeatSlot;
}

export function PhaseTrack(_props: PhaseTrackProps) {
  return (
    <div role="list" aria-label="phase track" style={{ fontSize: `${TYPE_FLOOR_PX}px` }}>
      {TURN_BEATS.map((beat) => (
        <span key={beat} role="listitem" data-testid={`beat-${beat}`}>
          {beat}
        </span>
      ))}
    </div>
  );
}
