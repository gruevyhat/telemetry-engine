import type { ReactNode } from "react";
import type { BeatSlot, Fact } from "@telemetry/engine";
import { PhaseTrack } from "./PhaseTrack.js";
import { StatusBar, type StatusBarData } from "./StatusBar.js";
import { Ticker } from "./Ticker.js";

/**
 * [rulebook section 3.1, task M0-07] The four wireframe regions: status bar (top), phase track, main
 * panel (center: "whatever the phase demands"; out of scope here, M1-09 renders it), ship's
 * log ticker (bottom).
 */
export interface SharedScreenProps {
  status: StatusBarData;
  currentSlot: BeatSlot;
  facts: readonly Fact[];
  children?: ReactNode;
}

export function SharedScreen({ status, currentSlot, facts, children }: SharedScreenProps) {
  return (
    <div
      data-testid="shared-screen"
      style={{
        background: "#16181d",
        color: "#f4f1e8",
        display: "grid",
        gridTemplateRows: "auto auto minmax(16rem, 1fr) auto",
        minHeight: "100vh",
      }}
    >
      <StatusBar {...status} />
      <PhaseTrack currentSlot={currentSlot} />
      <main data-testid="main-panel" style={{ fontSize: "24px", padding: "1.5rem" }}>
        {children}
      </main>
      <Ticker facts={facts} />
    </div>
  );
}
