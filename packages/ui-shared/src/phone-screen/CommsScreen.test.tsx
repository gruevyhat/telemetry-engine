// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CommsScreen } from "./CommsScreen.js";

afterEach(cleanup);

describe("phone COMMS shell [M2-12, INV-13]", () => {
  it("shows the same shell and lock text for a routine client and an agenda holder, menu only for the holder", () => {
    const { unmount } = render(<CommsScreen remainingSeconds={30} actions={[]} onQueueAction={() => {}} />);
    expect(screen.getByTestId("comms-shell")).toBeTruthy();
    expect(screen.getByLabelText("comms countdown").textContent).toBe("00:30");
    expect(screen.getByText("Window remains locked.")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    unmount();

    render(
      <CommsScreen
        remainingSeconds={30}
        actions={[{ actionId: "agenda:skim", templateKey: "agenda.skim.label" }]}
        onQueueAction={() => {}}
      />,
    );
    expect(screen.getByTestId("comms-shell")).toBeTruthy();
    expect(screen.getByLabelText("comms countdown").textContent).toBe("00:30");
    expect(screen.getByText("Window remains locked.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "agenda.skim.label" })).toBeTruthy();
  });

  it("queues the selected action id when the holder taps it", () => {
    const onQueueAction = vi.fn();
    render(
      <CommsScreen
        remainingSeconds={12}
        actions={[{ actionId: "agenda:skim", templateKey: "agenda.skim.label" }]}
        onQueueAction={onQueueAction}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "agenda.skim.label" }));
    expect(onQueueAction).toHaveBeenCalledTimes(1);
    expect(onQueueAction).toHaveBeenCalledWith("agenda:skim");
  });
});
