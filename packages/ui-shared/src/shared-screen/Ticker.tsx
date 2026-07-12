import type { Fact } from "@telemetry/engine";
import { TYPE_FLOOR_PX } from "./styles.js";

/**
 * [rulebook section 3.1] "Ship's log ticker (bottom): the running journal, scrolling as events post.
 * Append-only." The host holds the full ledger (INV-13), so this receives every fact, but the
 * public ticker itself must show only public-visibility ones; table/private/referee facts
 * belong to the main panel or a phone, not the ticker.
 */
export interface TickerProps {
  facts: readonly Fact[];
}

export function Ticker({ facts }: TickerProps) {
  const publicFacts = facts.filter((fact) => fact.visibility.level === "public");
  return (
    <ul
      aria-label="ship's log"
      data-testid="ticker"
      style={{
        borderTop: "1px solid #5f6368",
        fontSize: `${TYPE_FLOOR_PX}px`,
        listStyle: "none",
        margin: 0,
        padding: "0.75rem 1rem",
      }}
    >
      {publicFacts.map((fact) => (
        <li key={fact.id} data-testid={`ticker-entry-${fact.id}`}>
          {fact.kind}
        </li>
      ))}
    </ul>
  );
}
