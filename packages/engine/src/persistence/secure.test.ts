import { describe, expect, it } from "vitest";
import type { Fact } from "../ledger/types.js";
import { exportEncryptedSave, loadEncryptedSave, migrateV1Save } from "./secure.js";

const T = { day: 1, slot: "DOCKSIDE" as const };
const publicFact: Fact = { id: "F-public", wall: 1, t: T, kind: "campaign.seedCommitted", actor: { kind: "referee", id: "referee" }, payload: { hash: "public-hash", scheme: "te-commit-v1" }, visibility: { level: "public" } };
const secretFact: Fact = { id: "F-secret", wall: 2, t: T, kind: "market.tick", actor: { kind: "referee", id: "referee" }, payload: { hex: "Regina", good: "REFEREE-SECRET", price: 10, week: 1 }, visibility: { level: "referee" } };
const recoveryKey = new Uint8Array(32).fill(11);

describe("authenticated save schema v2 [M2-10, INV-3/13]", () => {
  it("exports no campaign seed, referee plaintext, or private preimage bytes", async () => {
    const exported = await exportEncryptedSave({ campaignId: "campaign-a", campaignSeed: "CAMPAIGN-SEED", seedState: { drawSalt: "PRIVATE-PREIMAGE" }, facts: [publicFact, secretFact], contentHashes: { content: "hash" } }, recoveryKey);
    expect(exported).not.toContain("CAMPAIGN-SEED");
    expect(exported).not.toContain("REFEREE-SECRET");
    expect(exported).not.toContain("PRIVATE-PREIMAGE");
    expect(exported).toContain("public-hash");
  });

  it("restores byte-identical facts with the recovery key and fails loudly for wrong keys or tampering", async () => {
    const exported = await exportEncryptedSave({ campaignId: "campaign-a", campaignSeed: "CAMPAIGN-SEED", seedState: { draws: 3 }, facts: [publicFact, secretFact], contentHashes: { content: "hash" } }, recoveryKey);
    const loaded = await loadEncryptedSave(exported, recoveryKey);
    expect(JSON.stringify(loaded.facts)).toBe(JSON.stringify([publicFact, secretFact]));
    expect(loaded.seedState).toEqual({ draws: 3 });
    await expect(loadEncryptedSave(exported, new Uint8Array(32).fill(12))).rejects.toThrow(/decrypt|recovery|authentic/i);
    const parsed = JSON.parse(exported) as { security: { encryptedSeedState: { ciphertext: string } } };
    parsed.security.encryptedSeedState.ciphertext = `${parsed.security.encryptedSeedState.ciphertext.slice(0, -2)}00`;
    await expect(loadEncryptedSave(JSON.stringify(parsed), recoveryKey)).rejects.toThrow(/decrypt|tamper|authentic/i);
  });

  it("migrates v1 only after recovery confirmation and rejects future schemas actionably", async () => {
    const v1 = JSON.stringify({ schemaVersion: 1, seedState: { campaignSeed: "CAMPAIGN-SEED", draws: 2 }, facts: [secretFact], contentHashes: { content: "hash" } });
    await expect(migrateV1Save(v1, { campaignId: "campaign-a", recoveryKey, recoveryMaterialSaved: false })).rejects.toThrow(/recovery material/i);
    const migrated = await migrateV1Save(v1, { campaignId: "campaign-a", recoveryKey, recoveryMaterialSaved: true });
    expect(JSON.parse(migrated).schemaVersion).toBe(2);
    expect(migrated).not.toContain("CAMPAIGN-SEED");
    await expect(loadEncryptedSave(JSON.stringify({ schemaVersion: 3 }), recoveryKey)).rejects.toThrow(/version 3.*supports.*2/i);
  });
});
