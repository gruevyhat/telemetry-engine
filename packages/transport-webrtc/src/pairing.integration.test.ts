import { describe, expect, it } from "vitest";
import type { PlayerDeliveryDTO } from "@telemetry/transport";
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
});
