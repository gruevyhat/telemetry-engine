import type { LocationId, TravelModel } from "../plugin-api/travel.js";
import type { FeedHorizon } from "../render/feed.js";

type DistanceModel = Pick<TravelModel, "distance">;

/**
 * Resolves the information available to the market-feed renderer without importing or knowing
 * any setting-specific sector representation. A charted distance always wins over a crew count.
 */
export function resolveInformationHorizon(
  travel: DistanceModel,
  from: LocationId,
  to: LocationId,
  crewCountParsecs?: number,
): FeedHorizon {
  const distance = travel.distance(from, to);
  if (distance !== "unknown") {
    return { state: "charted", distanceParsecs: distance };
  }

  if (crewCountParsecs === undefined) {
    return { state: "uncounted" };
  }
  if (!Number.isInteger(crewCountParsecs) || crewCountParsecs < 0) {
    throw new Error("A crew distance count must be a non-negative whole number of parsecs.");
  }

  return { state: "trusted", distanceParsecs: crewCountParsecs };
}
