export const PROTOCOL_VERSION = 1 as const;

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface PresentedFactDTO {
  readonly id: string;
  readonly t: { readonly day: number; readonly slot: string };
  readonly kind: string;
  readonly actor: { readonly kind: string; readonly id: string };
  readonly payload: Readonly<Record<string, JsonValue>>;
  readonly scope: "public" | "private";
  readonly causes?: readonly string[];
}

export interface PlayerDeliveryDTO {
  readonly schemaVersion: 1;
  readonly playerId: string;
  readonly publicFacts: readonly PresentedFactDTO[];
  readonly privateFacts: readonly PresentedFactDTO[];
  readonly agendaPacket?: { readonly objectiveId: string; readonly successCondition: Readonly<Record<string, JsonValue>>; readonly sealedStatus: "sealed" | "burned"; readonly actions: readonly { readonly actionId: string; readonly templateKey: string }[] };
  readonly feedback: readonly { readonly feedbackId: string; readonly templateKey: string; readonly reasonCode: string }[];
}

export type MessageType =
  | "pair.claim" | "pair.accepted" | "pair.revoked" | "seat.ready" | "state.snapshot" | "deal.packet"
  | "comms.open" | "target.options" | "comms.queue" | "comms.ack" | "comms.closed" | "feedback.private"
  | "confrontation.command" | "vote.open" | "vote.cast" | "vote.committed" | "vote.resolved"
  | "session.pause" | "session.resume" | "hotseat.begin" | "hotseat.end" | "session.error";

export interface BoundHeader<T extends MessageType = MessageType> {
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly sessionId: string;
  readonly hostEpoch: number;
  readonly bindingEpoch: number;
  readonly sequence: number;
  readonly messageId: string;
  readonly type: T;
}

export interface ProtocolPayloadMap {
  readonly "pair.claim": { readonly playerId: string; readonly claimToken: string };
  readonly "pair.accepted": { readonly playerId: string; readonly clientSequenceBase: number };
  readonly "pair.revoked": { readonly playerId: string; readonly reasonCode: string };
  readonly "seat.ready": { readonly playerId: string; readonly clientSequence: number; readonly ready: boolean };
  readonly "state.snapshot": { readonly delivery: PlayerDeliveryDTO; readonly remainingSeconds: number; readonly paused: boolean };
  readonly "deal.packet": { readonly delivery: PlayerDeliveryDTO };
  readonly "comms.open": { readonly windowId: string; readonly remainingSeconds: number };
  readonly "target.options": { readonly windowId: string; readonly actionId: string; readonly version: number; readonly targets: readonly { readonly targetId: string; readonly labelKey: string }[] };
  readonly "comms.queue": { readonly playerId: string; readonly clientSequence: number; readonly clientCommandId: string; readonly windowId: string; readonly actionId: string; readonly targetFactId?: string };
  readonly "comms.ack": { readonly clientCommandId: string; readonly committedFactId: string };
  readonly "comms.closed": { readonly windowId: string; readonly version: number };
  readonly "feedback.private": { readonly feedbackId: string; readonly templateKey: string; readonly reasonCode: string };
  readonly "confrontation.command": { readonly playerId: string; readonly clientSequence: number; readonly clientCommandId: string; readonly command: "accuse" | "search" | "let-lie" | "replace-captain" | "put-off-ship"; readonly targetId?: string };
  readonly "vote.open": { readonly topic: string; readonly eligiblePlayerIds: readonly string[]; readonly threshold: number };
  readonly "vote.cast": { readonly playerId: string; readonly clientSequence: number; readonly topic: string; readonly value: boolean };
  readonly "vote.committed": { readonly topic: string; readonly voteFactId: string; readonly ballots: Readonly<Record<string, boolean>> };
  readonly "vote.resolved": { readonly topic: string; readonly status: "carried" | "failed"; readonly outcome: string };
  readonly "session.pause": { readonly pauseEpoch: number; readonly reasonCode: string; readonly remainingSeconds: number };
  readonly "session.resume": { readonly pauseEpoch: number; readonly remainingSeconds: number };
  readonly "hotseat.begin": { readonly pauseEpoch: number; readonly playerId: string };
  readonly "hotseat.end": { readonly pauseEpoch: number; readonly playerId: string };
  readonly "session.error": { readonly rejectedMessageId: string; readonly code: string; readonly retryable: boolean };
}

