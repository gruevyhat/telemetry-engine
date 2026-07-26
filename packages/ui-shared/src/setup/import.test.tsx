// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { importCharacter, importSector, type ImportedCrewMember, type TravellerSector } from "@telemetry/plugin-traveller";
import { SectorImport } from "./SectorImport.js";
import { CharacterImport } from "./CharacterImport.js";
import { Roster } from "./Roster.js";

/**
 * M3-10 acceptance tests — lead-authored, worker read-only. Fixtures below are the minimal valid
 * shapes `importSector`/`importCharacter` (M3-02/M3-04/M3-07) already accept; these components
 * wire those existing functions into the shipped UI (rulebook §13.1: JSON import *or* manual
 * entry, both first-class).
 */

// M3-02's committed fictional fixture: 5 worlds, hexes 0101/0202/3240/1616/2427.
const VALID_SEC = readFileSync(
  new URL("../../../plugin-traveller/fixtures/fictional-sector.sec", import.meta.url),
  "utf8",
);

const VALID_CHARACTER_JSON = JSON.stringify({
  name: "Zhan",
  characteristics: { str: 7, dex: 8, end_stat: 9, int_stat: 6, edu: 5, soc: 10 },
  career: "Merchant",
  skills: [{ name: "Broker", level: 2 }],
});

function makeFile(name: string, contents: string, type: string): File {
  return new File([contents], name, { type });
}

describe("SectorImport [M3-10, Spec §15, rulebook §13]", () => {
  it("selecting a valid sector file shows the imported sector's name and world count", async () => {
    const imported: TravellerSector[] = [];
    render(<SectorImport onImport={(sector) => imported.push(sector)} />);
    const input = screen.getByLabelText(/sector file/i);
    fireEvent.change(input, { target: { files: [makeFile("halcyon.sec", VALID_SEC, "text/plain")] } });

    await waitFor(() => expect(imported).toHaveLength(1));
    expect(screen.getByText(/halcyon\.sec/i)).toBeTruthy();
    expect(screen.getByText(/5 worlds?/i)).toBeTruthy();
  });

  it("a malformed sector file shows a MAGGIE-voice error and leaves any previously imported sector intact", async () => {
    const imported: TravellerSector[] = [];
    render(<SectorImport onImport={(sector) => imported.push(sector)} />);
    const input = screen.getByLabelText(/sector file/i);

    fireEvent.change(input, { target: { files: [makeFile("halcyon.sec", VALID_SEC, "text/plain")] } });
    await waitFor(() => expect(imported).toHaveLength(1));

    fireEvent.change(input, { target: { files: [makeFile("broken.sec", "not a sector file", "text/plain")] } });
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());

    const errorText = screen.getByRole("alert").textContent ?? "";
    expect(errorText).not.toMatch(/!|unfortunately/i);
    expect(imported).toHaveLength(1);
    expect(screen.getByText(/halcyon\.sec/i)).toBeTruthy();
  });
});

describe("CharacterImport [M3-10, Spec §15, rulebook §13]", () => {
  it("importing a character JSON adds exactly one crew member with the right name, characteristics, and skills", async () => {
    const imported: ImportedCrewMember[] = [];
    render(<CharacterImport onImport={(crewMember) => imported.push(crewMember)} />);
    const input = screen.getByLabelText(/character file/i);
    fireEvent.change(input, { target: { files: [makeFile("zhan.json", VALID_CHARACTER_JSON, "application/json")] } });

    await waitFor(() => expect(imported).toHaveLength(1));
    expect(imported[0]!.name).toBe("Zhan");
    expect(imported[0]!.attributes.str).toBe(7);
    expect(imported[0]!.skills.Broker).toBe(2);
  });

  it("manual entry produces an equivalent crew member to importing the same character as JSON", async () => {
    const imported: ImportedCrewMember[] = [];
    render(<CharacterImport onImport={(crewMember) => imported.push(crewMember)} />);

    fireEvent.click(screen.getByRole("button", { name: /enter.*hand|manual entry/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Zhan" } });
    fireEvent.change(screen.getByLabelText(/str/i), { target: { value: "7" } });
    fireEvent.change(screen.getByLabelText(/dex/i), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText(/end/i), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText(/int/i), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText(/edu/i), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText(/soc/i), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText(/career/i), { target: { value: "Merchant" } });
    fireEvent.change(screen.getByLabelText(/broker/i), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /add crew member/i }));

    await waitFor(() => expect(imported).toHaveLength(1));
    const jsonResult = importCharacter(JSON.parse(VALID_CHARACTER_JSON));
    if (!jsonResult.ok) throw new Error("fixture character must parse");
    expect(imported[0]!.name).toBe(jsonResult.value.crewMember.name);
    expect(imported[0]!.career).toBe(jsonResult.value.crewMember.career);
    expect(imported[0]!.attributes).toMatchObject(jsonResult.value.crewMember.attributes);
    expect(imported[0]!.skills).toMatchObject(jsonResult.value.crewMember.skills);
  });
});

describe("Roster [M3-10, Spec §15, INV-13]", () => {
  const crew: ImportedCrewMember[] = [
    { crewMemberId: "crew-1", name: "Zhan", career: "Merchant", sourceHash: "hash-1", attributes: { str: 7 }, skills: { Broker: 2 } },
  ];

  it("with no sector imported, states trust mode plainly and offers the crew-count entry, never a fabricated distance", () => {
    render(<Roster crew={crew} sector={null} fromHex="0101" toHex="0202" />);
    expect(screen.getByText(/trust mode|isn't in my charts|not in my charts/i)).toBeTruthy();
    expect(screen.getByLabelText(/crew.*count|parsecs/i)).toBeTruthy();
    expect(screen.queryByText(/\d+ parsecs? away/i)).toBeNull();
  });

  it("once a sector is imported, reports the real charted distance rather than trust mode", async () => {
    const result = importSector("halcyon", VALID_SEC);
    if (!result.ok) throw new Error("fixture sector must parse");
    render(<Roster crew={crew} sector={result.sector} fromHex="0101" toHex="0202" />);
    expect(screen.queryByText(/trust mode|isn't in my charts/i)).toBeNull();
    expect(screen.getByText(/\d+ parsecs? away|charted/i)).toBeTruthy();
  });

  it("no referee-scoped value appears in the DOM at any point (INV-13)", () => {
    const { container } = render(<Roster crew={crew} sector={null} fromHex="0101" toHex="0202" />);
    expect(container.innerHTML).not.toMatch(/referee/i);
  });
});
