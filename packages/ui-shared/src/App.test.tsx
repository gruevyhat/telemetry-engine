// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App.js";

afterEach(cleanup);

describe("App [M0-07 hotseat shell]", () => {
  it("renders the shared-screen regions and hand-to-player interstitial", () => {
    render(<App />);

    expect(screen.getByTestId("shared-screen")).toBeTruthy();
    expect(screen.getByTestId("status-bar")).toBeTruthy();
    expect(screen.getByRole("list", { name: "phase track" })).toBeTruthy();
    expect(screen.getByTestId("main-panel").textContent).toContain("Dockside systems are open");
    expect(screen.getByRole("list", { name: "ship's log" })).toBeTruthy();
    expect(screen.getByRole("dialog", { name: "hand-to-player" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /I am Zhan/i }));

    expect(screen.getByRole("region", { name: "Zhan's private view" })).toBeTruthy();
    expect(screen.getByText("agenda.actionTaken")).toBeTruthy();
  });

  it("disables Advance demo turn after one full DOCKSIDE-to-DOCKSIDE lap so it can't double-commit the demo's facts", () => {
    render(<App />);
    const advance = screen.getByRole("button", { name: "Advance demo turn" });

    expect((advance as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(advance); // DOCKSIDE -> COMMS
    expect((advance as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(advance); // COMMS -> TRANSIT
    expect((advance as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(advance); // TRANSIT -> ARRIVAL
    expect((advance as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(advance); // ARRIVAL -> DOCKSIDE: the demo's one scripted lap is complete

    expect((advance as HTMLButtonElement).disabled).toBe(true);
  });
});
