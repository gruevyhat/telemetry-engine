import { useEffect, useState } from "react";
import { TYPE_FLOOR_PX } from "./styles.js";

export interface PairingMaterial {
  readonly origin: string;
  readonly protocolVersion: 1;
  readonly sessionId: string;
  readonly playerId: string;
  readonly bindingEpoch: number;
  readonly claimToken: string;
  readonly transportKey: Uint8Array;
}

export interface DecodedPairingMaterial {
  readonly protocolVersion: 1;
  readonly origin: string;
  readonly sessionId: string;
  readonly playerId: string;
  readonly bindingEpoch: number;
  readonly claimToken: string;
  readonly transportKey: Uint8Array;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function unhex(value: string): Uint8Array {
  return Uint8Array.from({ length: value.length / 2 }, (_, index) =>
    Number.parseInt(value.slice(index * 2, index * 2 + 2), 16),
  );
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
}

function encodePairingPayload(material: PairingMaterial): string {
  const payload: PairingPayload = {
    protocolVersion: material.protocolVersion,
    origin: material.origin,
    sessionId: material.sessionId,
    playerId: material.playerId,
    bindingEpoch: material.bindingEpoch,
    claimToken: material.claimToken,
    transportKey: hex(material.transportKey),
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

function groupManualCode(payload: string): string {
  return (payload.match(new RegExp(`.{1,${MANUAL_CODE_GROUP_SIZE}}`, "g")) ?? []).join("-");
}

export function decodeManualPairingCode(code: string): DecodedPairingMaterial {
  return decodePairingPayload(code.replace(/[\s-]/g, ""));
}

export interface PairingCardProps {
  readonly playerName: string;
  readonly material: PairingMaterial;
  readonly qrEncoder: (value: string) => Promise<string>;
}

export function PairingCard({ playerName, material, qrEncoder }: PairingCardProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const payload = encodePairingPayload(material);
  const pairingUrl = `${material.origin}#${payload}`;
  const manualCode = groupManualCode(payload);

  useEffect(() => {
    if (!acknowledged) return;
    let cancelled = false;
    void qrEncoder(pairingUrl).then((dataUrl) => {
      if (!cancelled) setQrDataUrl(dataUrl);
    });
    return () => {
      cancelled = true;
    };
  }, [acknowledged, pairingUrl, qrEncoder]);

  if (!acknowledged) {
    return (
      <div role="dialog" aria-label="hand-to-player" style={{ fontSize: `${TYPE_FLOOR_PX}px` }}>
        <p>Hand the device to {playerName}.</p>
        <button type="button" onClick={() => setAcknowledged(true)}>
          I am {playerName}. Show private pairing card.
        </button>
      </div>
    );
  }

  return (
    <div role="region" aria-label={`${playerName}'s private pairing card`} style={{ fontSize: `${TYPE_FLOOR_PX}px` }}>
      {qrDataUrl !== null && <img src={qrDataUrl} alt={`${playerName} phone pairing QR code`} />}
      <p>Scan this with {playerName}&apos;s phone. The code is private to this seat.</p>
      <p>If a camera will not reach it, this is a private full-length code. Type it in by hand.</p>
      <code data-testid="manual-pairing-code">{manualCode}</code>
    </div>
  );
}
