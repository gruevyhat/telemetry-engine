import type { Fact } from "../ledger/types.js";
import type { ContentHashes, JsonValue, SeedState } from "./index.js";

export const ENCRYPTED_SAVE_SCHEMA_VERSION = 2 as const;

interface CiphertextRecord {
  readonly iv: string;
  readonly ciphertext: string;
}

interface EncryptedFactRecord extends Omit<Fact, "payload"> {
  readonly encryptedPayload: CiphertextRecord;
}

interface PlainFactRecord extends Fact {
  readonly encryptedPayload?: never;
}

type StoredFact = EncryptedFactRecord | PlainFactRecord;

export interface EncryptedSaveV2 {
  readonly schemaVersion: typeof ENCRYPTED_SAVE_SCHEMA_VERSION;
  readonly campaignId: string;
  readonly contentHashes: ContentHashes;
  readonly facts: readonly StoredFact[];
  readonly security: {
    readonly aead: "AES-GCM-256";
    readonly kdf: "SHA-256";
    readonly atRestSalt: string;
    readonly wrappedCampaignSeed: CiphertextRecord;
    readonly encryptedSeedState: CiphertextRecord;
  };
}

export interface EncryptedSaveInput {
  readonly campaignId: string;
  readonly campaignSeed: string;
  readonly seedState: SeedState;
  readonly facts: readonly Fact[];
  readonly contentHashes: ContentHashes;
}

export interface LoadedEncryptedSave {
  readonly campaignId: string;
  readonly campaignSeed: string;
  readonly seedState: SeedState;
  readonly facts: readonly Fact[];
  readonly contentHashes: ContentHashes;
}

interface TextEncoderLike { encode(value: string): Uint8Array }
interface TextDecoderLike { decode(value: ArrayBuffer): string }
type CryptoKeyLike = object;
interface PlatformCrypto {
  getRandomValues<T extends Uint8Array>(value: T): T;
  subtle: {
    digest(algorithm: string, data: ArrayBuffer): Promise<ArrayBuffer>;
    importKey(format: "raw", data: ArrayBuffer, algorithm: { name: string }, extractable: boolean, usages: string[]): Promise<CryptoKeyLike>;
    encrypt(algorithm: { name: string; iv: Uint8Array; additionalData: ArrayBuffer; tagLength: number }, key: CryptoKeyLike, data: ArrayBuffer): Promise<ArrayBuffer>;
    decrypt(algorithm: { name: string; iv: ArrayBuffer; additionalData: ArrayBuffer; tagLength: number }, key: CryptoKeyLike, data: ArrayBuffer): Promise<ArrayBuffer>;
  };
}

function platformCrypto(): PlatformCrypto {
  const value = (globalThis as unknown as { crypto?: PlatformCrypto }).crypto;
  if (!value?.subtle) throw new Error("Encrypted saves require the platform Web Crypto API.");
  return value;
}

function utf8(value: string): Uint8Array {
  const Encoder = (globalThis as unknown as { TextEncoder?: new () => TextEncoderLike }).TextEncoder;
  if (!Encoder) throw new Error("Encrypted saves require the platform TextEncoder API.");
  return new Encoder().encode(value);
}

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy.buffer;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function unhex(value: string): Uint8Array {
  if (value.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(value)) throw new Error("Encrypted save contains invalid byte encoding.");
  return Uint8Array.from({ length: value.length / 2 }, (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16));
}

async function importAesKey(bytes: Uint8Array, usages: readonly string[]): Promise<CryptoKeyLike> {
  if (bytes.byteLength !== 32) throw new Error("Recovery keys must contain exactly 32 bytes.");
  return platformCrypto().subtle.importKey("raw", bufferOf(bytes), { name: "AES-GCM" }, false, [...usages]);
}

async function deriveAtRestKey(campaignSeed: string, salt: Uint8Array): Promise<CryptoKeyLike> {
  const material = utf8(`te-at-rest-v1\u0000${campaignSeed}\u0000${hex(salt)}`);
  const digest = new Uint8Array(await platformCrypto().subtle.digest("SHA-256", bufferOf(material)));
  return importAesKey(digest, ["encrypt", "decrypt"]);
}

