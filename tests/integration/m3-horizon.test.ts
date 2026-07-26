import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Fact } from "../../packages/engine/src/ledger/types.js";
import type { GoodDef } from "../../packages/engine/src/plugin-api/index.js";
import { marketAt } from "../../packages/engine/src/economy/market.js";
import { resolveInformationHorizon } from "../../packages/engine/src/economy/horizon.js";
import { feedLine, renderFeed } from "../../packages/engine/src/render/feed.js";
import {
  importSector,
  type SectorImportResult,
  type TravellerSector,
} from "../../packages/plugin-traveller/src/sector.js";

const fixture = readFileSync(
  new URL("../../packages/plugin-traveller/fixtures/fictional-sector.sec", import.meta.url),
  "utf8",
);
const GOODS: readonly GoodDef[] = [{ id: "ore", basePrice: 100 }];

function imported(result: SectorImportResult): TravellerSector {
  if (!result.ok) throw new Error("fictional sector fixture must import");
  return result.sector;
}

const sector = imported(importSector("fictional-alpha", fixture));

function tickFact(hex: string, price: number, week: number): Fact {
  return {
    id: `tick-${hex}-${week}`,
    t: { day: week * 7, slot: "DOCKSIDE" },
    wall: 0,
    kind: "market.tick",
    actor: { kind: "world", id: "market" },
    payload: { hex, good: "ore", price, week },
    visibility: { level: "referee" },
  };
}

const facts = sector.record.worlds.flatMap((world, worldIndex) =>
  Array.from({ length: 81 }, (_, week) => tickFact(world.hex, worldIndex * 1_000 + week, week)),
);

describe("M3 imported-sector information horizon [INV-9]", () => {
  it("answers sampled imported-world pairs from the local market state d weeks earlier", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: sector.record.worlds.length - 1 }),
        fc.integer({ min: 0, max: sector.record.worlds.length - 1 }),
        (fromIndex, toIndex) => {
          const from = sector.record.worlds[fromIndex] as (typeof sector.record.worlds)[number];
          const to = sector.record.worlds[toIndex] as (typeof sector.record.worlds)[number];
          const horizon = resolveInformationHorizon(sector, from.hex, to.hex);

          expect(horizon.state).toBe("charted");
          if (horizon.state !== "charted") throw new Error("fixture worlds must be charted");

          const day = 80 * 7;
          const expected = marketAt(facts, to.hex, day - 7 * horizon.distanceParsecs).ore;
          expect(expected).toBeTypeOf("number");
          expect(renderFeed(facts, to.hex, day, horizon, GOODS)).toEqual([
            feedLine({
              hex: to.hex,
              good: "ore",
              price: expected as number,
              distanceParsecs: horizon.distanceParsecs,
            }),
          ]);
        },
      ),
      { numRuns: 50 },
    );
  });

  it("survives the player audit: a later remote feed repeats the earlier local price", () => {
    const horizon = resolveInformationHorizon(sector, "0101", "0202");
    if (horizon.state !== "charted") throw new Error("fixture worlds must be charted");

    const localObservationDay = 21 * 7;
    const laterRemoteQueryDay = localObservationDay + 7 * horizon.distanceParsecs;
    const observedLocally = marketAt(facts, "0202", localObservationDay).ore;

    expect(renderFeed(facts, "0202", laterRemoteQueryDay, horizon, GOODS)).toEqual([
      feedLine({
        hex: "0202",
        good: "ore",
        price: observedLocally as number,
        distanceParsecs: horizon.distanceParsecs,
      }),
    ]);
  });

  it("takes the honest uncounted path when no sector data or crew count exists", () => {
    const horizon = resolveInformationHorizon({ distance: () => "unknown" }, "0101", "0202");
    expect(horizon).toEqual({ state: "uncounted" });
    expect(renderFeed(facts, "0202", 80 * 7, horizon, GOODS)).toEqual([]);
  });
});
