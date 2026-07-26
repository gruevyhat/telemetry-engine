import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { clocksProjection } from "../clocks/index.js";
import { fundsProjection } from "../economy/index.js";
import { combineProjections, derive, SCHEMA_VERSION } from "../ledger/derive.js";
import type { Fact } from "../ledger/types.js";
import {
  exportLegacyV1Save,
  loadLegacyV1Save,
  schemaVersionMismatchMessage,
  type LegacySaveV1,
} from "./index.js";

const projection = combineProjections({ funds: fundsProjection, clocks: clocksProjection });

const factArbitrary: fc.Arbitrary<Fact[]> = fc
  .array(
    fc.oneof(
      fc.record({
        kind: fc.constant("sale.settled" as const),
        amount: fc.integer({ min: 0, max: 1_000_000 }),
      }),
      fc.record({
        kind: fc.constant("purchase.settled" as const),
        amount: fc.integer({ min: 0, max: 1_000_000 }),
      }),
      fc.record({
        kind: fc.constant("clock.tick" as const),
        clockId: fc.constantFrom("obligation", "heat"),
        delta: fc.integer({ min: -10, max: 10 }),
      }),
    ),
    { minLength: 0, maxLength: 40 },
  )
  .map((events) =>
    events.map((event, index): Fact => {
      const base = {
        id: `F${index.toString().padStart(3, "0")}`,
        t: { day: Math.floor(index / 4) + 1, slot: "DOCKSIDE" as const },
        wall: 1_700_000_000_000 + index,
        actor: { kind: "world" as const, id: "world" },
        visibility: { level: "public" as const },
      };

      if (event.kind === "clock.tick") {
        return {
          ...base,
          kind: event.kind,
          payload: { clockId: event.clockId, delta: event.delta },
        };
      }

      return {
        ...base,
        kind: event.kind,
        payload: {
          lotId: `L${index}`,
          amount: event.amount,
          ...(event.kind === "sale.settled"
            ? { countDelivered: 1, buyer: "buyer" }
            : { seller: "seller" }),
        },
      };
    }),
  );

function saveWith(facts: readonly Fact[], overrides: Partial<LegacySaveV1> = {}): LegacySaveV1 {
  return {
    schemaVersion: SCHEMA_VERSION,
    seedState: { campaignSeed: "skim", streamDraws: { "world-events": 3 } },
    facts,
    contentHashes: {
      "frames/turn.json": "sha256:turn-v1",
      "decks/incidents.json": "sha256:incidents-v1",
    },
    ...overrides,
  };
}

describe("save/load [INV-3 replay determinism]", () => {
  it("load(export(state)) replays byte-identically across 50 random fact streams", () => {
    fc.assert(
      fc.property(factArbitrary, (facts) => {
        const save = saveWith(facts);
        const exported = exportLegacyV1Save(save);
        const expectedState = derive(facts, projection);

        const loaded = loadLegacyV1Save(exported, {
          schemaVersion: SCHEMA_VERSION,
          contentHashes: save.contentHashes,
          replay: (loadedFacts) => derive(loadedFacts, projection),
        });

        expect(JSON.stringify(loaded.state)).toBe(JSON.stringify(expectedState));
        expect(exportLegacyV1Save(loaded.save)).toBe(exported);
        expect(loaded.warnings).toEqual([]);
      }),
      { numRuns: 50 },
    );
  });

  it("warns on content hash mismatch and still replay-validates", () => {
    const save = saveWith([]);
    const replay = vi.fn(() => ({ validated: true }));

    const loaded = loadLegacyV1Save(exportLegacyV1Save(save), {
      schemaVersion: SCHEMA_VERSION,
      contentHashes: {
        ...save.contentHashes,
        "frames/turn.json": "sha256:turn-v2",
      },
      replay,
    });

    expect(replay).toHaveBeenCalledOnce();
    expect(replay).toHaveBeenCalledWith(save.facts, save.seedState);
    expect(loaded.state).toEqual({ validated: true });
    expect(loaded.warnings).toEqual([
      {
        code: "content-hash-mismatch",
        paths: ["frames/turn.json"],
        message:
          "Content changed since this campaign was saved. Replay validation used the current content.",
      },
    ]);
  });

  it("refuses a schemaVersion mismatch with the specified message", () => {
    const replay = vi.fn();
    const save = saveWith([], { schemaVersion: SCHEMA_VERSION + 1 });

    expect(() =>
      loadLegacyV1Save(exportLegacyV1Save(save), {
        schemaVersion: SCHEMA_VERSION,
        contentHashes: save.contentHashes,
        replay,
      }),
    ).toThrowError(schemaVersionMismatchMessage(SCHEMA_VERSION + 1, SCHEMA_VERSION));
    expect(replay).not.toHaveBeenCalled();
  });
});
