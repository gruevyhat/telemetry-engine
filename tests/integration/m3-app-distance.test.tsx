// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../packages/ui-shared/src/App.js";

/**
 * M3-13 acceptance tests — lead-authored. Proves the gap `docs/demos/M3.md` (M3-12) documented
 * is closed: a person using the real shipped app can import a sector and a character, and the
 * app's own rendered feed reflects real charted distance (or honest trust mode with no sector),
 * not a hardcoded number. Extends `tests/integration/trade-campaign.test.tsx`, which this test
 * file does not modify or duplicate beyond the one shared setup step (claiming Zhan's seat).
 */

const HERE = fileURLToPath(import.meta.url);
const sectorFixture = readFileSync(fileURLToPath(new URL("../../packages/plugin-traveller/fixtures/fictional-sector.sec", `file://${HERE}`)), "utf8");
const merchantFixtureRaw = readFileSync(fileURLToPath(new URL("../../packages/plugin-traveller/fixtures/characters/fictional-merchant.json", `file://${HERE}`)), "utf8");

function makeFile(name: string, contents: string, type: string): File {
  return new File([contents], name, { type });
}

function claimZhanSeat(): void {
  fireEvent.click(screen.getByRole("button", { name: /I am Zhan/i }));
}

afterEach(cleanup);

describe("M3-13: the shipped app reaches Spec §21.3's real-distance path", () => {
  it("with no sector imported, states trust mode plainly and never shows a fabricated remote distance", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<App />);
    claimZhanSeat();

    expect(screen.getByLabelText(/sector file/i)).toBeTruthy();
    expect(screen.getByText(/isn't in my charts/i)).toBeTruthy();
    expect(screen.getByText(/import a sector to check a remote world/i)).toBeTruthy();
    expect(screen.queryByLabelText("remote market feed")).toBeNull();

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("importing the fictional sector shows the real charted distance and a real historical remote price", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<App />);
    claimZhanSeat();

    fireEvent.change(screen.getByLabelText(/sector file/i), {
      target: { files: [makeFile("fictional-sector.sec", sectorFixture, "text/plain")] },
    });

    await waitFor(() => expect(screen.queryByText(/isn't in my charts/i)).toBeNull());
    expect(screen.getByText(/parsecs? away/i)).toBeTruthy();

    const feed = await screen.findByLabelText("remote market feed");
    expect(feed.textContent).toMatch(/machine-parts|refined-materials/);
    expect(feed.textContent).toMatch(/weeks? stale/);

    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("importing the fictional-merchant.json character adds it to the app's own crew-facing roster", async () => {
    render(<App />);
    claimZhanSeat();

    function crewLine(): string | null {
      return screen.getByText(/^Crew:/).textContent;
    }

    expect(crewLine()).toBe("Crew: 0");
    fireEvent.change(screen.getByLabelText(/character file/i), {
      target: { files: [makeFile("fictional-merchant.json", merchantFixtureRaw, "application/json")] },
    });

    await waitFor(() => expect(crewLine()).toBe("Crew: 1"));
  });
});
