// @vitest-environment jsdom
//
// Regression for BL-09: the ui-shared/ui-phone specs that render inside jsdom and call the real
// encryptMessage/decryptMessage path were silently red in CI (Node 24) since 2026-07-19, while
// this same protocol's node-environment tests (protocol.test.ts) stayed green throughout. The
// crypto logic was never wrong -- bufferOf() was handing WebCrypto a plain ArrayBuffer, and one
// jsdom/Node WebCrypto combination rejects that as a cross-realm instanceof mismatch even though
// the bytes are valid. This file pins the same round trip under the same jsdom environment so a
// future regression on that specific boundary fails here, not three layers up in a UI spec.
import { describe, expect, it } from "vitest";
import { decryptMessage, encryptMessage, type ProtocolMessage } from "./index.js";

function message(sequence: number): ProtocolMessage {
  return {
    header: { protocolVersion: 1, sessionId: "session-a", hostEpoch: 1, bindingEpoch: 2, sequence, messageId: `message-${sequence}`, type: "state.snapshot" },
    payload: { delivery: { schemaVersion: 1, playerId: "pc:zhan", publicFacts: [], privateFacts: [], feedback: [] }, remainingSeconds: 30, paused: false },
  };
}

describe("encryptMessage/decryptMessage under a jsdom test environment [BL-09]", () => {
  it("round-trips a message through the real WebCrypto path exposed by jsdom's global crypto", async () => {
    const key = new Uint8Array(32).fill(9);
    const envelope = await encryptMessage(key, message(1));
    await expect(decryptMessage(key, envelope)).resolves.toEqual(message(1));
  });
});
