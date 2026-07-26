import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createClientCommandReplayGuard, createReplayGuard, decryptMessage, encryptMessage, type ProtocolMessage } from "./index.js";

function message(sequence: number, messageId = `message-${sequence}`): ProtocolMessage {
  return {
    header: { protocolVersion: 1, sessionId: "session-a", hostEpoch: 1, bindingEpoch: 2, sequence, messageId, type: "state.snapshot" },
    payload: { delivery: { schemaVersion: 1, playerId: "pc:zhan", publicFacts: [], privateFacts: [], feedback: [] }, remainingSeconds: 30, paused: false },
  };
}

describe("scoped encrypted transport envelopes [M2-09, INV-13]", () => {
  it("cannot decrypt a payload with another player's key", async () => {
    await fc.assert(fc.asyncProperty(fc.uint8Array({ minLength: 32, maxLength: 32 }), fc.uint8Array({ minLength: 32, maxLength: 32 }), async (zhanKey, deuceKey) => {
      fc.pre(zhanKey.some((byte, index) => byte !== deuceKey[index]));
      const envelope = await encryptMessage(zhanKey, message(1));
      await expect(decryptMessage(deuceKey, envelope)).rejects.toThrow();
      expect(await decryptMessage(zhanKey, envelope)).toEqual(message(1));
    }), { numRuns: 20 });
  });

  it("binds the full header as authenticated data", async () => {
    const key = new Uint8Array(32).fill(7);
    const envelope = await encryptMessage(key, message(1));
    await expect(decryptMessage(key, { ...envelope, header: { ...envelope.header, bindingEpoch: 3 } })).rejects.toThrow();
  });

  it("accepts new messages, identifies exact duplicates, and rejects reuse or out-of-order ids deterministically", () => {
    const guard = createReplayGuard();
    expect(guard.accept(message(2).header)).toBe("accepted");
    expect(guard.accept(message(2).header)).toBe("duplicate");
    expect(guard.accept(message(1).header)).toBe("rejected");
    expect(guard.accept(message(3, "message-2").header)).toBe("rejected");
    expect(guard.accept(message(3).header)).toBe("accepted");
    const commands = createClientCommandReplayGuard();
    expect(commands.accept("pc:zhan", 2, 10)).toBe("accepted");
    expect(commands.accept("pc:zhan", 2, 11)).toBe("accepted");
    expect(commands.accept("pc:zhan", 2, 10)).toBe("duplicate");
    expect(commands.accept("pc:zhan", 2, 9)).toBe("rejected");
  });
});
