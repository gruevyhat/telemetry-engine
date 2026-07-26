// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  encodePairingPayload,
  groupManualCode,
  type EnvelopeChannel,
  type PairingMaterial,
} from "@telemetry/transport-webrtc";
import { PROTOCOL_VERSION } from "@telemetry/transport";
import { App } from "./App.js";
import { receivePairingEnvelope } from "./pairing-receive.js";

afterEach(cleanup);

const material: PairingMaterial = {
  origin: "https://example.test/telemetry-engine/",
  protocolVersion: PROTOCOL_VERSION,
  sessionId: "session-a",
  playerId: "pc:zhan",
  bindingEpoch: 1,
  claimToken: "claim-zhan",
  transportKey: new Uint8Array(32).fill(7),
  players: [
    { playerId: "pc:zhan", label: "Zhan" },
    { playerId: "pc:deuce", label: "Deuce" },
  ],
};

describe("phone pairing isolation [BL-11]", () => {
  it("joins the signaling room derived for its own seat", async () => {
    const channel: EnvelopeChannel = {
      send: vi.fn(),
      onReceive: vi.fn(),
    };
    const createChannel = vi.fn(() => channel);
    const code = groupManualCode(encodePairingPayload(material));

    render(<App createChannel={createChannel} />);
    fireEvent.change(screen.getByRole("textbox", { name: "pairing code" }), {
      target: { value: code },
    });
    fireEvent.click(screen.getByRole("button", { name: "Pair" }));

    await waitFor(() =>
      expect(createChannel).toHaveBeenCalledWith("session-a:pc%3Azhan"),
    );
  });

  it("classifies ciphertext for another seat as routine cross-talk", async () => {
    const client = {
      receive: vi.fn().mockRejectedValue(new DOMException("decrypt failed", "OperationError")),
    };

    await expect(
      receivePairingEnvelope(client, {
        header: {
          protocolVersion: PROTOCOL_VERSION,
          sessionId: "session-a",
          hostEpoch: 1,
          bindingEpoch: 1,
          sequence: 1,
          messageId: "wrong-seat",
          type: "pair.claim",
        },
        iv: "ab",
        ciphertext: "cd",
      }),
    ).resolves.toBeUndefined();
  });
});
