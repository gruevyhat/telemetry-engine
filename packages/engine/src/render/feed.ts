import { feedAnswer, marketAt } from "../economy/market.js";
import type { Fact } from "../ledger/types.js";
import type { GoodDef } from "../plugin-api/index.js";

/**
 * [Spec §15] "No data loaded -> distance() = 'unknown' -> trust mode: MAGGIE accepts the crew's
 * count and confirms arithmetic only when asked." Distance in parsecs, or 'unknown' pre-M3
 * (no Traveller sector import) / off-map hexes.
 */
export type FeedDistance = number | "unknown";

export interface FeedLineInput {
  readonly hex: string;
  readonly good: string;
  readonly price: number;
  readonly distanceParsecs: FeedDistance;
}

function formatCredits(price: number): string {
  // Pinned locale, matching StatusBar (Spec §21.3: funds must format identically on every machine).
  return `Cr${price.toLocaleString("en-US")}`;
}

/**
 * [Spec §7.2, §14, docs/design/maggie-voice.md] One line, MAGGIE voice, staleness tag always
 * present (Do-not: no toggle to hide it — the tag is a rules teach, not chrome).
 */
export function feedLine(input: FeedLineInput): string {
  const { hex, good, price, distanceParsecs } = input;
  const amount = formatCredits(price);

  if (distanceParsecs === "unknown") {
    return (
      `${good} at ${hex}: ${amount}, by the crew's count. Distance from here isn't in my charts. ` +
      `I verify arithmetic; I do not verify distance.`
    );
  }
  if (distanceParsecs === 0) {
    return `${good} at ${hex}: ${amount}. Current price. You are standing in this market.`;
  }
  const weekWord = distanceParsecs === 1 ? "week" : "weeks";
  return `${good} at ${hex}: ${amount}, ${distanceParsecs} ${weekWord} stale. That was the price ${distanceParsecs} ${weekWord} ago, not today.`;
}

/**
 * [Spec §7.2] One feed line per plugin good present in feedAnswer's result — goods with no
 * market.tick history yet are omitted rather than rendered with a fabricated price.
 */
export function renderFeed(facts: readonly Fact[], hex: string, day: number, distanceParsecs: FeedDistance, goods: readonly GoodDef[]): string[] {
  // Trust mode (Spec §15) has no distance to compute staleness from, so it reads the latest
  // known price outright rather than a day-7d lookup.
  const prices = distanceParsecs === "unknown" ? marketAt(facts, hex, day) : feedAnswer(facts, hex, day, distanceParsecs);

  return goods
    .filter((good) => prices[good.id] !== undefined)
    .map((good) => feedLine({ hex, good: good.id, price: prices[good.id]!, distanceParsecs }));
}
