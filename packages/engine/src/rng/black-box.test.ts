import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createKindRegistry } from "../ledger/registry.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import { createLedger } from "../ledger/ledger.js";
import { buildPlayerDelivery } from "../presentation/index.js";
import { createRng } from "./index.js";
import { createCampaignSeedCommitment, createRecordedSecretDrawCommitment, type CampaignSeedPreimage, type SecretDrawPreimage } from "./commit-reveal.js";
import { assembleBlackBoxArtifact, verifyBlackBoxArtifact, RNG_ALGORITHM, type BlackBoxArtifact } from "./black-box.js";

const T = { day: 0, slot: "DOCKSIDE" as const };

async function fixture(campaignSeed: string, campaignSalt: string, streamIds: readonly string[]) {
  const ledger = createLedger(createKindRegistry(KINDS_V0));
  const seed = await createCampaignSeedCommitment({ campaignSeed, campaignSalt, t: T });
  const seedFact = ledger.append(seed.proposal);
  const rng = createRng(campaignSeed);
  const drawPreimages: SecretDrawPreimage[] = [];
  for (const streamId of streamIds) {
    const stream = rng.derive(streamId);
    const drawIndex = stream.drawCount;
    const result = stream.next();
    const committed = await createRecordedSecretDrawCommitment({
      campaignSeed, campaignSalt, streamId, drawIndex, result,
      seedCommitment: { factId: seedFact.id, hash: seed.hash },
      t: T,
    });
    ledger.append(committed.proposal);
    drawPreimages.push(committed.preimage);
  }
  return { ledger, seedPreimage: seed.preimage, drawPreimages };
}

