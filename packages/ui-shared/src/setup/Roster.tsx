import { useState } from "react";
import type { ImportedCrewMember, TravellerSector } from "@telemetry/plugin-traveller";

export interface RosterProps {
  readonly crew: readonly ImportedCrewMember[];
  readonly sector: TravellerSector | null;
  readonly fromHex: string;
  readonly toHex: string;
}

export function Roster({ crew, sector, fromHex, toHex }: RosterProps) {
  const [crewCount, setCrewCount] = useState("");

  if (sector === null) {
    return (
      <div>
        <p>This sector isn't in my charts. Trust mode is active.</p>
        <label>
          Jump distance in parsecs
          <input
            type="number"
            value={crewCount}
            onChange={(e) => setCrewCount(e.currentTarget.value)}
          />
        </label>
        <p>Crew: {crew.length}</p>
      </div>
    );
  }

  const distance = sector.distance(fromHex, toHex);
  const distanceText = distance === "unknown"
    ? "The distance is unknown."
    : `${distance} parsec${distance === 1 ? "" : "s"} away.`;

  return (
    <div>
      <p>{distanceText}</p>
      <p>Crew: {crew.length}</p>
    </div>
  );
}
