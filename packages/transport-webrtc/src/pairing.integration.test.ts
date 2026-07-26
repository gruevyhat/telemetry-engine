import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION, encryptMessage, type BoundHeader, type PlayerDeliveryDTO, type ProtocolMessage } from "@telemetry/transport";
import { createPairingClient, createPairingHost } from "./index.js";

const zhanKey = new Uint8Array(32).fill(3);
const deuceKey = new Uint8Array(32).fill(9);
const delivery = (playerId: string, marker: string): PlayerDeliveryDTO => ({ schemaVersion: 1, playerId, publicFacts: [], privateFacts: [{ id: `fact-${playerId}`, t: { day: 1, slot: "COMMS" }, kind: "objective.assigned", actor: { kind: "referee", id: "referee" }, payload: { marker }, scope: "private" }], feedback: [] });

describe("WebRTC pairing core [M2-11, INV-13]", () => {
  it("pairs two clients to distinct seats and reconnect snapshots converge", async () => {
    const host = createPairingHost({ sessionId: "session-a", hostEpoch: 1, offers: [
      { playerId: "pc:zhan", bindingEpoch: 1, claimToken: "claim-zhan", key: zhanKey },
      { playerId: "pc:deuce", bindingEpoch: 1, claimToken: "claim-deuce", key: deuceKey },
    ] });
    const zhan = createPairingClient({ playerId: "pc:zhan", bindingEpoch: 1, claimToken: "claim-zhan", key: zhanKey });
    const deuce = createPairingClient({ playerId: "pc:deuce", bindingEpoch: 1, claimToken: "claim-deuce", key: deuceKey });
    expect(host.claim("peer-zhan", zhan.claim)).toMatchObject({ status: "accepted", playerId: "pc:zhan" });
    expect(host.claim("peer-deuce", deuce.claim)).toMatchObject({ status: "accepted", playerId: "pc:deuce" });
    const zhanSnapshot = await host.snapshot("pc:zhan", delivery("pc:zhan", "ZHAN-PRIVATE"), 1);
    const deuceSnapshot = await host.snapshot("pc:deuce", delivery("pc:deuce", "DEUCE-PRIVATE"), 2);
    expect((await zhan.receive(zhanSnapshot)).payload).toMatchObject({ delivery: { playerId: "pc:zhan" } });
    expect((await deuce.receive(deuceSnapshot)).payload).toMatchObject({ delivery: { playerId: "pc:deuce" } });
    host.reconnect("pc:zhan", "peer-zhan-reconnected");
    expect(await zhan.receive(await host.snapshot("pc:zhan", delivery("pc:zhan", "ZHAN-PRIVATE"), 3))).toEqual(await zhan.receive(await host.snapshot("pc:zhan", delivery("pc:zhan", "ZHAN-PRIVATE"), 3)));
  });

  it("misrouted encrypted snapshots never reveal foreign-private payloads", async () => {
    const host = createPairingHost({ sessionId: "session-a", hostEpoch: 1, offers: [
      { playerId: "pc:zhan", bindingEpoch: 1, claimToken: "claim-zhan", key: zhanKey },
      { playerId: "pc:deuce", bindingEpoch: 1, claimToken: "claim-deuce", key: deuceKey },
    ] });
    const deuce = createPairingClient({ playerId: "pc:deuce", bindingEpoch: 1, claimToken: "claim-deuce", key: deuceKey });
    const zhanEnvelope = await host.snapshot("pc:zhan", delivery("pc:zhan", "ZHAN-PRIVATE"), 1);
    expect(JSON.stringify(zhanEnvelope)).not.toContain("ZHAN-PRIVATE");
    await expect(deuce.receive(zhanEnvelope)).rejects.toThrow();
  });

  it("routes an inbound client command to the right playerId by peerId, not by payload claim [INV-13]", async () => {
    const host = createPairingHost({ sessionId: "session-a", hostEpoch: 1, offers: [
      { playerId: "pc:zhan", bindingEpoch: 1, claimToken: "claim-zhan", key: zhanKey },
      { playerId: "pc:deuce", bindingEpoch: 1, claimToken: "claim-deuce", key: deuceKey },
    ] });
    const zhan = createPairingClient({ playerId: "pc:zhan", bindingEpoch: 1, claimToken: "claim-zhan", key: zhanKey });
    host.claim("peer-zhan", zhan.claim);
    host.claim("peer-deuce", createPairingClient({ playerId: "pc:deuce", bindingEpoch: 1, claimToken: "claim-deuce", key: deuceKey }).claim);

    const header: BoundHeader<"comms.queue"> = { protocolVersion: PROTOCOL_VERSION, sessionId: "session-a", hostEpoch: 1, bindingEpoch: 1, sequence: 1, messageId: "client-msg-1", type: "comms.queue" };
    const message: ProtocolMessage = { header, payload: { playerId: "pc:zhan", clientSequence: 1, clientCommandId: "zhan-1", windowId: "window-1", actionId: "agenda:skim" } };
    const envelope = await encryptMessage(zhanKey, message);

    const result = await host.receive("peer-zhan", envelope);
    expect(result).toMatchObject({ status: "accepted", playerId: "pc:zhan", message: { payload: { clientCommandId: "zhan-1" } } });

    // An unclaimed/unknown peer id can never be routed to any player's key.
    expect(await host.receive("peer-stranger", envelope)).toEqual({ status: "rejected", reasonCode: "unknown-peer" });

    // A ciphertext encrypted under a different binding's key never decrypts as zhan's, even if
    // sent claiming to come from zhan's peer id.
    const wrongKeyEnvelope = await encryptMessage(deuceKey, message);
    expect(await host.receive("peer-zhan", wrongKeyEnvelope)).toEqual({ status: "rejected", reasonCode: "decrypt-failed" });

    // An exact resend is idempotent (accepted again); a stale/reused sequence is rejected.
    expect((await host.receive("peer-zhan", envelope)).status).toBe("accepted");
    const staleEnvelope = await encryptMessage(zhanKey, { header: { ...header, messageId: "client-msg-0", sequence: 0 }, payload: message.payload });
    expect(await host.receive("peer-zhan", staleEnvelope)).toEqual({ status: "rejected", reasonCode: "replay" });
  });

  it("resolves an inbound pair.claim envelope to the right offer without knowing the peer id in advance, and treats a resend from a new peer id as reconnect", async () => {
    const host = createPairingHost({ sessionId: "session-a", hostEpoch: 1, offers: [
      { playerId: "pc:zhan", bindingEpoch: 1, claimToken: "claim-zhan", key: zhanKey },
      { playerId: "pc:deuce", bindingEpoch: 1, claimToken: "claim-deuce", key: deuceKey },
    ] });
    const claimHeader: BoundHeader<"pair.claim"> = { protocolVersion: PROTOCOL_VERSION, sessionId: "session-a", hostEpoch: 1, bindingEpoch: 1, sequence: 1, messageId: "claim-1", type: "pair.claim" };
    const zhanClaimEnvelope = await encryptMessage(zhanKey, { header: claimHeader, payload: { playerId: "pc:zhan", claimToken: "claim-zhan" } });

    // No offer's key decrypts noise -- an unrelated peer produces no attributable claim at all.
    const noise = await encryptMessage(new Uint8Array(32).fill(7), { header: claimHeader, payload: { playerId: "pc:zhan", claimToken: "claim-zhan" } });
    expect(await host.receiveClaim("peer-noise", noise)).toBeUndefined();

    // A fresh, correctly keyed claim resolves to the right player without the caller ever naming
    // a peer -> offer mapping itself.
    expect(await host.receiveClaim("peer-zhan", zhanClaimEnvelope)).toEqual({ status: "accepted", playerId: "pc:zhan" });

    // The same claim token, re-sent from a different peer id (a real WebRTC reconnect after a
    // network drop routinely gets a new trystero peer id) -- token possession is the
    // authorization (screens-v2: "retry while offer is valid"), so this is accepted as a
    // reconnect, not rejected as a hijack.
    expect(await host.receiveClaim("peer-zhan-reconnected", zhanClaimEnvelope)).toEqual({ status: "accepted", playerId: "pc:zhan" });

    // The rebind is real: only the new peer id can now decrypt as pc:zhan via receive().
    const queueHeader: BoundHeader<"comms.queue"> = { protocolVersion: PROTOCOL_VERSION, sessionId: "session-a", hostEpoch: 1, bindingEpoch: 1, sequence: 2, messageId: "queue-1", type: "comms.queue" };
    const queueEnvelope = await encryptMessage(zhanKey, { header: queueHeader, payload: { playerId: "pc:zhan", clientSequence: 1, clientCommandId: "zhan-1", windowId: "window-1", actionId: "agenda:skim" } });
    expect((await host.receive("peer-zhan-reconnected", queueEnvelope)).status).toBe("accepted");
  });
});
