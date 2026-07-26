/**
 * [Spec §15] The travel slice of the Plugin interface. The engine declares this contract;
 * the Traveller plugin implements it (M3-01/02/06). Nothing here may name a Traveller concept
 * beyond `parsecs`, which Spec §15 writes into the interface itself — INV-1 means the engine
 * compiles with that plugin's package deleted, so the vocabulary stays domain-neutral: opaque
 * location ids, a numeric jump rating, a numeric fuel tank.
 */

/**
 * A location id as the plugin understands it. Opaque to the engine — the Traveller plugin reads
 * these as 4-digit `CCRR` sector hexes, but the engine never parses one.
 */
export type LocationId = string;

/**
 * Distance in parsecs, or `'unknown'` when either endpoint is absent from loaded sector data.
 *
 * [Spec §15] "No data loaded → distance() = 'unknown' → trust mode."
 *
 * **This union is deliberately two-state and stays that way.** `docs/design/travel-and-import-v1.md`
 * §4 splits the *render* layer into three states (charted / trusted / uncounted), but the
 * distinction between the latter two is whether the table supplied a count — which arrives at
 * `renderFeed`, never at the plugin. A plugin that has no sector data cannot tell the two apart
 * and must not be asked to. The three-state union belongs in `render/feed.ts` and is M3-05's;
 * this type is what M3-05's `FeedDistance` alias resolves to.
 */
export type Distance = number | "unknown";

/**
 * [travel-and-import-v1 §1.3] Deliberately minimal: enough for `validateJump` and `fuelCost` to
 * be real rather than half-implemented. No fuel scoops, refuelling rules, cargo capacity, or
 * combat — travtools already owns shipbuilding, and Spec §7.3's "resist academically
 * interesting" applies here too.
 */
export interface Ship {
  readonly jumpRating: number;
  readonly fuelCapacity: number;
  readonly currentFuel: number;
}

/**
 * The result of checking a jump. Spec §15 names `JumpValidation` but does not define it, so this
 * is an extrapolation and recorded as one in PROJECT.md.
 *
 * A discriminated union rather than a boolean, and `unknown-distance` is an explicit arm: with no
 * sector loaded the honest answer is "I cannot tell," which is neither permission nor refusal.
 * Collapsing it into `false` would be the same silent-plausibility failure the trust-mode work
 * exists to fix — see travel-and-import-v1 §4.
 */
export type JumpValidation =
  | { readonly outcome: "ok"; readonly parsecs: number; readonly fuelRequired: number }
  | { readonly outcome: "out-of-range"; readonly parsecs: number; readonly jumpRating: number }
  | {
      readonly outcome: "insufficient-fuel";
      readonly parsecs: number;
      readonly fuelRequired: number;
      readonly fuelAvailable: number;
    }
  | { readonly outcome: "unknown-distance" };

export interface TravelModel {
  /** Parsecs between two locations, or `'unknown'` when either is not in loaded data. */
  distance(from: LocationId, to: LocationId): Distance;
  /** Never throws on unknown distance; returns the `unknown-distance` arm instead. */
  validateJump(ship: Ship, from: LocationId, to: LocationId): JumpValidation;
  /** Fuel consumed by a jump of the given length. Pure. */
  fuelCost(ship: Ship, parsecs: number): number;
  /** How stale a remote figure is at this distance. Feeds the information horizon (INV-9). */
  stalenessWeeks(parsecs: number): number;
}
