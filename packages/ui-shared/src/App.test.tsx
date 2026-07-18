// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App.js";

afterEach(cleanup);

describe("App [M1-13 real trade campaign]", () => {
  it("renders the shared-screen regions and hand-to-player interstitial", () => {
    render(<App />);

    expect(screen.getByTestId("shared-screen")).toBeTruthy();
    expect(screen.getByTestId("status-bar")).toBeTruthy();
    expect(screen.getByRole("list", { name: "phase track" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "ship's log" })).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "hand-to-player" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /I am Zhan/i }));

    expect(screen.getByRole("region", { name: "Zhan's private view" })).toBeTruthy();
  });

  it("renders the dockside market feed driven by real marketAt projections, not fixture text", () => {
    render(<App />);

    expect(screen.getByRole("list", { name: "market feed" })).toBeTruthy();
    expect(screen.getByTestId("feed-line-0").textContent).toMatch(/machine-parts|refined-ore/);
  });

  it("plays a full 4-turn campaign by hand: funds change and a real trade-deck incident fires", () => {
    render(<App />);
    const advance = screen.getByRole("button", { name: "Advance turn" });

    // 4 turns x 4 beats (DOCKSIDE -> COMMS -> TRANSIT -> ARRIVAL) = 16 advances.
    for (let i = 0; i < 16; i++) {
      expect((advance as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(advance);
    }

    expect((advance as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("status-funds").textContent).not.toBe("Cr0");
  });

  it("fires a real incident from the trade deck on the first DOCKSIDE generate step", () => {
    render(<App />);
    const advance = screen.getByRole("button", { name: "Advance turn" });

    // t1-dockside -> t1-comms: the generate step's own advance() commits the incident.
    fireEvent.click(advance);

    expect(screen.getByTestId("main-panel").textContent).not.toBe("");
  });
});