export type ProtocolMessage = { [T in MessageType]: { readonly header: BoundHeader<T>; readonly payload: ProtocolPayloadMap[T] } }[MessageType];

export interface EncryptedEnvelope {
  readonly header: BoundHeader;
  readonly iv: string;
  readonly ciphertext: string;
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function unhex(value: string): Uint8Array {
  if (value.length % 2 !== 0 || !/^[0-9a-f]*$/i.test(value)) throw new Error("invalid encrypted envelope byte encoding");
  return Uint8Array.from({ length: value.length / 2 }, (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16));
}

function authenticatedHeader(header: BoundHeader): Uint8Array {
  return utf8(JSON.stringify({
    protocolVersion: header.protocolVersion,
    sessionId: header.sessionId,
    hostEpoch: header.hostEpoch,
    bindingEpoch: header.bindingEpoch,
    sequence: header.sequence,
    messageId: header.messageId,
    type: header.type,
  }));
}

function bufferOf(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy.buffer;
}

async function importKey(keyBytes: Uint8Array, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  if (keyBytes.byteLength !== 32) throw new Error("transport binding keys must be 32 bytes");
  return crypto.subtle.importKey("raw", bufferOf(keyBytes), { name: "AES-GCM" }, false, [usage]);
}

/** AES-GCM authenticates the full routing header; there is deliberately no plaintext payload API. */
export async function encryptMessage(keyBytes: Uint8Array, message: ProtocolMessage): Promise<EncryptedEnvelope> {
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: bufferOf(authenticatedHeader(message.header)), tagLength: 128 },
    await importKey(keyBytes, "encrypt"),
    bufferOf(utf8(JSON.stringify(message.payload))),
  );
  return { header: message.header, iv: hex(iv), ciphertext: hex(new Uint8Array(ciphertext)) };
}

export async function decryptMessage(keyBytes: Uint8Array, envelope: EncryptedEnvelope): Promise<ProtocolMessage> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: bufferOf(unhex(envelope.iv)), additionalData: bufferOf(authenticatedHeader(envelope.header)), tagLength: 128 },
    await importKey(keyBytes, "decrypt"),
    bufferOf(unhex(envelope.ciphertext)),
  );
  const payload = JSON.parse(new TextDecoder().decode(plaintext)) as ProtocolPayloadMap[MessageType];
  return { header: envelope.header, payload } as ProtocolMessage;
}

export type ReplayDecision = "accepted" | "duplicate" | "rejected";

export interface ReplayGuard {
  accept(header: BoundHeader): ReplayDecision;
}

/** Monotone per binding epoch. Exact retries are idempotent; id reuse or older sequences reject. */
export function createReplayGuard(): ReplayGuard {
  const seenIds = new Map<string, string>();
  const latestSequences = new Map<string, number>();
  return {
    accept(header) {
      if (header.protocolVersion !== PROTOCOL_VERSION || !Number.isSafeInteger(header.sequence) || header.sequence < 0) return "rejected";
      const identity = `${header.sessionId}:${header.hostEpoch}:${header.bindingEpoch}:${header.sequence}`;
      const priorIdentity = seenIds.get(header.messageId);
      if (priorIdentity !== undefined) return priorIdentity === identity ? "duplicate" : "rejected";
      const epoch = `${header.sessionId}:${header.hostEpoch}:${header.bindingEpoch}`;
      if (header.sequence <= (latestSequences.get(epoch) ?? -1)) return "rejected";
      seenIds.set(header.messageId, identity);
      latestSequences.set(epoch, header.sequence);
      return "accepted";
    },
  };
}

export interface ClientCommandReplayGuard {
  accept(playerId: string, bindingEpoch: number, clientSequence: number): ReplayDecision;
}

export function createClientCommandReplayGuard(): ClientCommandReplayGuard {
  const latest = new Map<string, number>();
  const seen = new Set<string>();
  return {
    accept(playerId, bindingEpoch, clientSequence) {
      if (!Number.isSafeInteger(clientSequence) || clientSequence < 0) return "rejected";
      const key = `${playerId}:${bindingEpoch}`;
      const identity = `${key}:${clientSequence}`;
      if (seen.has(identity)) return "duplicate";
      const prior = latest.get(key);
      if (prior !== undefined && clientSequence < prior) return "rejected";
      seen.add(identity);
      latest.set(key, clientSequence);
      return "accepted";
    },
  };
}
