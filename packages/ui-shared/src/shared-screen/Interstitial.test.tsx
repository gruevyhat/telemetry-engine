// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createKindRegistry, createLedger, KINDS_V0, type GameTime } from "@telemetry/engine";
import { Interstitial } from "./Interstitial.js";

const T: GameTime = { day: 1, slot: "COMMS" };
const ZHAN = { kind: "pc", id: "pc:zhan" } as const;
const DEUCE = { kind: "pc", id: "pc:deuce" } as const;

describe("Interstitial [Spec section 16, INV-13]", () => {
  it("never renders another player's private slice", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const zhansFact = ledger.append({
      t: T,
      kind: "agenda.actionTaken",
      actor: ZHAN,
      payload: { playerId: "pc:zhan", windowId: "window-1", actionId: "skim-crate", clientCommandId: "zhan-1" },
      visibility: { level: "private", playerIds: ["pc:zhan"] },
    });
    const deucesFact = ledger.append({
      t: T,
      kind: "agenda.actionTaken",
      actor: DEUCE,
      payload: { playerId: "pc:deuce", windowId: "window-1", actionId: "forge-manifest", clientCommandId: "deuce-1" },
      visibility: { level: "private", playerIds: ["pc:deuce"] },
    });

    // Only Zhan's slice is ever handed to the component as props, so it structurally cannot
    // render Deuce's fact, since it was never given it.
    const zhansView = ledger.visibleTo({ scope: "private", playerId: "pc:zhan" });
    expect(zhansView.some((f) => f.id === deucesFact.id)).toBe(false);

    render(<Interstitial playerName="Zhan" visibleFacts={zhansView} />);
    fireEvent.click(screen.getByRole("button", { name: /I am Zhan/i }));

    expect(screen.getByTestId(`private-entry-${zhansFact.id}`)).toBeTruthy();
    expect(screen.queryByTestId(`private-entry-${deucesFact.id}`)).toBeNull();
  });

  it("shows the hand-to-player gate before acknowledgement, not any private content", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const zhansFact = ledger.append({
      t: T,
      kind: "agenda.actionTaken",
      actor: ZHAN,
      payload: { playerId: "pc:zhan", windowId: "window-1", actionId: "skim-crate", clientCommandId: "zhan-1" },
      visibility: { level: "private", playerIds: ["pc:zhan"] },
    });

    render(<Interstitial playerName="Zhan" visibleFacts={ledger.visibleTo({ scope: "private", playerId: "pc:zhan" })} />);

    expect(screen.getByRole("dialog", { name: "hand-to-player" })).toBeTruthy();
    expect(screen.queryByTestId(`private-entry-${zhansFact.id}`)).toBeNull();
  });
});
