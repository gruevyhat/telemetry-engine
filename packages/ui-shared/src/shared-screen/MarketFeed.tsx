import { TYPE_FLOOR_PX } from "./styles.js";

/**
 * [Spec §7.2, §14; docs/design/screens-v1.md §2.1] Presentational only: takes already-rendered
 * MAGGIE-voice lines (engine's render/feed.ts) and lists them in M0-07's main panel. No prop
 * strips or hides the staleness tag baked into each line — Do-not: "tags always shown; no
 * toggle to hide them."
 */
export interface MarketFeedProps {
  lines: readonly string[];
}

export function MarketFeed({ lines }: MarketFeedProps) {
  return (
    <ul aria-label="market feed" style={{ fontSize: `${TYPE_FLOOR_PX}px`, listStyle: "none", margin: 0, padding: 0 }}>
      {lines.map((line, index) => (
        <li key={line} data-testid={`feed-line-${index}`} style={{ padding: "0.25rem 0" }}>
          {line}
        </li>
      ))}
    </ul>
  );
}
