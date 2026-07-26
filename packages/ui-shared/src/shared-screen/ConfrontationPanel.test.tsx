// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createKindRegistry, createLedger, createPhaseInterpreter, KINDS_V0, loadPhaseScript } from "@telemetry/engine";
import { ConfrontationPanel } from "./ConfrontationPanel.js";

const T = { day: 15, slot: "ARRIVAL" as const };
const SCRIPT = loadPhaseScript({ frame: "confrontation", start: "declare", steps: [{ id: "declare", kind: "confrontation", next: "declare" }] });
const LABELS = { "pc:zhan": "Zhan", "pc:deuce": "Deuce", "pc:brennan": "Brennan" };

function fixture() {
  const ledger = createLedger(createKindRegistry(KINDS_V0));
  const agenda = ledger.append({ t: T, kind: "agenda.dealt", actor: { kind: "referee", id: "referee" }, payload: { playerId: "pc:deuce", result: false } });
  const objective = ledger.append({ t: T, kind: "objective.assigned", actor: { kind: "referee", id: "referee" }, payload: { playerId: "pc:deuce", objectiveId: "routine-objective", successCondition: {} }, visibility: { level: "private", playerIds: ["pc:deuce"] } });
  const interpreter = createPhaseInterpreter(ledger, SCRIPT);
  return { ledger, agenda, objective, interpreter };
}

describe("ConfrontationPanel [M2-08, INV-6/12/13]", () => {
  it("invokes an accusation command, then shows target, countdown, and per-player cumulative votes", () => {
    const onAccuse = vi.fn();
    const f = fixture();
    const view = render(<ConfrontationPanel facts={f.ledger.all()} remainingSeconds={300} playerLabels={LABELS} accusationTargets={["pc:deuce", "pc:brennan"]} onAccuse={onAccuse} />);
    fireEvent.change(screen.getByRole("combobox", { name: "accusation target" }), { target: { value: "pc:deuce" } });
    fireEvent.click(screen.getByRole("button", { name: "Accuse" }));
    expect(onAccuse).toHaveBeenCalledWith("pc:deuce");

    f.ledger.append({ t: T, kind: "confrontation.opened", actor: { kind: "pc", id: "pc:zhan" }, payload: { declarer: "pc:zhan", mode: "accusation", target: "pc:deuce" } });
    f.interpreter.resolveConfrontation({ t: T, declarer: "pc:zhan", target: { kind: "pc", id: "pc:deuce" }, eligiblePlayerIds: ["pc:zhan", "pc:deuce", "pc:brennan"], ballots: { "pc:zhan": true }, objectiveFactId: f.objective.id, contents: "LOYAL" });
    view.rerender(<ConfrontationPanel facts={f.ledger.all()} remainingSeconds={299} playerLabels={LABELS} accusationTargets={["pc:deuce", "pc:brennan"]} onAccuse={onAccuse} />);
    expect(screen.getByRole("heading", { name: "Confrontation" })).toBeTruthy();
    expect(screen.getByText("04:59")).toBeTruthy();
    expect(screen.getByText("Zhan accuses Deuce.")).toBeTruthy();
    expect(screen.getByTestId("ballot-pc:zhan").textContent).toContain("Yes");
    expect(screen.getByTestId("ballot-pc:deuce").textContent).toContain("Waiting");
  });

  it("never renders private envelope or agenda material before a carried vote", () => {
    const f = fixture();
    f.ledger.append({ t: T, kind: "confrontation.opened", actor: { kind: "pc", id: "pc:zhan" }, payload: { declarer: "pc:zhan", mode: "accusation", target: "pc:deuce" } });
    f.interpreter.resolveConfrontation({ t: T, declarer: "pc:zhan", target: { kind: "pc", id: "pc:deuce" }, eligiblePlayerIds: ["pc:zhan", "pc:deuce", "pc:brennan"], ballots: { "pc:zhan": true }, objectiveFactId: f.objective.id, contents: "LOYAL" });
    const { container } = render(<ConfrontationPanel facts={f.ledger.all()} remainingSeconds={240} playerLabels={LABELS} accusationTargets={[]} onAccuse={() => undefined} />);
    expect(container.textContent).not.toContain("LOYAL");
    expect(container.textContent).not.toContain("routine-objective");
    expect(container.textContent).not.toContain("agenda.dealt");
  });

  it("shows only a committed public carried or failed result and restores it after remount", () => {
    const carried = fixture();
    carried.ledger.append({ t: T, kind: "confrontation.opened", actor: { kind: "pc", id: "pc:zhan" }, payload: { declarer: "pc:zhan", mode: "accusation", target: "pc:deuce" } });
    carried.interpreter.resolveConfrontation({ t: T, declarer: "pc:zhan", target: { kind: "pc", id: "pc:deuce" }, eligiblePlayerIds: ["pc:zhan", "pc:deuce", "pc:brennan"], ballots: { "pc:zhan": true, "pc:deuce": false, "pc:brennan": true }, objectiveFactId: carried.objective.id, contents: "LOYAL" });
    const first = render(<ConfrontationPanel facts={carried.ledger.all()} remainingSeconds={121} playerLabels={LABELS} accusationTargets={[]} onAccuse={() => undefined} />);
    expect(screen.getByTestId("confrontation-result").textContent).toBe("The vote carries. Deuce is burned. Envelope: LOYAL.");
    first.unmount();
    render(<ConfrontationPanel facts={carried.ledger.all()} remainingSeconds={121} playerLabels={LABELS} accusationTargets={[]} onAccuse={() => undefined} />);
    expect(screen.getByText("02:01")).toBeTruthy();
    expect(screen.getByTestId("confrontation-result").textContent).toBe("The vote carries. Deuce is burned. Envelope: LOYAL.");

    const failed = fixture();
    failed.ledger.append({ t: T, kind: "confrontation.opened", actor: { kind: "pc", id: "pc:zhan" }, payload: { declarer: "pc:zhan", mode: "accusation", target: "pc:deuce" } });
    failed.interpreter.resolveConfrontation({ t: T, declarer: "pc:zhan", target: { kind: "pc", id: "pc:deuce" }, eligiblePlayerIds: ["pc:zhan", "pc:deuce", "pc:brennan"], ballots: { "pc:zhan": true, "pc:deuce": false, "pc:brennan": false }, objectiveFactId: failed.objective.id, contents: "LOYAL" });
    render(<ConfrontationPanel facts={failed.ledger.all()} remainingSeconds={0} playerLabels={LABELS} accusationTargets={[]} onAccuse={() => undefined} />);
    expect(screen.getByText("The vote fails. One yes, two no.")).toBeTruthy();
  });

  it("keeps visible copy TTS-safe", () => {
    const f = fixture();
    f.ledger.append({ t: T, kind: "confrontation.opened", actor: { kind: "pc", id: "pc:zhan" }, payload: { declarer: "pc:zhan", mode: "accusation", target: "pc:deuce" } });
    const { container } = render(<ConfrontationPanel facts={f.ledger.all()} remainingSeconds={300} playerLabels={LABELS} accusationTargets={[]} onAccuse={() => undefined} />);
    expect(container.textContent).toMatchInlineSnapshot(`"Confrontation05:00Zhan accuses Deuce.Explicit actions and votes are logged."`);
    expect(container.textContent).not.toMatch(/[!…]/);
  });
});
