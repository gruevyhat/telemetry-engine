import { useRef, useState } from "react";
import {
  createEnvelopeChannel,
  createPairingClient,
  decodeManualPairingCode,
  joinSessionRoom,
  type EnvelopeChannel,
  type PairingRosterEntry,
} from "@telemetry/transport-webrtc";
import { encryptMessage, PROTOCOL_VERSION, type BoundHeader, type MessageType, type PresentedFactDTO, type ProtocolMessage, type ProtocolPayloadMap } from "@telemetry/transport";
import { CommsScreen } from "@telemetry/ui-shared/src/phone-screen/index.js";

export interface AppProps {
  /** Injected for testability; defaults to a real trystero room join. */
  readonly createChannel?: (sessionId: string) => EnvelopeChannel;
}

function defaultCreateChannel(sessionId: string): EnvelopeChannel {
  return createEnvelopeChannel(joinSessionRoom({ appId: "telemetry-engine", sessionId }));
}

interface PairedState {
  readonly playerId: string;
  readonly bindingEpoch: number;
  readonly sessionId: string;
  readonly key: Uint8Array;
  readonly channel: EnvelopeChannel;
  readonly players: readonly PairingRosterEntry[];
}

function latest(facts: readonly PresentedFactDTO[], kind: string): PresentedFactDTO | undefined {
  return [...facts].reverse().find((fact) => fact.kind === kind);
}

/**
 * [M2-15b] The real phone client: pairs by decoding the shared screen's private manual code
 * (the camera-independent path screens-v2 §10 requires regardless of QR support, and the only
 * one buildable/testable without a live camera here), joins the same trystero room the host did,
 * and renders one of three states off the latest `state.snapshot` -- comms action menu, an
 * accusation control, or a vote control -- reusing `CommsScreen` from `@telemetry/ui-shared`
 * rather than a second copy. Does not implement QR scanning, disconnect UI, or the full M2
 * protocol surface (no dedicated `comms.ack`/`vote.resolved` handling): the card's own scope cut
 * is that this only needs to cover the milestone demo's walkthrough, not the full feature set.
 */
export function App({ createChannel = defaultCreateChannel }: AppProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [paired, setPaired] = useState<PairedState | undefined>(undefined);
  const [snapshot, setSnapshot] = useState<ProtocolPayloadMap["state.snapshot"] | undefined>(undefined);
  const sequenceRef = useRef(1);

  function nextSequence(): number {
    const value = sequenceRef.current;
    sequenceRef.current += 1;
    return value;
  }

  function send<T extends MessageType>(state: PairedState, type: T, payload: ProtocolPayloadMap[T]): void {
    const header: BoundHeader<T> = {
      protocolVersion: PROTOCOL_VERSION,
      sessionId: state.sessionId,
      hostEpoch: 1,
      bindingEpoch: state.bindingEpoch,
      sequence: nextSequence(),
      messageId: `${state.playerId}-${type}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      type,
    };
    const message = { header, payload } as ProtocolMessage;
    void encryptMessage(state.key, message).then((envelope) => state.channel.send(envelope));
  }

  function pair(): void {
    let decoded;
    try {
      decoded = decodeManualPairingCode(code.trim());
    } catch {
      setError("That code did not decode. Check it and try again.");
      return;
    }
    const client = createPairingClient({ playerId: decoded.playerId, bindingEpoch: decoded.bindingEpoch, claimToken: decoded.claimToken, key: decoded.transportKey });
    const channel = createChannel(decoded.sessionId);
    channel.onReceive((envelope) => {
      void client.receive(envelope).then((message) => {
        if (message.header.type === "state.snapshot") {
          setSnapshot(message.payload as ProtocolPayloadMap["state.snapshot"]);
        }
      });
    });
    const state: PairedState = { playerId: decoded.playerId, bindingEpoch: decoded.bindingEpoch, sessionId: decoded.sessionId, key: decoded.transportKey, channel, players: decoded.players };
    setPaired(state);
    setError(undefined);
    send(state, "pair.claim", { playerId: decoded.playerId, claimToken: decoded.claimToken });
  }

  if (!paired) {
    return (
      <div>
        <h1>Telemetry Engine</h1>
        <label>
          Pairing code
          <input aria-label="pairing code" value={code} onChange={(event) => setCode(event.target.value)} />
        </label>
        <button type="button" onClick={pair}>
          Pair
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  }

  if (!snapshot) {
    return <p>Waiting for the host.</p>;
  }

  const { delivery } = snapshot;
  const opened = latest(delivery.publicFacts, "confrontation.opened");

  if (opened) {
    const target = typeof opened.payload.target === "string" ? opened.payload.target : undefined;
    const topic = `burn:${target}`;
    const vote = latest(delivery.publicFacts, "vote.recorded");
    const status = vote && vote.payload.topic === topic && typeof vote.payload.status === "string" ? vote.payload.status : undefined;
    const ballots = vote && vote.payload.topic === topic && typeof vote.payload.ballots === "object" && vote.payload.ballots !== null
      ? vote.payload.ballots as Record<string, unknown> : {};
    const alreadyVoted = ballots[paired.playerId] !== undefined;

    if (status === "carried" || status === "failed") {
      return <p data-testid="vote-closed">The vote is closed: {status}.</p>;
    }
    if (alreadyVoted) {
      return <p>Vote submitted. Waiting on the rest of the table.</p>;
    }
    return (
      <section aria-labelledby="vote-heading">
        <h2 id="vote-heading">Vote</h2>
        <p>Does {target} keep the envelope sealed?</p>
        <button type="button" onClick={() => send(paired, "vote.cast", { playerId: paired.playerId, clientSequence: nextSequence(), topic, value: true })}>
          Yes
        </button>
        <button type="button" onClick={() => send(paired, "vote.cast", { playerId: paired.playerId, clientSequence: nextSequence(), topic, value: false })}>
          No
        </button>
      </section>
    );
  }

  const otherPlayers = paired.players.filter((player) => player.playerId !== paired.playerId);

  return (
    <>
      <CommsScreen
        remainingSeconds={snapshot.remainingSeconds}
        actions={delivery.agendaPacket?.actions ?? []}
        onQueueAction={(actionId) =>
          send(paired, "comms.queue", { playerId: paired.playerId, clientSequence: nextSequence(), clientCommandId: `${paired.playerId}-comms-${Date.now()}`, windowId: "window-1", actionId })
        }
      />
      {otherPlayers.length > 0 && (
        <section aria-labelledby="accuse-heading">
          <h2 id="accuse-heading">Accuse</h2>
          {otherPlayers.map((player) => (
            <button
              key={player.playerId}
              type="button"
              onClick={() =>
                send(paired, "confrontation.command", {
                  playerId: paired.playerId,
                  clientSequence: nextSequence(),
                  clientCommandId: `${paired.playerId}-accuse-${Date.now()}`,
                  command: "accuse",
                  targetId: player.playerId,
                })
              }
            >
              Accuse {player.label}
            </button>
          ))}
        </section>
      )}
    </>
  );
}
