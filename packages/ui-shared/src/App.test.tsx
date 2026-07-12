// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

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
});
