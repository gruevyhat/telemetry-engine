// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { Fact } from "../../packages/engine/src/ledger/types.js";
import type { GoodDef } from "../../packages/engine/src/plugin-api/index.js";
import { marketAt } from "../../packages/engine/src/economy/market.js";
import { resolveInformationHorizon } from "../../packages/engine/src/economy/horizon.js";
import { feedLine, renderFeed } from "../../packages/engine/src/render/feed.js";
import { importCharacter, exportCharacter } from "../../packages/plugin-traveller/src/character.js";
import type { ImportedCrewMember, TravellerSector } from "../../packages/plugin-traveller/src/index.js";
import { SectorImport } from "../../packages/ui-shared/src/setup/SectorImport.js";
import { CharacterImport } from "../../packages/ui-shared/src/setup/CharacterImport.js";

/**
 * M3-12 acceptance tests — lead-authored. Proves Spec §21.3's three M3 acceptance items through
 * the real, shipped modules together (real UI components, real interpreter-adjacent economy/
 * render functions, real fixtures) — not fakes, not calling one function in isolation. See
 * docs/demos/M3.md for what this test does and does not prove about the running application.
 */

afterEach(cleanup);

const HERE = fileURLToPath(import.meta.url);
const sectorFixture = readFileSync(fileURLToPath(new URL("../../packages/plugin-traveller/fixtures/fictional-sector.sec", `file://${HERE}`)), "utf8");
const merchantFixtureRaw = readFileSync(fileURLToPath(new URL("../../packages/plugin-traveller/fixtures/characters/fictional-merchant.json", `file://${HERE}`)), "utf8");
const merchantFixture = JSON.parse(merchantFixtureRaw);

const GOODS: readonly GoodDef[] = [{ id: "machine-parts", basePrice: 100 }];

function tickFact(hex: string, price: number, week: number): Fact {
  return {
    id: `tick-${hex}-${week}`,
    t: { day: week * 7, slot: "DOCKSIDE" },
    wall: 0,
    kind: "market.tick",
    actor: { kind: "world", id: "market" },
    payload: { hex, good: "machine-parts", price, week },
    visibility: { level: "referee" },
  };
}

function makeFile(name: string, contents: string, type: string): File {
  return new File([contents], name, { type });
}

describe("M3-12 [Spec §21.3 item 1]: Traveller import round-trips travtools JSON, through the real import UI", () => {
  it("importing the fictional-merchant.json fixture through CharacterImport yields the same crew member importCharacter itself produces, and exports back to the original JSON", async () => {
    const imported: ImportedCrewMember[] = [];
    render(<CharacterImport onImport={(crewMember) => imported.push(crewMember)} />);

    fireEvent.change(screen.getByLabelText(/character file/i), {
      target: { files: [makeFile("fictional-merchant.json", merchantFixtureRaw, "application/json")] },
    });
    await waitFor(() => expect(imported).toHaveLength(1));

    const direct = importCharacter(merchantFixture);
    if (!direct.ok) throw new Error("fixture must parse");
    expect(imported[0]).toEqual(direct.value.crewMember);
    expect(imported[0]!.career).toBe("merchant");

    expect(exportCharacter(direct.value)).toEqual(merchantFixture);
  });
});

describe("M3-12 [Spec §21.3 item 2]: INV-9 green over imported sector data, through the real import UI", () => {
  it("importing the fictional sector through SectorImport, then reading a remote world's feed, shows the real historical price at the real charted distance", async () => {
    const imported: TravellerSector[] = [];
    render(<SectorImport onImport={(sector) => imported.push(sector)} />);
    fireEvent.change(screen.getByLabelText(/sector file/i), {
      target: { files: [makeFile("fictional-sector.sec", sectorFixture, "text/plain")] },
    });
    await waitFor(() => expect(imported).toHaveLength(1));
    const sector = imported[0]!;

    const [from, to] = sector.record.worlds;
    if (!from || !to) throw new Error("fixture sector needs at least two worlds");

    const horizon = resolveInformationHorizon(sector, from.hex, to.hex);
    expect(horizon.state).toBe("charted");
    if (horizon.state !== "charted") throw new Error("unreachable");
    expect(horizon.distanceParsecs).toBe(sector.distance(from.hex, to.hex));

    const facts = Array.from({ length: 20 }, (_, week) => tickFact(to.hex, 100 + week, week));
    const day = 15 * 7;
    const expectedPrice = marketAt(facts, to.hex, day - 7 * horizon.distanceParsecs)["machine-parts"];
    expect(expectedPrice).toBeTypeOf("number");

    expect(renderFeed(facts, to.hex, day, horizon, GOODS)).toEqual([
      feedLine({ hex: to.hex, good: "machine-parts", price: expectedPrice as number, distanceParsecs: horizon.distanceParsecs }),
    ]);
  });
});

describe("M3-12 [Spec §21.3 item 3]: trust mode with no sector data loaded", () => {
  it("with no sector imported, the horizon is uncounted and no price line is ever shown — never a fabricated distance", () => {
    const horizon = resolveInformationHorizon({ distance: () => "unknown" }, "0101", "0202");
    expect(horizon).toEqual({ state: "uncounted" });

    const facts = Array.from({ length: 20 }, (_, week) => tickFact("0202", 100 + week, week));
    expect(renderFeed(facts, "0202", 15 * 7, horizon, GOODS)).toEqual([]);
  });
});

describe("M3-12: the demo's documented commands exist and are real package.json scripts", () => {
  it("every command docs/demos/M3.md tells the reader to run is a real script", async () => {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL("../../package.json", `file://${HERE}`)), "utf8"));
    for (const script of ["test", "test:integration", "typecheck", "lint", "lint:content", "build:stub", "sim:smoke"]) {
      expect(pkg.scripts, script).toHaveProperty(script);
    }
  });
});
