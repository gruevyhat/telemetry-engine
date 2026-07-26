import { useEffect, useState } from "react";
import { encodePairingPayload, groupManualCode, type PairingMaterial } from "@telemetry/transport-webrtc";
import { TYPE_FLOOR_PX } from "./styles.js";

export type { DecodedPairingMaterial, PairingMaterial } from "@telemetry/transport-webrtc";
export { decodeManualPairingCode, decodePairingFragment } from "@telemetry/transport-webrtc";

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
