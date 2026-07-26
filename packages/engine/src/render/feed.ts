import { feedAnswer } from "../economy/market.js";
import type { Fact } from "../ledger/types.js";
import type { GoodDef } from "../plugin-api/index.js";
import type { Distance } from "../plugin-api/travel.js";

/**
 * [Spec §15] "No data loaded -> distance() = 'unknown' -> trust mode: MAGGIE accepts the crew's
 * count and confirms arithmetic only when asked." Distance in parsecs, or 'unknown' pre-M3
 * (no Traveller sector import) / off-map hexes.
 */
export type FeedDistance = Distance;

export type FeedHorizon =
  | { readonly state: "charted"; readonly distanceParsecs: number }
  | { readonly state: "trusted"; readonly distanceParsecs: number }
  | { readonly state: "uncounted" };

export interface FeedLineInput {
  readonly hex: string;
  readonly good: string;
  readonly price: number;
  readonly distanceParsecs: FeedDistance;
  readonly crewCountParsecs?: number;
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
  const { hex, good, price, distanceParsecs, crewCountParsecs } = input;
  const amount = formatCredits(price);

  if (distanceParsecs === "unknown") {
    const staleness =
      crewCountParsecs === undefined
        ? ""
        : `${crewCountParsecs} ${crewCountParsecs === 1 ? "week" : "weeks"} stale, `;
    return (
      `${good} at ${hex}: ${amount}, ${staleness}by the crew's count. Distance from here isn't in my charts. ` +
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
export function renderFeed(
  facts: readonly Fact[],
  hex: string,
  day: number,
  horizonInput: FeedHorizon | FeedDistance,
  goods: readonly GoodDef[],
): string[] {
  const horizon: FeedHorizon =
    typeof horizonInput === "number"
      ? { state: "charted", distanceParsecs: horizonInput }
      : horizonInput === "unknown"
        ? { state: "uncounted" }
        : horizonInput;

  if (horizon.state === "uncounted") {
    return [];
  }

  const prices = feedAnswer(facts, hex, day, horizon.distanceParsecs);

  return goods
    .filter((good) => prices[good.id] !== undefined)
    .map((good) =>
      feedLine({
        hex,
        good: good.id,
        price: prices[good.id]!,
        distanceParsecs: horizon.state === "trusted" ? "unknown" : horizon.distanceParsecs,
        ...(horizon.state === "trusted"
          ? { crewCountParsecs: horizon.distanceParsecs }
          : {}),
      }),
    );
}
