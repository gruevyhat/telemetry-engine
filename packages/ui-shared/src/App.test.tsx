// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createKindRegistry,
  createLedger,
  createPhaseInterpreter,
  loadPhaseScript,
  KINDS_V0,
  type PhaseScript,
} from "@telemetry/engine";
import { App, EVIDENCE_QUERY, runEvidenceInvestigation, runInterrogation } from "./App.js";

afterEach(cleanup);

const TRIVIAL_SCRIPT: PhaseScript = { frame: "test", start: "s", steps: [{ id: "s", kind: "announce", next: "s" }] };

describe("runInterrogation [M1-15, fact-kinds-v0.md §3]", () => {
  it("commits check.reported, npc.statement (table), and npc.truthTierAssigned (referee) linked by causes", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const interpreter = createPhaseInterpreter(ledger, loadPhaseScript(TRIVIAL_SCRIPT));
    const npc = { id: "npc:kessler", disposition: "naive" as const, tells: ["a tell"] };

    const answer = runInterrogation(ledger, interpreter, npc, "persuade", 9, { day: 7, slot: "COMMS" }, { kind: "pc", id: "pc:zhan" });

    const statement = ledger.all().find((f) => f.kind === "npc.statement");
    const tierAssignment = ledger.all().find((f) => f.kind === "npc.truthTierAssigned");
    expect(ledger.all().some((f) => f.kind === "check.reported")).toBe(true);
    expect(statement?.visibility).toEqual({ level: "table" });
    expect(tierAssignment?.visibility).toEqual({ level: "referee" });
    expect(tierAssignment?.causes).toEqual([statement?.id]);
    expect(answer.tier).toBe("trueWithTell"); // effect = 9 - 6 = 3
  });
});

const LOCK_CYCLED_FACT = {
  id: "f1",
  wall: 0,
  t: { day: 7, slot: "DOCKSIDE" as const },
  kind: "lock.cycled",
  actor: { kind: "npc" as const, id: "npc:kessler" },
  payload: { door: "aft-bay-door", codeClass: "CAPT-OVR", time: "0340" },
  visibility: { level: "referee" as const },
};

describe("runEvidenceInvestigation [M1-16, Spec §10.1]", () => {
  it("access failure narrates and stops -- commits nothing, no roll cost", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const deniedContext = {
      presence: { declarations: { "pc:zhan|7|DOCKSIDE": { kind: "hex" as const, hex: "Vantage" } } },
      actorId: "pc:zhan",
      day: 7,
      slot: "DOCKSIDE",
      heldGear: new Set<string>(),
      codeHolders: new Set<string>(),
      holdsPrisoner: false,
    };

    const plan = runEvidenceInvestigation(ledger, EVIDENCE_QUERY, [LOCK_CYCLED_FACT], 10, 6, { day: 7, slot: "DOCKSIDE" }, deniedContext);

    expect(plan.ok).toBe(false);
    expect(ledger.all()).toHaveLength(0);
  });

  it("access granted at low effect reveals non-identity fields only, never the identity field", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));

    const plan = runEvidenceInvestigation(ledger, EVIDENCE_QUERY, [LOCK_CYCLED_FACT], 8, 6, { day: 7, slot: "DOCKSIDE" });

    expect(plan.ok).toBe(true);
    const reveals = ledger.all().filter((f) => f.kind === "reveal");
    expect(reveals.every((f) => !(f.payload.fields as string[]).includes("actor"))).toBe(true);
  });

  it("access granted at high effect eventually reveals the identity field after non-identity fields are exhausted", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));

    const plan = runEvidenceInvestigation(ledger, EVIDENCE_QUERY, [LOCK_CYCLED_FACT], 10, 6, { day: 7, slot: "DOCKSIDE" });

    expect(plan.ok).toBe(true);
    const reveals = ledger.all().filter((f) => f.kind === "reveal");
    const allFields = reveals.flatMap((f) => f.payload.fields as string[]);
    expect(allFields).toContain("actor");
    expect(ledger.all().some((f) => f.kind === "clock.tick")).toBe(true);
  });
});

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

  it("a high-effect interrogation roll renders a straight answer with a tell, and leaves no npc.statement/truthTierAssigned in the public ticker", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Advance turn" })); // -> t1-comms

    fireEvent.click(screen.getByRole("button", { name: /Persuade npc:kessler/i }));
    const rollInput = screen.getByRole("spinbutton", { name: "interrogation roll total" });
    fireEvent.change(rollInput, { target: { value: "9" } }); // interrogation difficulty is 6 -> effect 3 -> trueWithTell
    fireEvent.click(screen.getByRole("button", { name: "Submit interrogation roll" }));

    expect(screen.getByTestId("interrogation-answer").textContent).toMatch(/log entry/i);
    // npc.statement is table-visibility and npc.truthTierAssigned is referee-visibility (fact-
    // kinds-v0.md §3) -- neither is "public", so neither belongs in the public ship's log.
    const ticker = screen.getByRole("list", { name: "ship's log" });
    expect(ticker.textContent).not.toContain("npc.statement");
    expect(ticker.textContent).not.toContain("npc.truthTierAssigned");
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

  it("offers an Investigate control at COMMS, and a submitted roll reveals fields into the public ticker", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "Advance turn" })); // t1-dockside -> t1-comms

    fireEvent.click(screen.getByRole("button", { name: "Investigate" }));
    const rollInput = screen.getByRole("spinbutton", { name: "evidence roll total" });
    fireEvent.change(rollInput, { target: { value: "10" } }); // difficulty 6 -> effect 4
    fireEvent.click(screen.getByRole("button", { name: "Submit evidence roll" }));

    // "reveal" is a public fact (kinds-v0.ts); it belongs in the public ship's log once committed.
    const ticker = screen.getByRole("list", { name: "ship's log" });
    expect(within(ticker).getByText("reveal")).toBeTruthy();
    expect(screen.getByTestId("evidence-reveal").textContent).toMatch(/door|codeClass|time|actor/);
  });
});
