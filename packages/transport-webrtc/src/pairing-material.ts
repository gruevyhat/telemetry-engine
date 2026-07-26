/**
 * [M2-15b] The shared codec for a private pairing offer's QR/manual-code representation. Split
 * out of `ui-shared`'s `PairingCard` (which only ever encoded) once `ui-phone` needed to decode
 * the identical material -- a second, independently-written decoder would be a real correctness
 * risk if the two ever drifted, not just duplication. Pure encode/decode: no React, no engine,
 * no Ledger, matching this package's own "trystero adapter; no game rules" boundary.
 */
export interface PairingRosterEntry {
  readonly playerId: string;
  readonly label: string;
}

export interface PairingMaterial {
  readonly origin: string;
  readonly protocolVersion: 1;
  readonly sessionId: string;
  readonly playerId: string;
  readonly bindingEpoch: number;
  readonly claimToken: string;
  readonly transportKey: Uint8Array;
  /** Who else is seated -- not secret (everyone at the table can already see who's playing), so
   * carrying it here just saves the phone a second lookup for rendering an accusation target
   * list. Never anything about agendas, objectives, or votes. */
  readonly players: readonly PairingRosterEntry[];
}

export interface DecodedPairingMaterial {
  readonly protocolVersion: 1;
  readonly origin: string;
  readonly sessionId: string;
  readonly playerId: string;
  readonly bindingEpoch: number;
  readonly claimToken: string;
  readonly transportKey: Uint8Array;
  readonly players: readonly PairingRosterEntry[];
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function unhex(value: string): Uint8Array {
  return Uint8Array.from({ length: value.length / 2 }, (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16));
}

function toBase64Url(text: string): string {
  let binary = "";
  new TextEncoder().encode(text).forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

interface PairingPayload {
  readonly protocolVersion: 1;
  readonly origin: string;
  readonly sessionId: string;
  readonly playerId: string;
  readonly bindingEpoch: number;
  readonly claimToken: string;
  readonly transportKey: string;
  readonly players: readonly PairingRosterEntry[];
}

export function encodePairingPayload(material: PairingMaterial): string {
  const payload: PairingPayload = {
    protocolVersion: material.protocolVersion,
    origin: material.origin,
    sessionId: material.sessionId,
    playerId: material.playerId,
    bindingEpoch: material.bindingEpoch,
    claimToken: material.claimToken,
    transportKey: hex(material.transportKey),
    players: material.players,
  };
  return toBase64Url(JSON.stringify(payload));
}

function decodePairingPayload(encoded: string): DecodedPairingMaterial {
  const payload = JSON.parse(fromBase64Url(encoded)) as PairingPayload;
  return { ...payload, transportKey: unhex(payload.transportKey) };
}

/** The QR fragment is never sent in the page request or kept in referrer headers; the origin before `#` just orients a camera-independent reader. */
export function decodePairingFragment(pairingUrl: string): DecodedPairingMaterial {
  const hashIndex = pairingUrl.indexOf("#");
  if (hashIndex === -1) throw new Error("pairing URL has no fragment");
  return decodePairingPayload(pairingUrl.slice(hashIndex + 1));
}

const MANUAL_CODE_GROUP_SIZE = 5;

export function groupManualCode(payload: string): string {
  return (payload.match(new RegExp(`.{1,${MANUAL_CODE_GROUP_SIZE}}`, "g")) ?? []).join("-");
}

export function decodeManualPairingCode(code: string): DecodedPairingMaterial {
  return decodePairingPayload(code.replace(/[\s-]/g, ""));
}
