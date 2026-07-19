import type { Fact } from "../ledger/types.js";
import { createRng } from "./index.js";
import {
  COMMIT_SCHEME,
  verifyCampaignSeedCommitment,
  verifySecretDrawCommitment,
  type CampaignSeedPreimage,
  type SecretDrawPreimage,
} from "./commit-reveal.js";

/** [M2-14] Done-when: "the artifact carries scheme/RNG versions." xoshiro128** is the only
 * generator this codebase runs (rng/xoshiro128.ts); naming it here lets the artifact commit to
 * an algorithm identifier the way COMMIT_SCHEME commits to a hash/canonicalization scheme. */
export const RNG_ALGORITHM = "xoshiro128**";

export interface BlackBoxDraw {
  readonly commitmentFactId: string;
  readonly hash: string;
  readonly preimage: SecretDrawPreimage;
}

export interface BlackBoxArtifact {
  readonly scheme: string;
  readonly rngAlgorithm: string;
  readonly seedCommitmentFactId: string;
  readonly seedCommitmentHash: string;
  readonly seedPreimage: CampaignSeedPreimage;
  readonly draws: readonly BlackBoxDraw[];
}

/** [Spec §6, INV-8] Every `referee`-scoped draw already publishes exactly one commitment fact
 * during play; this just correlates each campaign-end preimage back to that public fact by hash,
 * so the artifact is independently traceable without trusting whatever order preimages arrived
 * in. Throws if a preimage cannot be matched to a public commitment or a commitment is claimed
 * by more than one preimage -- either would mean the artifact doesn't actually describe this
 * ledger's play. */
export async function assembleBlackBoxArtifact(input: {
  readonly facts: readonly Fact[];
  readonly seedPreimage: CampaignSeedPreimage;
  readonly drawPreimages: readonly SecretDrawPreimage[];
}): Promise<BlackBoxArtifact> {
  const seedFact = input.facts.find((fact) => fact.kind === "campaign.seedCommitted");
  if (!seedFact || typeof seedFact.payload.hash !== "string") {
    throw new Error("no campaign.seedCommitted fact in this ledger");
  }
  if (!(await verifyCampaignSeedCommitment(seedFact.payload.hash, input.seedPreimage))) {
    throw new Error("supplied seed preimage does not match the ledger's campaign.seedCommitted fact");
  }

  const commitmentFacts = input.facts.filter((fact) => fact.kind === "secretRoll.committed");
  const claimed = new Set<string>();
  const draws: BlackBoxDraw[] = [];
  for (const preimage of input.drawPreimages) {
    const matched = await findUnclaimedMatch(commitmentFacts, claimed, preimage);
    if (!matched) {
      throw new Error(`preimage for stream "${preimage.streamId}" draw ${preimage.drawIndex} matches no public secretRoll.committed fact`);
    }
    claimed.add(matched.id);
    draws.push({ commitmentFactId: matched.id, hash: matched.payload.hash as string, preimage });
  }

  return {
    scheme: COMMIT_SCHEME,
    rngAlgorithm: RNG_ALGORITHM,
    seedCommitmentFactId: seedFact.id,
    seedCommitmentHash: seedFact.payload.hash,
    seedPreimage: input.seedPreimage,
    draws,
  };
}

async function findUnclaimedMatch(
  facts: readonly Fact[],
  claimed: ReadonlySet<string>,
  preimage: SecretDrawPreimage,
): Promise<Fact | undefined> {
  for (const fact of facts) {
    if (claimed.has(fact.id) || typeof fact.payload.hash !== "string") continue;
    if (await verifySecretDrawCommitment(fact.payload.hash, preimage)) return fact;
  }
  return undefined;
}

export type AuditStage = "seed-commitment" | "draw-commitment" | "rng-replay";

export type AuditResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly stage: AuditStage; readonly commitmentFactId?: string; readonly message: string };

export interface BlackBoxVerification {
  readonly seed: AuditResult;
  readonly draws: readonly { readonly commitmentFactId: string; readonly result: AuditResult }[];
  readonly verifiedCount: number;
  readonly failedCount: number;
}

async function replayRawDraw(campaignSeed: string, streamId: string, drawIndex: number): Promise<number> {
  const stream = createRng(campaignSeed).derive(streamId);
  let value = Number.NaN;
  for (let i = 0; i <= drawIndex; i += 1) value = stream.next();
  return value;
}

/**
 * [Spec §6, screens-v2 6, INV-3/8] Independent of any live projection: takes only the artifact,
 * never a Ledger. Checks the seed commitment first (screens-v2: the verifier's own required
 * order) -- if it fails, no draw is checked, since nothing about them could be trusted anyway.
 * Then, per draw: the hash (proves the preimage matches what was actually published), and, for
 * draws whose committed result is a raw RNG output (market ticks, comms-order, incident twins --
 * every draw taken through the engine's generic recording path, not a content-mapped one),
 * replays the seeded stream to that index and compares. A content-mapped draw (agenda-deal's
 * `{result, tier, objectiveId}`) still gets its hash checked, but re-deriving *that* shape would
 * require the deck's own resolve() logic, not just the seed -- out of scope here; recorded as an
 * extrapolation, not a gap this function silently papers over.
 */
export async function verifyBlackBoxArtifact(artifact: BlackBoxArtifact): Promise<BlackBoxVerification> {
  const seedOk = await verifyCampaignSeedCommitment(artifact.seedCommitmentHash, artifact.seedPreimage);
  if (!seedOk) {
    return {
      seed: { ok: false, stage: "seed-commitment", message: "campaign seed preimage does not match the setup-time commitment" },
      draws: [],
      verifiedCount: 0,
      failedCount: artifact.draws.length + 1,
    };
  }

  const draws: { commitmentFactId: string; result: AuditResult }[] = [];
  for (const draw of artifact.draws) {
    const hashOk = await verifySecretDrawCommitment(draw.hash, draw.preimage);
    if (!hashOk) {
      draws.push({
        commitmentFactId: draw.commitmentFactId,
        result: { ok: false, stage: "draw-commitment", commitmentFactId: draw.commitmentFactId, message: "draw preimage does not match its published commitment hash" },
      });
      continue;
    }
    if (typeof draw.preimage.result === "number") {
      const replayed = await replayRawDraw(artifact.seedPreimage.campaignSeed, draw.preimage.streamId, draw.preimage.drawIndex);
      if (replayed !== draw.preimage.result) {
        draws.push({
          commitmentFactId: draw.commitmentFactId,
          result: { ok: false, stage: "rng-replay", commitmentFactId: draw.commitmentFactId, message: "committed result does not equal the seeded RNG draw at this stream/index" },
        });
        continue;
      }
    }
    draws.push({ commitmentFactId: draw.commitmentFactId, result: { ok: true } });
  }

  const failedDraws = draws.filter((entry) => !entry.result.ok).length;
  return {
    seed: { ok: true },
    draws,
    verifiedCount: draws.length - failedDraws,
    failedCount: failedDraws,
  };
}