function associatedData(campaignId: string, record: string, fact?: Pick<Fact, "id" | "kind" | "visibility">): Uint8Array {
  return utf8(JSON.stringify({
    schemaVersion: ENCRYPTED_SAVE_SCHEMA_VERSION,
    campaignId,
    record,
    ...(fact ? { factId: fact.id, kind: fact.kind, visibility: fact.visibility } : {}),
  }));
}

function freshIv(used: Set<string>): Uint8Array {
  const iv = platformCrypto().getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const encoded = hex(iv);
  if (used.has(encoded)) throw new Error("Encrypted save nonce collision detected; save aborted.");
  used.add(encoded);
  return iv;
}

async function encryptRecord(key: CryptoKeyLike, value: JsonValue, aad: Uint8Array, used: Set<string>): Promise<CiphertextRecord> {
  const iv = freshIv(used);
  const ciphertext = await platformCrypto().subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: bufferOf(aad), tagLength: 128 },
    key,
    bufferOf(utf8(JSON.stringify(value))),
  );
  return { iv: hex(iv), ciphertext: hex(new Uint8Array(ciphertext)) };
}

async function decryptRecord(key: CryptoKeyLike, record: CiphertextRecord, aad: Uint8Array): Promise<JsonValue> {
  const plaintext = await platformCrypto().subtle.decrypt(
    { name: "AES-GCM", iv: bufferOf(unhex(record.iv)), additionalData: bufferOf(aad), tagLength: 128 },
    key,
    bufferOf(unhex(record.ciphertext)),
  );
  const Decoder = (globalThis as unknown as { TextDecoder?: new () => TextDecoderLike }).TextDecoder;
  if (!Decoder) throw new Error("Encrypted saves require the platform TextDecoder API.");
  return JSON.parse(new Decoder().decode(plaintext)) as JsonValue;
}

function payloadJson(payload: Readonly<Record<string, unknown>>): Readonly<Record<string, JsonValue>> {
  return JSON.parse(JSON.stringify(payload)) as Readonly<Record<string, JsonValue>>;
}

export async function exportEncryptedSave(input: EncryptedSaveInput, recoveryKeyBytes: Uint8Array): Promise<string> {
  if (!input.campaignId || !input.campaignSeed) throw new Error("Encrypted saves require a campaign id and campaign seed.");
  const recoveryKey = await importAesKey(recoveryKeyBytes, ["encrypt"]);
  const salt = platformCrypto().getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const atRestKey = await deriveAtRestKey(input.campaignSeed, salt);
  const usedNonces = new Set<string>();
  const wrappedCampaignSeed = await encryptRecord(recoveryKey, input.campaignSeed, associatedData(input.campaignId, "campaign-seed"), usedNonces);
  const encryptedSeedState = await encryptRecord(atRestKey, input.seedState, associatedData(input.campaignId, "seed-state"), usedNonces);
  const facts: StoredFact[] = [];
  for (const fact of input.facts) {
    if (fact.visibility.level !== "referee") {
      facts.push(fact);
      continue;
    }
    const { payload: _payload, ...header } = fact;
    facts.push({ ...header, encryptedPayload: await encryptRecord(atRestKey, payloadJson(fact.payload), associatedData(input.campaignId, "fact-payload", fact), usedNonces) });
  }
  const save: EncryptedSaveV2 = {
    schemaVersion: ENCRYPTED_SAVE_SCHEMA_VERSION,
    campaignId: input.campaignId,
    contentHashes: input.contentHashes,
    facts,
    security: { aead: "AES-GCM-256", kdf: "SHA-256", atRestSalt: hex(salt), wrappedCampaignSeed, encryptedSeedState },
  };
  return JSON.stringify(save);
}

