import type { Fact } from "@telemetry/engine";
import { TYPE_FLOOR_PX } from "./styles.js";

export interface InterstitialProps {
  playerName: string;
  visibleFacts: readonly Fact[];
}

export function Interstitial({ playerName, visibleFacts }: InterstitialProps) {
  return (
    <div role="region" aria-label={`${playerName}'s private view`} style={{ fontSize: `${TYPE_FLOOR_PX}px` }}>
      <ul>
        {visibleFacts.map((fact) => (
          <li key={fact.id} data-testid={`private-entry-${fact.id}`}>
            {fact.kind}
          </li>
        ))}
      </ul>
    </div>
  );
}
