import type { AppendInput } from "../ledger/ledger.js";
import type { JsonValue } from "../persistence/index.js";
import type { GameTime } from "../time/index.js";
import type { Rng } from "./index.js";

export const COMMIT_SCHEME = "te-commit-v1";

export interface CampaignSeedPreimage {
  readonly scheme: string;
  readonly campaignSeed: string;
  readonly campaignSalt: string;
}

export interface CampaignSeedCommitment {
  readonly hash: string;
  readonly proposal: AppendInput;
  readonly preimage: CampaignSeedPreimage;
}

export interface SecretDrawPreimage<T = unknown> {
  readonly scheme: string;
  readonly seedCommitmentHash: string;
  readonly streamId: string;
  readonly drawIndex: number;
  readonly result: T;
  readonly drawSalt: string;
}

export interface SecretDrawCommitment<T extends JsonValue> {
  readonly result: T;
  readonly hash: string;
  readonly proposal: AppendInput;
  readonly preimage: SecretDrawPreimage<T>;
}

const REFEREE = { kind: "referee" as const, id: "referee" };

interface TextEncoderLike {
  encode(value: string): Uint8Array;
}

interface PlatformCrypto {
  subtle: {
    digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer>;
  };
}

function utf8(value: string): Uint8Array {
  const Encoder = (globalThis as unknown as { TextEncoder?: new () => TextEncoderLike }).TextEncoder;
  if (!Encoder) {
    throw new Error("te-commit-v1 requires the platform TextEncoder API");
  }
  return new Encoder().encode(value);
}

function platformCrypto(): PlatformCrypto {
  const crypto = (globalThis as unknown as { crypto?: PlatformCrypto }).crypto;
  if (!crypto?.subtle) {
    throw new Error("te-commit-v1 requires the platform Web Crypto digest API");
  }
  return crypto;
}

/** Domain-separated tuple encoding: each UTF-8 field is prefixed by its unsigned 32-bit byte length. */
function encodeTuple(fields: readonly string[]): Uint8Array {
  const encoded = fields.map(utf8);
  const totalLength = encoded.reduce((total, field) => total + 4 + field.length, 0);
  const tuple = new Uint8Array(totalLength);
  let offset = 0;
  for (const field of encoded) {
    if (field.length > 0xffffffff) {
      throw new Error("te-commit-v1 field exceeds the 32-bit tuple length limit");
    }
    tuple[offset] = (field.length >>> 24) & 0xff;
    tuple[offset + 1] = (field.length >>> 16) & 0xff;
    tuple[offset + 2] = (field.length >>> 8) & 0xff;
    tuple[offset + 3] = field.length & 0xff;
    tuple.set(field, offset + 4);
    offset += 4 + field.length;
  }
  return tuple;
}

async function hashTuple(fields: readonly string[]): Promise<string> {
  const digest = new Uint8Array(await platformCrypto().subtle.digest("SHA-256", encodeTuple(fields)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function canonicalize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonical JSON accepts only finite JSON numbers");
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new Error(`canonical JSON expected a JSON value, got ${typeof value}`);
  }
  if (ancestors.has(value)) {
    throw new Error("canonical JSON does not accept cyclic values");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => canonicalize(entry, ancestors)).join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("canonical JSON accepts only plain objects and arrays");
    }
    const record = value as Record<string, unknown>;
    const fields = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], ancestors)}`);
    return `{${fields.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

/** Spec §6 canonical JSON: sorted object keys, stable arrays, and finite JSON values only. */
export function canonicalizeJson(value: unknown): string {
  return canonicalize(value, new Set());
}

async function campaignSeedHash(preimage: CampaignSeedPreimage): Promise<string> {
  return hashTuple([preimage.scheme, "campaign-seed", preimage.campaignSeed, preimage.campaignSalt]);
}

async function secretDrawHash(preimage: SecretDrawPreimage): Promise<string> {
  return hashTuple([
    preimage.scheme,
    "secret-draw",
    preimage.seedCommitmentHash,
    preimage.streamId,
    String(preimage.drawIndex),
    canonicalizeJson(preimage.result),
    preimage.drawSalt,
  ]);
}

async function deriveDrawSalt(input: {
  campaignSeed: string;
  campaignSalt: string;
  streamId: string;
  drawIndex: number;
}): Promise<string> {
  return hashTuple([
    COMMIT_SCHEME,
    "draw-salt",
    input.campaignSeed,
    input.campaignSalt,
    input.streamId,
    String(input.drawIndex),
  ]);
}

export async function createCampaignSeedCommitment(input: {
  campaignSeed: string;
  campaignSalt: string;
  t: GameTime;
}): Promise<CampaignSeedCommitment> {
  const preimage: CampaignSeedPreimage = {
    scheme: COMMIT_SCHEME,
    campaignSeed: input.campaignSeed,
    campaignSalt: input.campaignSalt,
  };
  const hash = await campaignSeedHash(preimage);
  return {
    hash,
    preimage,
    proposal: {
      t: input.t,
      kind: "campaign.seedCommitted",
      actor: REFEREE,
      payload: { scheme: COMMIT_SCHEME, hash },
      visibility: { level: "public" },
    },
  };
}

export async function verifyCampaignSeedCommitment(hash: string, preimage: CampaignSeedPreimage): Promise<boolean> {
  return (await campaignSeedHash(preimage)) === hash;
}

export async function createSecretDrawCommitment<T extends JsonValue>(input: {
  campaignSeed: string;
  campaignSalt: string;
  rng: Rng;
  streamId: string;
  seedCommitment: { factId: string; hash: string };
  t: GameTime;
  resolve: (unit: number) => T;
}): Promise<SecretDrawCommitment<T>> {
  const stream = input.rng.derive(input.streamId);
  const drawIndex = stream.drawCount;
  const result = input.resolve(stream.next());
  // Validate before constructing any proposal or preimage that could escape this API.
  canonicalizeJson(result);
  const drawSalt = await deriveDrawSalt({
    campaignSeed: input.campaignSeed,
    campaignSalt: input.campaignSalt,
    streamId: input.streamId,
    drawIndex,
  });
  const preimage: SecretDrawPreimage<T> = {
    scheme: COMMIT_SCHEME,
    seedCommitmentHash: input.seedCommitment.hash,
    streamId: input.streamId,
    drawIndex,
    result,
    drawSalt,
  };
  const hash = await secretDrawHash(preimage);
  return {
    result,
    hash,
    preimage,
    proposal: {
      t: input.t,
      kind: "secretRoll.committed",
      actor: REFEREE,
      payload: {
        scheme: COMMIT_SCHEME,
        hash,
        seedCommitmentFactId: input.seedCommitment.factId,
      },
      visibility: { level: "public" },
    },
  };
}

export async function verifySecretDrawCommitment(hash: string, preimage: SecretDrawPreimage): Promise<boolean> {
  return (await secretDrawHash(preimage)) === hash;
}
