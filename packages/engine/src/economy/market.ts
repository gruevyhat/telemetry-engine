import { derive, type Projection } from "../ledger/derive.js";
import type { AppendInput } from "../ledger/ledger.js";
import type { Fact } from "../ledger/types.js";
import type { GoodDef } from "../plugin-api/index.js";
import type { Rng } from "../rng/index.js";
import type { GameTime } from "../time/index.js";

/**
 * [Spec §7.1] "price[w+1] = clamp(base x (1 + reversion(1 - price[w]/base) + drift_t + shock_t))."
 * The Spec gives no default reversion coefficient and only a typical range for drift ("small,
 * +/-3%/week typical, content-tunable"); both are extrapolated defaults, not Spec-mandated
 * numbers, and are expected to move to content once M1-11 tunes the economy for real play.
 * DRIFT_RANGE governs the uniform range the drift term is drawn from on stream `market:<hex>`.
 * MIN_PRICE_FACTOR is this module's clamp floor — the Spec says "clamp(...)" without stating
 * bounds, so a price is never allowed below 10% of its good's base price.
 */
export const DEFAULT_REVERSION = 0.1;
const DRIFT_RANGE = 0.03;
const MIN_PRICE_FACTOR = 0.1;

function historyKey(hex: string, good: string): string {
  return `${hex}|${good}`;
}

/** Pure price-update step. `drift` and `shock` are already-resolved numbers, not RNG streams. */
export function nextPrice(basePrice: number, priorPrice: number, drift: number, shock: number, reversion = DEFAULT_REVERSION): number {
  const raw = basePrice * (1 + reversion * (1 - priorPrice / basePrice) + drift + shock);
  return Math.max(raw, basePrice * MIN_PRICE_FACTOR);
}

function shockFor(worldEvents: readonly Fact[], hex: string, good: string, week: number): number {
  return worldEvents
    .filter((fact) => fact.kind === "world.event")
    .filter((fact) => fact.payload.hex === hex && fact.payload.good === good && fact.payload.week === week)
    .reduce((sum, fact) => sum + (typeof fact.payload.magnitude === "number" ? fact.payload.magnitude : 0), 0);
}

export interface GenerateWeeklyTicksInput {
  readonly t: GameTime;
  readonly rng: Rng;
  /** [Spec §7.1 "active bubble"] hexes within max staleness the crew could ever query. Computing
   * this set is out of scope here (needs a real travel model, M3) — the caller supplies it. */
  readonly activeHexes: readonly string[];
  /** [Spec §15 Plugin.economy.goods] consumed via plugin-api, not a hardcoded array. */
  readonly goods: readonly GoodDef[];
  readonly priorPrices: Readonly<Record<string, number>>;
  readonly worldEvents?: readonly Fact[];
  readonly reversion?: number;
}

/** Weekly `market.tick` proposals (Spec §4/INV-6: this only proposes; the interpreter commits). */
export function generateWeeklyTicks(input: GenerateWeeklyTicksInput): AppendInput[] {
  const week = Math.floor(input.t.day / 7);
  const worldEvents = input.worldEvents ?? [];
  const proposals: AppendInput[] = [];

  for (const hex of input.activeHexes) {
    const stream = input.rng.derive(`market:${hex}`);
    for (const good of input.goods) {
      const key = historyKey(hex, good.id);
      const prior = input.priorPrices[key] ?? good.basePrice;
      const drift = (stream.next() * 2 - 1) * DRIFT_RANGE;
      const shock = shockFor(worldEvents, hex, good.id, week);
      const price = nextPrice(good.basePrice, prior, drift, shock, input.reversion);
      proposals.push({
        t: input.t,
        kind: "market.tick",
        actor: { kind: "world", id: "market" },
        payload: { hex, good: good.id, price, week },
      });
    }
  }

  return proposals;
}

type PriceHistory = Readonly<Record<string, readonly { week: number; price: number }[]>>;

const priceHistoryProjection: Projection<PriceHistory> = {
  initial: {},
  apply(state, fact) {
    if (fact.kind !== "market.tick") {
      return state;
    }
    const { hex, good, price, week } = fact.payload;
    if (typeof hex !== "string" || typeof good !== "string" || typeof price !== "number" || typeof week !== "number") {
      return state;
    }
    const key = historyKey(hex, good);
    return { ...state, [key]: [...(state[key] ?? []), { week, price }] };
  },
};

function latestPriceAsOf(entries: readonly { week: number; price: number }[], asOfWeek: number): number | undefined {
  let best: { week: number; price: number } | undefined;
  for (const entry of entries) {
    if (entry.week <= asOfWeek && (!best || entry.week > best.week)) {
      best = entry;
    }
  }
  return best?.price;
}

/** [Spec §7.2] "a reducer projection marketAt(hex, day) over market.tick facts." All goods at `hex`, priced as of `day`. */
export function marketAt(facts: readonly Fact[], hex: string, day: number): Readonly<Record<string, number>> {
  const history = derive(facts, priceHistoryProjection);
  const asOfWeek = Math.floor(day / 7);
  const result: Record<string, number> = {};

  for (const [key, entries] of Object.entries(history)) {
    const [entryHex, good] = key.split("|") as [string, string];
    if (entryHex !== hex) {
      continue;
    }
    const price = latestPriceAsOf(entries, asOfWeek);
    if (price !== undefined) {
      result[good] = price;
    }
  }

  return result;
}

/** [Spec §7.2, INV-9] "A feed request for hex H at distance d parsecs answers from market state as of day - 7d." */
export function feedAnswer(facts: readonly Fact[], hex: string, day: number, distanceParsecs: number): Readonly<Record<string, number>> {
  return marketAt(facts, hex, day - 7 * distanceParsecs);
}