function parseV2(serialized: string): EncryptedSaveV2 {
  let raw: unknown;
  try { raw = JSON.parse(serialized); } catch { throw new Error("Cannot load save because it is not valid JSON."); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Cannot load save because its schema is malformed.");
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (version !== ENCRYPTED_SAVE_SCHEMA_VERSION) throw new Error(`Cannot load save schema version ${String(version)}. This build supports encrypted schema version 2.`);
  const save = raw as EncryptedSaveV2;
  if (!save.security || !Array.isArray(save.facts) || typeof save.campaignId !== "string") throw new Error("Cannot load save because encrypted schema v2 is malformed.");
  return save;
}

function assertUniqueNonces(save: EncryptedSaveV2): void {
  const records: CiphertextRecord[] = [save.security.wrappedCampaignSeed, save.security.encryptedSeedState];
  for (const fact of save.facts) {
    if ("encryptedPayload" in fact && fact.encryptedPayload) records.push(fact.encryptedPayload);
  }
  const seen = new Set<string>();
  for (const record of records) {
    if (seen.has(record.iv)) throw new Error("Cannot load save because it reuses an encrypted-record nonce.");
    seen.add(record.iv);
  }
}

export async function loadEncryptedSave(serialized: string, recoveryKeyBytes: Uint8Array): Promise<LoadedEncryptedSave> {
  const save = parseV2(serialized);
  assertUniqueNonces(save);
  try {
    const recoveryKey = await importAesKey(recoveryKeyBytes, ["decrypt"]);
    const campaignSeed = await decryptRecord(recoveryKey, save.security.wrappedCampaignSeed, associatedData(save.campaignId, "campaign-seed"));
    if (typeof campaignSeed !== "string") throw new Error("decrypted campaign seed is invalid");
    const atRestKey = await deriveAtRestKey(campaignSeed, unhex(save.security.atRestSalt));
    const seedState = await decryptRecord(atRestKey, save.security.encryptedSeedState, associatedData(save.campaignId, "seed-state"));
    if (!seedState || typeof seedState !== "object" || Array.isArray(seedState)) throw new Error("decrypted seed state is invalid");
    const facts: Fact[] = [];
    for (const stored of save.facts) {
      if (!("encryptedPayload" in stored)) {
        facts.push(stored);
        continue;
      }
      const { encryptedPayload, ...header } = stored;
      if (!encryptedPayload) throw new Error("encrypted fact payload is missing");
      const payload = await decryptRecord(atRestKey, encryptedPayload, associatedData(save.campaignId, "fact-payload", header));
      if (!isRecord(payload)) throw new Error("decrypted fact payload is invalid");
      facts.push({
        id: header.id,
        wall: header.wall,
        t: header.t,
        kind: header.kind,
        actor: header.actor,
        payload,
        visibility: header.visibility,
        ...(header.causes ? { causes: header.causes } : {}),
        ...(header.frame ? { frame: header.frame } : {}),
      });
    }
    return { campaignId: save.campaignId, campaignSeed, seedState: seedState as SeedState, facts, contentHashes: save.contentHashes };
  } catch (error) {
    throw new Error("Cannot decrypt save. The recovery key is wrong or authenticated data was tampered with.", { cause: error });
  }
}

export interface MigrateV1Options {
  readonly campaignId: string;
  readonly recoveryKey: Uint8Array;
  readonly recoveryMaterialSaved: boolean;
  readonly replay: (facts: readonly Fact[], seedState: SeedState) => void;
}

function isRecord(value: unknown): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function migrateV1Save(serialized: string, options: MigrateV1Options): Promise<string> {
  if (!options.recoveryMaterialSaved) throw new Error("Save migration requires confirmation that recovery material was saved.");
  let raw: unknown;
  try { raw = JSON.parse(serialized); } catch { throw new Error("Cannot migrate v1 save because it is not valid JSON."); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || (raw as { schemaVersion?: unknown }).schemaVersion !== 1) throw new Error("Cannot migrate save because it is not schema version 1.");
  const v1 = raw as { seedState?: Record<string, JsonValue>; facts?: Fact[]; contentHashes?: ContentHashes };
  const legacySeedState = v1.seedState;
  const campaignSeed = legacySeedState?.campaignSeed;
  if (typeof campaignSeed !== "string" || !legacySeedState || !Array.isArray(v1.facts) || !v1.contentHashes) throw new Error("Cannot migrate malformed v1 save; campaign seed, facts, or content hashes are missing.");
  const { campaignSeed: _seed, ...seedState } = legacySeedState;
  options.replay(v1.facts, seedState);
  return exportEncryptedSave({ campaignId: options.campaignId, campaignSeed, seedState, facts: v1.facts, contentHashes: v1.contentHashes }, options.recoveryKey);
}
