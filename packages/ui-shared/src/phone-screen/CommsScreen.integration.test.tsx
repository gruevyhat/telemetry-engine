// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  createKindRegistry,
  createLedger,
  createPhaseInterpreter,
  createRng,
  KINDS_V0,
  loadPhaseScript,
  type AgendaActionContent,
} from "@telemetry/engine";
import { CommsScreen } from "./CommsScreen.js";

const T = { day: 7, slot: "COMMS" as const };
const SCRIPT = loadPhaseScript({
  frame: "comms-ui-fixture",
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
  proposals: [],
  implies: [],
  payout: 1,
  exposure: { clockId: "heat", delta: 1 },
};

describe("phone COMMS submission [M2-12, INV-6/13]", () => {
  it("a clicked action durably queues once through the real interpreter; a routine client's identical shell has nothing to click", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const interpreter = createPhaseInterpreter(ledger, SCRIPT, {
      rng: createRng("comms-ui-seed"),
      deck: [],
      agenda: { actions: [ACTION], currentHex: "Regina", registry: createKindRegistry(KINDS_V0) },
    });
    const onQueueAction = (actionId: string) =>
      interpreter.queueCommsAction({ t: T, playerId: "pc:zhan", windowId: "window-1", actionId, clientCommandId: "zhan-window-1" });

    const holder = render(
      <CommsScreen remainingSeconds={30} actions={[{ actionId: ACTION.id, templateKey: ACTION.labelTemplate }]} onQueueAction={onQueueAction} />,
    );
    const button = screen.getByRole("button", { name: ACTION.labelTemplate });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(ledger.all().filter((fact) => fact.kind === "agenda.actionTaken")).toHaveLength(1);
    holder.unmount();

    render(
      <CommsScreen
        remainingSeconds={30}
        actions={[]}
        onQueueAction={() => {
          throw new Error("a routine client has nothing to queue");
        }}
      />,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Window remains locked.")).toBeTruthy();
  });
});
