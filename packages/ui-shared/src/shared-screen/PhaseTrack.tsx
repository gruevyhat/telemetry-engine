import type { BeatSlot } from "@telemetry/engine";
import { TYPE_FLOOR_PX } from "./styles.js";

/**
 * [rulebook section 6] The turn is exactly four beats: DOCKSIDE, COMMS WINDOW, TRANSIT, ARRIVAL, not
 * all five BeatSlot values; DOWNTIME isn't one of "the four beats of the current turn" the
 * wireframe's phase track shows.
 */
const TURN_BEATS: readonly BeatSlot[] = ["DOCKSIDE", "COMMS", "TRANSIT", "ARRIVAL"];

export interface PhaseTrackProps {
  currentSlot: BeatSlot;
}

export function PhaseTrack({ currentSlot }: PhaseTrackProps) {
  return (
    <div
      role="list"
      aria-label="phase track"
      style={{
        borderBottom: "1px solid #5f6368",
        display: "grid",
        fontSize: `${TYPE_FLOOR_PX}px`,
        gap: "0.5rem",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        padding: "0.75rem 1rem",
      }}
    >
      {TURN_BEATS.map((beat) => (
        <span
          key={beat}
          role="listitem"
          aria-current={beat === currentSlot ? "step" : undefined}
          data-active={beat === currentSlot}
          data-testid={`beat-${beat}`}
          style={{
            border: beat === currentSlot ? "2px solid #f5c542" : "1px solid #5f6368",
            padding: "0.5rem",
            textAlign: "center",
          }}
        >
          {beat}
        </span>
      ))}
    </div>
  );
}
