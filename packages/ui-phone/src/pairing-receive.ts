import type {
  EncryptedEnvelope,
  ProtocolMessage,
} from "@telemetry/transport";
import type { PairingClient } from "@telemetry/transport-webrtc";

function isDecryptFailure(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "OperationError"
  );
}

/**
 * A broadcast from a differently keyed seat is unreadable by design. Classify
 * that expected AES-GCM failure as routine cross-talk while preserving replay
 * and protocol errors as real failures.
 */
export async function receivePairingEnvelope(
  client: Pick<PairingClient, "receive">,
  envelope: EncryptedEnvelope,
): Promise<ProtocolMessage | undefined> {
  try {
    return await client.receive(envelope);
  } catch (error) {
    if (isDecryptFailure(error)) return undefined;
    throw error;
  }
}