describe("black-box artifact assembly and verification [M2-14, INV-3/8]", () => {
  it("verifies the campaign seed and salt against the setup-time commitment before any draw is checked", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), async (campaignSeed, campaignSalt) => {
        const { ledger, seedPreimage, drawPreimages } = await fixture(campaignSeed, campaignSalt, ["comms-order:window-1"]);
        const artifact = await assembleBlackBoxArtifact({ facts: ledger.all(), seedPreimage, drawPreimages });
        expect(artifact.scheme).toBe("te-commit-v1");
        expect(artifact.rngAlgorithm).toBe(RNG_ALGORITHM);

        const good = await verifyBlackBoxArtifact(artifact);
        expect(good.seed).toEqual({ ok: true });
        expect(good.verifiedCount).toBe(1);
        expect(good.failedCount).toBe(0);

        const tampered: BlackBoxArtifact = { ...artifact, seedPreimage: { ...seedPreimage, campaignSalt: `${campaignSalt} x` } };
        const bad = await verifyBlackBoxArtifact(tampered);
        expect(bad.seed).toEqual({ ok: false, stage: "seed-commitment", message: expect.any(String) });
        expect(bad.draws).toEqual([]); // no draw is checked once the seed itself fails
        expect(bad.failedCount).toBe(tampered.draws.length + 1);
      }),
      { numRuns: 25 },
    );
  });

  it("correlates every public secret-roll commitment to exactly one campaign-end preimage", async () => {
    const { ledger, seedPreimage, drawPreimages } = await fixture("multi-draw-seed", "multi-draw-salt", [
      "comms-order:window-1",
      "comms-order:window-2",
      "market:regina",
    ]);
    const artifact = await assembleBlackBoxArtifact({ facts: ledger.all(), seedPreimage, drawPreimages });
    const commitmentFacts = ledger.all().filter((fact) => fact.kind === "secretRoll.committed");

    expect(artifact.draws).toHaveLength(commitmentFacts.length);
    expect(new Set(artifact.draws.map((draw) => draw.commitmentFactId)).size).toBe(commitmentFacts.length);
    for (const fact of commitmentFacts) {
      expect(artifact.draws.some((draw) => draw.commitmentFactId === fact.id)).toBe(true);
    }

    const verification = await verifyBlackBoxArtifact(artifact);
    expect(verification.verifiedCount).toBe(commitmentFacts.length);
    expect(verification.failedCount).toBe(0);
  });

  it("fails with a specific audit error for every changed commitment field", async () => {
    const { ledger, seedPreimage, drawPreimages } = await fixture("mutate-seed", "mutate-salt", ["comms-order:window-1"]);
    const artifact = await assembleBlackBoxArtifact({ facts: ledger.all(), seedPreimage, drawPreimages });
    const draw = artifact.draws[0]!;

    const seedMutations: CampaignSeedPreimage[] = [
      { ...seedPreimage, scheme: "te-commit-v1-changed" },
      { ...seedPreimage, campaignSeed: `${seedPreimage.campaignSeed} x` },
    ];
    for (const mutated of seedMutations) {
      const result = await verifyBlackBoxArtifact({ ...artifact, seedPreimage: mutated });
      expect(result.seed).toEqual({ ok: false, stage: "seed-commitment", message: expect.any(String) });
    }

    const drawMutations: SecretDrawPreimage[] = [
      { ...draw.preimage, scheme: "te-commit-v1-changed" },
      { ...draw.preimage, streamId: "world-events" },
      { ...draw.preimage, drawIndex: draw.preimage.drawIndex + 1 },
      { ...draw.preimage, result: (draw.preimage.result as number) + 0.001 },
      { ...draw.preimage, drawSalt: `${draw.preimage.drawSalt}00` },
    ];
    for (const mutated of drawMutations) {
      const mutatedArtifact: BlackBoxArtifact = { ...artifact, draws: [{ ...draw, preimage: mutated }] };
      const result = await verifyBlackBoxArtifact(mutatedArtifact);
      expect(result.draws).toHaveLength(1);
      expect(result.draws[0]!.result).toEqual({ ok: false, stage: "draw-commitment", commitmentFactId: draw.commitmentFactId, message: expect.any(String) });
      expect(result.failedCount).toBe(1);
    }
  });

  it("fails RNG verification for a result that hashes correctly but was not the seeded draw", async () => {
    const campaignSeed = "forged-seed";
    const campaignSalt = "forged-salt";
    const { ledger, seedPreimage, drawPreimages } = await fixture(campaignSeed, campaignSalt, ["comms-order:window-1"]);
    const artifact = await assembleBlackBoxArtifact({ facts: ledger.all(), seedPreimage, drawPreimages });
    const real = artifact.draws[0]!;

    // A forged commitment for a fabricated result: internally hash-consistent, but never
    // actually drawn from the committed seed at this stream/index.
    const forged = await createRecordedSecretDrawCommitment({
      campaignSeed, campaignSalt,
      streamId: real.preimage.streamId,
      drawIndex: real.preimage.drawIndex,
      result: ((real.preimage.result as number) + 0.5) % 1,
      seedCommitment: { factId: artifact.seedCommitmentFactId, hash: artifact.seedCommitmentHash },
      t: T,
    });

    const forgedArtifact: BlackBoxArtifact = { ...artifact, draws: [{ commitmentFactId: real.commitmentFactId, hash: forged.hash, preimage: forged.preimage }] };
    const result = await verifyBlackBoxArtifact(forgedArtifact);
    expect(result.draws[0]!.result).toEqual({ ok: false, stage: "rng-replay", commitmentFactId: real.commitmentFactId, message: expect.any(String) });
    expect(result.failedCount).toBe(1);
  });

  it("never exposes a preimage or referee-scoped draw material in any live player delivery", async () => {
    const campaignSeed = "SECRET-CAMPAIGN-SEED";
    const campaignSalt = "SECRET-CAMPAIGN-SALT";
    const { ledger, drawPreimages } = await fixture(campaignSeed, campaignSalt, ["comms-order:window-1", "market:regina"]);

    const delivery = buildPlayerDelivery(ledger, "pc:zhan", { agendaActionsByObjectiveId: {} });
    const deliveryBytes = JSON.stringify(delivery);
    for (const secret of [campaignSeed, campaignSalt, ...drawPreimages.map((p) => p.drawSalt)]) {
      expect(deliveryBytes).not.toContain(secret);
    }
    expect(deliveryBytes).not.toContain("preimage");
    expect(delivery).not.toHaveProperty("preimages");
  });
});
