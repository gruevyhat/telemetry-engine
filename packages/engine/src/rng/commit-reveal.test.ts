import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createKindRegistry } from "../ledger/registry.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import { createLedger } from "../ledger/ledger.js";
import { createRng } from "./index.js";
import {
  COMMIT_SCHEME,
  canonicalizeJson,
  createCampaignSeedCommitment,
  createSecretDrawCommitment,
  verifyCampaignSeedCommitment,
  verifySecretDrawCommitment,
} from "./commit-reveal.js";

const T = { day: 0, slot: "DOCKSIDE" as const };

describe("te-commit-v1 campaign seed commitment [M2-01, INV-8]", () => {
  it("emits a public proposal whose hash rejects every changed seed-preimage component", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string(), async (seed, salt) => {
        const committed = await createCampaignSeedCommitment({ campaignSeed: seed, campaignSalt: salt, t: T });

        expect(committed.proposal).toEqual({
          t: T,
          kind: "campaign.seedCommitted",
          actor: { kind: "referee", id: "referee" },
          payload: { scheme: COMMIT_SCHEME, hash: committed.hash },
          visibility: { level: "public" },
        });
        expect(await verifyCampaignSeedCommitment(committed.hash, committed.preimage)).toBe(true);
        expect(await verifyCampaignSeedCommitment(committed.hash, { ...committed.preimage, scheme: `${COMMIT_SCHEME}-changed` })).toBe(false);
        expect(await verifyCampaignSeedCommitment(committed.hash, { ...committed.preimage, campaignSeed: `${seed}\u0000changed` })).toBe(false);
        expect(await verifyCampaignSeedCommitment(committed.hash, { ...committed.preimage, campaignSalt: `${salt}\u0000changed` })).toBe(false);
      }),
      { numRuns: 40 },
    );
  });
});

describe("canonical JSON [Spec §6]", () => {
  it("is independent of object insertion order at every nesting level", () => {
    fc.assert(
      fc.property(fc.jsonValue(), fc.jsonValue(), fc.jsonValue(), (a, b, c) => {
        const left = { z: a, nested: { b, a: c } };
        const right = { nested: { a: c, b }, z: a };
        expect(canonicalizeJson(left)).toBe(canonicalizeJson(right));
      }),
      { numRuns: 100 },
    );
  });

  it("preserves array order and distinguishes finite JSON values", () => {
    expect(canonicalizeJson([1, 2])).not.toBe(canonicalizeJson([2, 1]));
    expect(new Set([null, false, true, 0, 1, "", "1"].map(canonicalizeJson)).size).toBe(7);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, undefined])("rejects non-JSON value %s", (value) => {
    expect(() => canonicalizeJson(value)).toThrow(/finite JSON|JSON value/i);
  });
});

describe("te-commit-v1 secret draw commitment [M2-01, INV-3/8]", () => {
  it("binds scheme, seed commitment, stream, index, canonical result, and draw salt", async () => {
    const seed = await createCampaignSeedCommitment({ campaignSeed: "skim-seed", campaignSalt: "campaign-salt", t: T });
    const draw = await createSecretDrawCommitment({
      campaignSeed: "skim-seed",
      campaignSalt: "campaign-salt",
      rng: createRng("skim-seed"),
      streamId: "agenda-deal",
      seedCommitment: { factId: "F-seed", hash: seed.hash },
      t: T,
      resolve: (unit) => ({ dealt: unit < 0.28, roll: unit }),
    });

    expect(draw.proposal).toEqual({
      t: T,
      kind: "secretRoll.committed",
      actor: { kind: "referee", id: "referee" },
      payload: { scheme: COMMIT_SCHEME, hash: draw.hash, seedCommitmentFactId: "F-seed" },
      visibility: { level: "public" },
    });
    expect(await verifySecretDrawCommitment(draw.hash, draw.preimage)).toBe(true);

    const mutations = [
      { ...draw.preimage, scheme: `${COMMIT_SCHEME}-changed` },
      { ...draw.preimage, seedCommitmentHash: `${seed.hash}00` },
      { ...draw.preimage, streamId: "world-events" },
      { ...draw.preimage, drawIndex: draw.preimage.drawIndex + 1 },
      { ...draw.preimage, result: { dealt: !draw.result.dealt, roll: draw.result.roll } },
      { ...draw.preimage, drawSalt: `${draw.preimage.drawSalt}00` },
    ];
    for (const mutation of mutations) {
      expect(await verifySecretDrawCommitment(draw.hash, mutation)).toBe(false);
    }
  });

  it("restarts from identical seed/context with byte-identical result, proposals, and preimages", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string(), fc.string(), fc.string({ minLength: 1 }), async (campaignSeed, campaignSalt, streamId) => {
        const seedA = await createCampaignSeedCommitment({ campaignSeed, campaignSalt, t: T });
        const seedB = await createCampaignSeedCommitment({ campaignSeed, campaignSalt, t: T });
        const input = {
          campaignSeed,
          campaignSalt,
          streamId,
          seedCommitment: { factId: "F-seed", hash: seedA.hash },
          t: T,
          resolve: (unit: number) => ({ unit, bucket: Math.floor(unit * 6) + 1 }),
        };

        const drawA = await createSecretDrawCommitment({ ...input, rng: createRng(campaignSeed) });
        const drawB = await createSecretDrawCommitment({ ...input, rng: createRng(campaignSeed) });

        expect(JSON.stringify(seedA)).toBe(JSON.stringify(seedB));
        expect(JSON.stringify(drawA)).toBe(JSON.stringify(drawB));
      }),
      { numRuns: 60 },
    );
  });

  it("keeps seed, salts, result, and preimages outside every live public fact", async () => {
    const campaignSeed = "SECRET-CAMPAIGN-SEED-9b7d";
    const campaignSalt = "SECRET-CAMPAIGN-SALT-62e1";
    const privateResult = "SECRET-NEGATIVE-AGENDA-RESULT-443a";
    const seed = await createCampaignSeedCommitment({ campaignSeed, campaignSalt, t: T });
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const seedFact = ledger.append(seed.proposal);
    const draw = await createSecretDrawCommitment({
      campaignSeed,
      campaignSalt,
      rng: createRng(campaignSeed),
      streamId: "agenda-deal",
      seedCommitment: { factId: seedFact.id, hash: seed.hash },
      t: T,
      resolve: () => privateResult,
    });
    ledger.append(draw.proposal);

    const publicBytes = JSON.stringify(ledger.visibleTo({ scope: "public" }));
    for (const secret of [campaignSeed, campaignSalt, privateResult, draw.preimage.drawSalt]) {
      expect(publicBytes).not.toContain(secret);
    }
    expect(publicBytes).not.toContain("preimage");
  });
});
