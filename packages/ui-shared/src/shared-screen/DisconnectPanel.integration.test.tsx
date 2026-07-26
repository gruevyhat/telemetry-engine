// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  createKindRegistry,
  createLedger,
  createPhaseInterpreter,
  createRng,
  KINDS_V0,
  loadPhaseScript,
  type AgendaActionContent,
} from "@telemetry/engine";
import { CommsScreen } from "../phone-screen/CommsScreen.js";
import { DisconnectPanel } from "./DisconnectPanel.js";
import { Interstitial } from "./Interstitial.js";

afterEach(cleanup);

const T = { day: 7, slot: "COMMS" as const };
const SCRIPT = loadPhaseScript({
  frame: "hotseat-fixture",
  start: "comms",
  steps: [
    { id: "comms", kind: "commsWindow" as const, next: "after" },
    { id: "after", kind: "announce" as const, next: "comms" },
  ],
});
const ACTION: AgendaActionContent = {
  id: "agenda:skim",
  labelTemplate: "agenda.skim.label",
  access: { kind: "aboard" },
  proposals: [{ kind: "cargo.diverted", actor: { ref: "self" }, payload: { lotId: "L1", qty: 1, channel: "private" } }],
  implies: [],
  payout: 1,
  exposure: { clockId: "heat", delta: 1 },
};

describe("declined reconnect completes by hotseat without cross-player leakage [M2-13, INV-13/14]", () => {
  it("routes the disconnected player's own turn through the existing hand-to interstitial and resolves the window", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const interpreter = createPhaseInterpreter(ledger, SCRIPT, {
      rng: createRng("hotseat-seed"),
      deck: [],
      agenda: { actions: [ACTION], currentHex: "Regina", registry: createKindRegistry(KINDS_V0) },
    });
    // pc:zhan already queued before pc:deuce disconnected.
    interpreter.queueCommsAction({ t: T, playerId: "pc:zhan", windowId: "window-1", actionId: ACTION.id, clientCommandId: "zhan-1" });
    const zhansNote = ledger.append({
      t: T,
      kind: "npc.statement",
      actor: { kind: "npc", id: "n1" },
      payload: { npcId: "n1", topic: "zhan-private-note" },
      visibility: { level: "private", playerIds: ["pc:zhan"] },
    });

    let hotseat = false;
    render(
      <DisconnectPanel
        playerName="Deuce"
        remainingSeconds={17}
        onWaitForReconnect={() => {}}
        onContinueByHotseat={() => {
          hotseat = true;
        }}
        onExportSave={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue by hotseat" }));
    expect(hotseat).toBe(true);
    cleanup();

    // Deuce's hotseat turn: only Deuce's own slice is ever passed as props.
    const deucesView = ledger.visibleTo({ scope: "private", playerId: "pc:deuce" });
    expect(deucesView.some((fact) => fact.id === zhansNote.id)).toBe(false);

    render(<Interstitial playerName="Deuce" visibleFacts={deucesView} />);
    fireEvent.click(screen.getByRole("button", { name: /I am Deuce/i }));
    expect(screen.queryByTestId(`private-entry-${zhansNote.id}`)).toBeNull();

    render(
      <CommsScreen
        remainingSeconds={17}
        actions={[{ actionId: ACTION.id, templateKey: ACTION.labelTemplate }]}
        onQueueAction={(actionId) =>
          interpreter.queueCommsAction({ t: T, playerId: "pc:deuce", windowId: "window-1", actionId, clientCommandId: "deuce-1" })
        }
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: ACTION.labelTemplate }));

    interpreter.advance(T, { kind: "referee", id: "referee" });

    expect(ledger.all().filter((fact) => fact.kind === "cargo.diverted")).toHaveLength(2);
    expect(ledger.all().filter((fact) => fact.kind === "action.fizzled")).toHaveLength(0);
  });
});
