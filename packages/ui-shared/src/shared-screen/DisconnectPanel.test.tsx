// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DisconnectPanel } from "./DisconnectPanel.js";

afterEach(cleanup);

describe("DisconnectPanel [M2-13, INV-14]", () => {
  it("shows the paused state and the three offered continuations", () => {
    render(
      <DisconnectPanel
        playerName="Deuce"
        remainingSeconds={17}
        onWaitForReconnect={() => {}}
        onContinueByHotseat={() => {}}
        onExportSave={() => {}}
      />,
    );
    expect(screen.getByText("Deuce disconnected with 00:17 remaining.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Wait for reconnect" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Continue by hotseat" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Export save" })).toBeTruthy();
  });

  it("invokes the matching callback for each choice", () => {
    const onWaitForReconnect = vi.fn();
    const onContinueByHotseat = vi.fn();
    const onExportSave = vi.fn();
    render(
      <DisconnectPanel
        playerName="Deuce"
        remainingSeconds={17}
        onWaitForReconnect={onWaitForReconnect}
        onContinueByHotseat={onContinueByHotseat}
        onExportSave={onExportSave}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Continue by hotseat" }));
    expect(onContinueByHotseat).toHaveBeenCalledTimes(1);
    expect(onWaitForReconnect).not.toHaveBeenCalled();
    expect(onExportSave).not.toHaveBeenCalled();
  });
});
