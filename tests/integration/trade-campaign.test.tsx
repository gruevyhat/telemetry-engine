// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { App } from "../../packages/ui-shared/src/App.js";

function expectActiveBeat(beat: "DOCKSIDE" | "COMMS" | "TRANSIT" | "ARRIVAL"): void {
  expect(screen.getByTestId(`beat-${beat}`).getAttribute("aria-current")).toBe("step");
}

describe("M1-13/M1-14 trade-campaign integration", () => {
  it("drives the real trade-campaign content script, including its check step, through the real shared-screen shell", async () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /I am Zhan/i }));

    expectActiveBeat("DOCKSIDE");
    expect(screen.getByRole("list", { name: "market feed" })).toBeTruthy();
    expect(screen.getByTestId("feed-line-0").textContent).toMatch(/machine-parts|refined-ore/);

    const advance = () => screen.getByRole("button", { name: "Advance turn" });
    const ticker = screen.getByRole("list", { name: "ship's log" });
    fireEvent.click(advance()); // resolves t1-dockside's generate step, lands on COMMS
    await waitFor(() => expectActiveBeat("COMMS"));
    expect(within(ticker).getByText("purchase.settled")).toBeTruthy();

    fireEvent.click(advance()); // resolves t1-comms (no-op stub), lands on the TRANSIT check step
    await waitFor(() => expectActiveBeat("TRANSIT"));
    const rollInput = screen.getByRole("spinbutton", { name: "roll total" });
    fireEvent.change(rollInput, { target: { value: "9" } }); // difficulty is 7 -> onSuccess
    fireEvent.click(screen.getByRole("button", { name: "Submit roll" }));
    await waitFor(() => expect(screen.getByTestId("main-panel").textContent).toContain("flown clean"));

    fireEvent.click(advance()); // resolves the check's onSuccess branch, commits jump.plotted, lands on ARRIVAL
    await waitFor(() => expectActiveBeat("ARRIVAL"));
    expect(within(ticker).getByText("jump.plotted")).toBeTruthy();

    fireEvent.click(advance()); // resolves t1-arrival, commits sale.settled, auto-skips into turn 2's DOCKSIDE
    await waitFor(() => expectActiveBeat("DOCKSIDE"));
    expect(within(ticker).getByText("sale.settled")).toBeTruthy();
    expect(screen.getByTestId("status-funds").textContent).not.toBe("Cr0");
  });
});
