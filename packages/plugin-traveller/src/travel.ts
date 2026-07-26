import { distance } from "./hex.js";

type TravellerShip = {
  readonly jumpRating: number;
  readonly fuelCapacity: number;
  readonly currentFuel: number;
};

export const travellerTravel = {
  distance,

  validateJump(ship: TravellerShip, from: string, to: string) {
    const parsecs = distance(from, to);

    if (parsecs === "unknown") {
      return { outcome: "unknown-distance" } as const;
    }

    if (parsecs > ship.jumpRating) {
      return {
        outcome: "out-of-range",
        parsecs,
        jumpRating: ship.jumpRating,
      } as const;
    }

    const fuelRequired = travellerTravel.fuelCost(ship, parsecs);
    if (fuelRequired > ship.currentFuel) {
      return {
        outcome: "insufficient-fuel",
        parsecs,
        fuelRequired,
        fuelAvailable: ship.currentFuel,
      } as const;
    }

    return { outcome: "ok", parsecs, fuelRequired } as const;
  },

  fuelCost(ship: TravellerShip, parsecs: number) {
    return Math.ceil(ship.fuelCapacity * 0.1) * parsecs;
  },

  stalenessWeeks(parsecs: number) {
    return parsecs;
  },
};
