// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { App } from "../../packages/ui-shared/src/App.js";

function expectActiveBeat(beat: "DOCKSIDE" | "COMMS" | "TRANSIT" | "ARRIVAL"): void {
  expect(screen.getByTestId(`beat-${beat}`).getAttribute("aria-current")).toBe("step");
}

describe("M0-09 demo turn integration", () => {
  it("drives the content script through the real shared-screen shell", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /I am Zhan/i }));

    expectActiveBeat("DOCKSIDE");
    expect(screen.getByTestId("main-panel").textContent).toBe(
      "Dockside systems are open. Twenty tons of machine parts are aboard. Manifest M1 is filed. The hold has accepted all three statements.",
    );

    const advance = screen.getByRole("button", { name: "Advance demo turn" });
    const ticker = screen.getByRole("list", { name: "ship's log" });
    fireEvent.click(advance);
    expectActiveBeat("COMMS");
    expect(screen.getByTestId("main-panel").textContent).toContain("Comms window open");
    expect(within(ticker).getByText("cargo.loaded")).toBeTruthy();

    fireEvent.click(advance);
    expectActiveBeat("TRANSIT");
    expect(screen.getByTestId("main-panel").textContent).toContain("Jump plotted from Regina to Vantage");

    fireEvent.click(advance);
    expectActiveBeat("ARRIVAL");
    expect(screen.getByTestId("main-panel").textContent).toContain("Reach Consolidated has paid for eighteen crates");
    expect(within(ticker).getByText("jump.plotted")).toBeTruthy();

    fireEvent.click(advance);
    expectActiveBeat("DOCKSIDE");
    expect(within(ticker).getByText("sale.settled")).toBeTruthy();
  });
});
