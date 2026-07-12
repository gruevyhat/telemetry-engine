import type { ReactNode } from "react";
import type { BeatSlot, Fact } from "@telemetry/engine";
import { PhaseTrack } from "./PhaseTrack.js";
import { StatusBar, type StatusBarData } from "./StatusBar.js";
import { Ticker } from "./Ticker.js";

export interface SharedScreenProps {
  status: StatusBarData;
  currentSlot: BeatSlot;
  facts: readonly Fact[];
  children?: ReactNode;
}

export function SharedScreen({ status, currentSlot, facts, children }: SharedScreenProps) {
  return (
    <div data-testid="shared-screen">
      <StatusBar {...status} />
      <PhaseTrack currentSlot={currentSlot} />
      <main data-testid="main-panel">{children}</main>
      <Ticker facts={facts} />
    </div>
  );
}
