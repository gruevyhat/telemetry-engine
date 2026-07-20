import { useState } from "react";
import QRCode from "qrcode";
import { loadPhaseScript, type AgendaDeck, type IncidentFrame, type PhaseScript } from "@telemetry/engine";
import { createEnvelopeChannel, joinSessionRoom, type EnvelopeChannel } from "@telemetry/transport-webrtc";
import agendaDeckJson from "../../../content/decks/trade/agendas.json";
import tradeFramesJson from "../../../content/decks/trade/frames.json";
import socialSceneScriptJson from "../../../content/frames/social-scene/turn.json";
import { ConfrontationPanel, PairingCard } from "./shared-screen/index.js";
import { createHostSession, type HostSession } from "./session/host-session.js";

const DECK = agendaDeckJson as unknown as AgendaDeck;
const INCIDENT_DECK = tradeFramesJson as unknown as readonly IncidentFrame[];
const SCRIPT = loadPhaseScript(socialSceneScriptJson as unknown as PhaseScript);

/** [M2-15b demo] The published agenda deck's own odds (0.28) reliably deals fewer than two real
 * agendas across three seats on most seeds -- the M2 exit demo wants "published odds" AND "two
 * colliding actions" in the same run. `social-demo-4` is a real, searched seed (not a lowered
 * odds setting) that deals two of three players the deck's real agenda:independent-skim at 0.28:
 * verified by hand against this exact deck before picking it, not asserted here as a property
 * that could silently stop holding if the deck or RNG ever changes. */
const CAMPAIGN_SEED = "social-demo-4";
const T = { day: 7, slot: "COMMS" as const };

const PLAYERS = [
  { playerId: "pc:zhan", label: "Zhan" },
  { playerId: "pc:deuce", label: "Deuce" },
  { playerId: "pc:brennan", label: "Brennan" },
];
const PLAYER_LABELS = Object.fromEntries(PLAYERS.map((player) => [player.playerId, player.label]));

function qrEncoder(value: string): Promise<string> {
  return QRCode.toDataURL(value);
}

function defaultCreateChannel(sessionId: string): EnvelopeChannel {
  return createEnvelopeChannel(joinSessionRoom({ appId: "telemetry-engine", sessionId }));
}

export interface SocialAppProps {
  /** Injected for testability; defaults to a real trystero room join. */
  readonly createChannel?: (sessionId: string) => EnvelopeChannel;
}

/**
 * [M2-15b] The M2 milestone demo's shared-screen entry point, parallel to `App.tsx`'s M1 solo
 * hotseat demo (never touched by this card): pairs each seat by its own private card, then shows
 * the live public scene -- who has joined, the operator's Deal/Advance controls, and the
 * confrontation/vote state -- reading `host.ledger` directly rather than through the transport
 * boundary (this process holds the real Ledger; only phones cross that boundary). Does not
 * implement disconnect/hotseat UI (deliberately deferred -- see docs/handoffs/M2-15b-2.md: real
 * WebRTC disconnect detection runs on ICE timeout, which would make a live demo's "force a
 * disconnect" step hang unpredictably; an operator-driven control belongs here on top of the
 * already-shipped `DisconnectPanel`, not built by this card).
 */
export function SocialApp({ createChannel = defaultCreateChannel }: SocialAppProps = {}) {
  const [, setRevision] = useState(0);
  const [host] = useState<HostSession>(() => {
    const sessionId = `social-${Math.random().toString(36).slice(2)}`;
    const channel = createChannel(sessionId);
    return createHostSession({
      sessionId,
      origin: `${window.location.origin}${window.location.pathname}`,
      campaignSeed: CAMPAIGN_SEED,
      campaignSalt: "m2-browser-demo",
      t: T,
      script: SCRIPT,
      deck: DECK,
      currentHex: "Regina",
      incidentDeck: INCIDENT_DECK,
      players: PLAYERS,
      channel,
      onChange: () => setRevision((value) => value + 1),
    });
  });

  const claimed = new Set(host.claimedPlayerIds());
  const facts = host.ledger.all();
  const publicFacts = facts.filter((fact) => fact.visibility.level === "public");
  const opened = [...publicFacts].reverse().find((fact) => fact.kind === "confrontation.opened");
  const allClaimed = PLAYERS.every((player) => claimed.has(player.playerId));
  const dealt = facts.some((fact) => fact.kind === "objective.assigned");
  const incidentFired = facts.some((fact) => fact.kind === "lock.cycled");

  async function rerenderAfter(action: () => Promise<unknown>): Promise<void> {
    await action();
    setRevision((value) => value + 1);
  }

  return (
    <div style={{ background: "#16181d", color: "#f4f1e8", minHeight: "100vh", padding: "1.5rem", fontSize: "20px" }}>
      <h1>Telemetry Engine — social scene</h1>

      {!allClaimed && (
        <section aria-labelledby="pairing-heading">
          <h2 id="pairing-heading">Pairing</h2>
          {PLAYERS.filter((player) => !claimed.has(player.playerId)).map((player) => (
            <PairingCard key={player.playerId} playerName={player.label} material={host.pairingMaterialFor(player.playerId)} qrEncoder={qrEncoder} />
          ))}
        </section>
      )}

      {allClaimed && !dealt && (
        <button type="button" onClick={() => void rerenderAfter(() => host.dealAgendas())}>
          Deal agendas
        </button>
      )}

      {dealt && !incidentFired && (
        <button type="button" onClick={() => void rerenderAfter(async () => { await host.advanceStep(); await host.advanceStep(); })}>
          Close comms window
        </button>
      )}

      {opened && (
        <ConfrontationPanel
          facts={facts}
          remainingSeconds={0}
          playerLabels={PLAYER_LABELS}
          accusationTargets={[]}
          onAccuse={() => {}}
        />
      )}

      <section aria-labelledby="log-heading">
        <h2 id="log-heading">Public log</h2>
        <ul>
          {publicFacts.map((fact) => (
            <li key={fact.id}>{fact.kind}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
