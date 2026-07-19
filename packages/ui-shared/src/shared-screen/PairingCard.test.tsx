// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PairingCard, decodeManualPairingCode, decodePairingFragment } from "./PairingCard.js";

const material = { origin: "https://table.example/game", protocolVersion: 1 as const, sessionId: "session-a", playerId: "pc:zhan", bindingEpoch: 2, claimToken: "claim-token-long", transportKey: new Uint8Array(32).fill(5) };

describe("private QR pairing card [M2-11, INV-13]", () => {
  it("QR fragment and full-length manual code represent identical secret material behind a hand-to gate", async () => {
    render(<PairingCard playerName="Zhan" material={material} qrEncoder={async (value) => `data:image/mock,${encodeURIComponent(value)}`} />);
    expect(screen.queryByAltText("Zhan phone pairing QR code")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "I am Zhan. Show private pairing card." }));
    const image = await screen.findByAltText("Zhan phone pairing QR code");
    const qrValue = decodeURIComponent(image.getAttribute("src")!.split(",")[1]!);
    const manual = screen.getByTestId("manual-pairing-code").textContent!;
    expect(decodePairingFragment(qrValue)).toEqual(decodeManualPairingCode(manual));
    expect(decodePairingFragment(qrValue)).toMatchObject({ sessionId: "session-a", playerId: "pc:zhan", bindingEpoch: 2, claimToken: "claim-token-long" });
    expect(screen.getByText(/private full-length code/i)).toBeTruthy();
  });
});
