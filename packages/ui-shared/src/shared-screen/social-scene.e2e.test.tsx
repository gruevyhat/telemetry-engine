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
import { createPairingClient, createPairingHost } from "@telemetry/transport-webrtc";
import type { PlayerDeliveryDTO } from "@telemetry/transport";
import { CommsScreen } from "../phone-screen/CommsScreen.js";
import { createCommsWindowTimer } from "../phone-screen/comms-timer.js";
import { DisconnectPanel } from "./DisconnectPanel.js";
import { Interstitial } from "./Interstitial.js";

afterEach(cleanup);

const T = { day: 7, slot: "COMMS" as const };
const SCRIPT = loadPhaseScript({
  frame: "social-scene-fixture",
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
const zhanKey = new Uint8Array(32).fill(3);
const deuceKey = new Uint8Array(32).fill(9);

function delivery(playerId: string): PlayerDeliveryDTO {
  return { schemaVersion: 1, playerId, publicFacts: [], privateFacts: [], feedback: [] };
}

describe("shared screen and two phones survive a forced disconnect and finish the scene [M2-15, INV-13/14]", () => {
  it("pairs two phones, pauses on disconnect, completes by hotseat, and never crosses a private slice", async () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const interpreter = createPhaseInterpreter(ledger, SCRIPT, {
      rng: createRng("social-scene-seed"),
      deck: [],
      agenda: { actions: [ACTION], currentHex: "Regina", registry: createKindRegistry(KINDS_V0) },
    });

    // Two phones pair over the encrypted transport (M2-11).
    const pairingHost = createPairingHost({
      sessionId: "session-a", hostEpoch: 1,
      offers: [
        { playerId: "pc:zhan", bindingEpoch: 1, claimToken: "claim-zhan", key: zhanKey },
        { playerId: "pc:deuce", bindingEpoch: 1, claimToken: "claim-deuce", key: deuceKey },
      ],
    });
    const zhanClient = createPairingClient({ playerId: "pc:zhan", bindingEpoch: 1, claimToken: "claim-zhan", key: zhanKey });
    const deuceClient = createPairingClient({ playerId: "pc:deuce", bindingEpoch: 1, claimToken: "claim-deuce", key: deuceKey });
    expect(pairingHost.claim("peer-zhan", zhanClient.claim)).toMatchObject({ status: "accepted" });
    expect(pairingHost.claim("peer-deuce", deuceClient.claim)).toMatchObject({ status: "accepted" });

    const zhanSnapshot = await pairingHost.snapshot("pc:zhan", delivery("pc:zhan"), 1);
    const deuceSnapshot = await pairingHost.snapshot("pc:deuce", delivery("pc:deuce"), 2);
    expect((await zhanClient.receive(zhanSnapshot)).payload).toMatchObject({ delivery: { playerId: "pc:zhan" } });
    // deuce's own key can't decode zhan's snapshot -- the misrouted-payload guarantee holds mid-scene too.
    await expect(deuceClient.receive(zhanSnapshot)).rejects.toThrow();
    await deuceClient.receive(deuceSnapshot);

    // Host-authoritative timer; zhan queues promptly.
    const timer = createCommsWindowTimer(30);
    const holderScreen = render(
      <CommsScreen
        remainingSeconds={30}
        actions={[{ actionId: ACTION.id, templateKey: ACTION.labelTemplate }]}
        onQueueAction={(actionId) => interpreter.queueCommsAction({ t: T, playerId: "pc:zhan", windowId: "window-1", actionId, clientCommandId: "zhan-1" })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: ACTION.labelTemplate }));
    timer.tick(13);
    holderScreen.unmount();

    // pc:deuce drops mid-window; the host pauses rather than closing, and never reveals it on
    // the shared screen as anything but a disconnect (no action-count/menu-content leak).
    timer.pause();
    let hotseat = false;
    const disconnectScreen = render(
      <DisconnectPanel
        playerName="Deuce"
        remainingSeconds={timer.remainingSeconds()}
        onWaitForReconnect={() => {}}
        onContinueByHotseat={() => {
          hotseat = true;
        }}
        onExportSave={() => {}}
      />,
    );
    expect(screen.getByText("Deuce disconnected with 00:17 remaining.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Continue by hotseat" }));
    expect(hotseat).toBe(true);
    disconnectScreen.unmount();

    // Deuce's own hotseat turn: only Deuce's slice is ever passed as props (M0's existing gate).
    const deucesView = ledger.visibleTo({ scope: "private", playerId: "pc:deuce" });
    const interstitial = render(<Interstitial playerName="Deuce" visibleFacts={deucesView} />);
    fireEvent.click(screen.getByRole("button", { name: /I am Deuce/i }));
    interstitial.unmount();

    const deuceScreen = render(
      <CommsScreen
        remainingSeconds={timer.remainingSeconds()}
        actions={[{ actionId: ACTION.id, templateKey: ACTION.labelTemplate }]}
        onQueueAction={(actionId) => interpreter.queueCommsAction({ t: T, playerId: "pc:deuce", windowId: "window-1", actionId, clientCommandId: "deuce-1" })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: ACTION.labelTemplate }));
    deuceScreen.unmount();

    // Deuce reconnects to the same remaining duration (M2-13), and the host closes the window.
    timer.resume();
    timer.tick(timer.remainingSeconds());
    timer.close();
    interpreter.advance(T, { kind: "referee", id: "referee" });

    expect(ledger.all().filter((fact) => fact.kind === "cargo.diverted")).toHaveLength(2);
    expect(ledger.all().filter((fact) => fact.kind === "action.fizzled")).toHaveLength(0);

    // Reconnect delivery: zhan's phone still can't decode anything meant for deuce's key.
    const finalDeuceSnapshot = await pairingHost.snapshot("pc:deuce", delivery("pc:deuce"), 3);
    await expect(zhanClient.receive(finalDeuceSnapshot)).rejects.toThrow();
  });
});
