// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decodeManualPairingCode, type EnvelopeChannel } from "@telemetry/transport-webrtc";
import { SocialApp } from "./SocialApp.js";

vi.mock("qrcode", () => ({ default: { toDataURL: async (value: string) => `data:image/mock,${encodeURIComponent(value)}` } }));

afterEach(cleanup);

function noopChannel(): EnvelopeChannel {
  return { send: () => {}, onReceive: () => {} };
}

describe("SocialApp [M2-15b]", () => {
  it("shows one pairing card per unclaimed seat, revealing a real decodable manual code", async () => {
    let sessionIdSeen = "";
    render(<SocialApp createChannel={(sessionId) => { sessionIdSeen = sessionId; return noopChannel(); }} />);

    expect(screen.getByText("Hand the device to Zhan.")).toBeTruthy();
    expect(screen.getByText("Hand the device to Deuce.")).toBeTruthy();
    expect(screen.getByText("Hand the device to Brennan.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "I am Zhan. Show private pairing card." }));
    await waitFor(() => expect(screen.getByTestId("manual-pairing-code")).toBeTruthy());

    const code = screen.getByTestId("manual-pairing-code").textContent!;
    const decoded = decodeManualPairingCode(code);
    expect(decoded.playerId).toBe("pc:zhan");
    expect(decoded.sessionId).toBe(sessionIdSeen);
    expect(decoded.players.map((player) => player.playerId).sort()).toEqual(["pc:brennan", "pc:deuce", "pc:zhan"]);

    // Deal/close controls stay hidden until every seat has claimed -- the operator can't
    // accidentally deal into an empty table.
    expect(screen.queryByRole("button", { name: "Deal agendas" })).toBeNull();
  });
});
