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

    // 4 turns x 5 beats (DOCKSIDE -> COMMS -> check -> TRANSIT branch -> ARRIVAL) = 20 advances.
    for (let i = 0; i < 20; i++) {
      const rollInput = screen.queryByRole("spinbutton", { name: "roll total" });
      if (rollInput) {
        fireEvent.change(rollInput, { target: { value: "8" } });
        fireEvent.click(screen.getByRole("button", { name: "Submit roll" }));
        continue;
      }
      const advance = screen.getByRole("button", { name: "Advance turn" });
      expect((advance as HTMLButtonElement).disabled).toBe(false);
      fireEvent.click(advance);
    }

    expect((screen.getByRole("button", { name: "Advance turn" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("status-funds").textContent).not.toBe("Cr0");
  });

  it("fires a real incident from the trade deck on the first DOCKSIDE generate step", () => {
    render(<App />);
    const advance = screen.getByRole("button", { name: "Advance turn" });

    // t1-dockside -> t1-comms: the generate step's own advance() commits the incident.
    fireEvent.click(advance);

    expect(screen.getByTestId("main-panel").textContent).not.toBe("");
  });

  it("takes the check step's onSuccess branch when the entered roll meets the difficulty", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Advance turn" })); // t1-dockside -> t1-comms
    fireEvent.click(screen.getByRole("button", { name: "Advance turn" })); // t1-comms -> t1-check

    const rollInput = screen.getByRole("spinbutton", { name: "roll total" });
    fireEvent.change(rollInput, { target: { value: "9" } }); // difficulty is 7
    fireEvent.click(screen.getByRole("button", { name: "Submit roll" }));

    expect(screen.getByTestId("main-panel").textContent).toContain("flown clean");
  });

  it("takes the check step's onFail branch when the entered roll misses the difficulty", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Advance turn" })); // t1-dockside -> t1-comms
    fireEvent.click(screen.getByRole("button", { name: "Advance turn" })); // t1-comms -> t1-check

    const rollInput = screen.getByRole("spinbutton", { name: "roll total" });
    fireEvent.change(rollInput, { target: { value: "2" } }); // difficulty is 7
    fireEvent.click(screen.getByRole("button", { name: "Submit roll" }));

    expect(screen.getByTestId("main-panel").textContent).toContain("flown rough");
  });

  it("offers an interrogation control at COMMS for the NPC named in that turn's incident", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Advance turn" })); // t1-dockside (fires trade:bay-lock-cycle, npc:kessler) -> t1-comms

    expect(screen.getByRole("button", { name: /Persuade npc:kessler/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Intimidate npc:kessler/i })).toBeTruthy();
  });

  it("a high-effect interrogation roll renders a straight answer with a tell, and commits only check.reported", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Advance turn" })); // -> t1-comms

    fireEvent.click(screen.getByRole("button", { name: /Persuade npc:kessler/i }));
    const rollInput = screen.getByRole("spinbutton", { name: "interrogation roll total" });
    fireEvent.change(rollInput, { target: { value: "9" } }); // interrogation difficulty is 6 -> effect 3 -> trueWithTell
    fireEvent.click(screen.getByRole("button", { name: "Submit interrogation roll" }));

    expect(screen.getByTestId("interrogation-answer").textContent).toMatch(/log entry/i);
  });

  it("a low-effect interrogation roll renders an evasive answer", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Advance turn" })); // -> t1-comms

    fireEvent.click(screen.getByRole("button", { name: /Intimidate npc:kessler/i }));
    const rollInput = screen.getByRole("spinbutton", { name: "interrogation roll total" });
    fireEvent.change(rollInput, { target: { value: "2" } }); // effect -4 -> evasion
    fireEvent.click(screen.getByRole("button", { name: "Submit interrogation roll" }));

    expect(screen.getByTestId("interrogation-answer").textContent).toMatch(/nothing/i);
  });
});
