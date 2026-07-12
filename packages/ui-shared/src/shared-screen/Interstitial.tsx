import { useState } from "react";
import type { Fact } from "@telemetry/engine";
import { TYPE_FLOOR_PX } from "./styles.js";

/**
 * [Spec section 16, INV-13] Hotseat transport: "transient private views behind a 'hand to <name>'
 * interstitial." This component never filters facts itself and never receives another player's
 * private facts as input. The caller is responsible for passing only the slice
 * `ledger.visibleTo({scope:'private', playerId})` already produces for this one player. There
 * is no prop through which a second player's private data could reach this component; leakage
 * would have to be a bug in the caller's filtering, not in what this component chooses to
 * render.
 */
export interface InterstitialProps {
  playerName: string;
  visibleFacts: readonly Fact[];
}

export function Interstitial({ playerName, visibleFacts }: InterstitialProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  if (!acknowledged) {
    return (
      <div role="dialog" aria-label="hand-to-player" style={{ fontSize: `${TYPE_FLOOR_PX}px` }}>
        <p>Hand the device to {playerName}.</p>
        <button type="button" onClick={() => setAcknowledged(true)}>
          I am {playerName}
        </button>
      </div>
    );
  }

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
