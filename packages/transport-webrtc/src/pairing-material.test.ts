import { describe, expect, it } from "vitest";
import { decodeManualPairingCode, decodePairingFragment, encodePairingPayload, groupManualCode, type PairingMaterial } from "./pairing-material.js";

const material: PairingMaterial = {
  origin: "https://table.example/game",
  protocolVersion: 1,
  sessionId: "session-a",
  playerId: "pc:zhan",
  bindingEpoch: 2,
  claimToken: "claim-token-long",
  transportKey: new Uint8Array(32).fill(5),
  players: [{ playerId: "pc:zhan", label: "Zhan" }, { playerId: "pc:deuce", label: "Deuce" }],
};

describe("pairing material codec [M2-15b]", () => {
  it("round-trips through both the QR fragment and the grouped manual code identically", () => {
    const payload = encodePairingPayload(material);
    const pairingUrl = `${material.origin}#${payload}`;
    const manualCode = groupManualCode(payload);

    const fromFragment = decodePairingFragment(pairingUrl);
    const fromManual = decodeManualPairingCode(manualCode);
    expect(fromFragment).toEqual(fromManual);
    expect(fromFragment).toMatchObject({ sessionId: "session-a", playerId: "pc:zhan", bindingEpoch: 2, claimToken: "claim-token-long" });
    expect(fromFragment.transportKey).toEqual(material.transportKey);
    expect(fromFragment.players).toEqual(material.players);
  });

  it("rejects a fragment-less URL rather than silently decoding garbage", () => {
    expect(() => decodePairingFragment("https://table.example/game")).toThrow(/fragment/);
  });
});
