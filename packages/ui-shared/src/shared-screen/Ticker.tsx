import type { Fact } from "@telemetry/engine";
import { TYPE_FLOOR_PX } from "./styles.js";

export interface TickerProps {
  facts: readonly Fact[];
}

export function Ticker({ facts }: TickerProps) {
  return (
    <ul aria-label="ship's log" data-testid="ticker" style={{ fontSize: `${TYPE_FLOOR_PX}px` }}>
      {facts.map((fact) => (
        <li key={fact.id} data-testid={`ticker-entry-${fact.id}`}>
          {fact.kind}
        </li>
      ))}
    </ul>
  );
}
