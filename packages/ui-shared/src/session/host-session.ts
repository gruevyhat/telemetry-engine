import {
  assembleBlackBoxArtifact,
  createKindRegistry,
  createLedger,
  createPhaseInterpreter,
  createRng,
  KINDS_V0,
  verifyBlackBoxArtifact,
  buildPlayerDelivery,
  type AgendaDeck,
  type ActorRef,
  type BlackBoxArtifact,
  type BlackBoxVerification,
  type CampaignSeedPreimage,
  type CommitmentPreimages,
  type GameTime,
  type IncidentFrame,
  type Ledger,
  type LoadedPhaseScript,
  type PhaseInterpreter,
  type SecretDrawPreimage,
} from "@telemetry/engine";
import { createPairingHost, type EnvelopeChannel, type PairingHost, type PairingMaterial, type PairingOffer } from "@telemetry/transport-webrtc";
import { PROTOCOL_VERSION, type ProtocolPayloadMap } from "@telemetry/transport";
import { createSocialSession } from "./social-session.js";

const REFEREE: ActorRef = { kind: "referee", id: "referee" };

export interface HostSessionPlayer {
  readonly playerId: string;
  readonly label: string;
}

export interface HostSessionConfig {
  readonly sessionId: string;
  readonly origin: string;
  readonly campaignSeed: string;
  readonly campaignSalt: string;
  /** Fixed for the whole scene: this session drives one comms-to-accusation scene, not a
   * multi-day campaign, so there's no day/slot progression to derive. */
  readonly t: GameTime;
  readonly script: LoadedPhaseScript;
  readonly deck: AgendaDeck;
  readonly currentHex: string;
  readonly incidentDeck: readonly IncidentFrame[];
  readonly players: readonly HostSessionPlayer[];
  readonly channel: EnvelopeChannel;
  /** Called after every ledger-changing or pairing-changing operation, including ones triggered
   * by an inbound phone message the shared screen has no other way to learn about (it isn't
   * polling). A real UI re-renders off this; tests can ignore it. */
  readonly onChange?: () => void;
}

export interface HostSession {
  readonly ledger: Ledger;
  readonly interpreter: PhaseInterpreter;
  pairingMaterialFor(playerId: string): PairingMaterial;
  claimedPlayerIds(): readonly string[];
  dealAgendas(): Promise<void>;
  advanceStep(): Promise<{ readonly rendered?: string }>;
  assembleBlackBox(): Promise<{ readonly artifact: BlackBoxArtifact; readonly verification: BlackBoxVerification }>;
}

function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * [M2-15b] Composes the ledger, phase interpreter, `PairingHost`, and `SocialSession` into one
 * running session for the M2 demo -- the `App`/`createTradeSession` equivalent for the social
 * scene, but transport-mediated: every player action arrives as a real encrypted envelope over
 * `config.channel`, not a direct call. Pairing, dealing, comms, the incident, and voting all end
 * with a `state.snapshot` re-send to whichever players just gained new authorized facts; the
 * shared screen is expected to read `host.ledger` directly (it's on the same machine, so no
 * transport boundary applies to it -- only phones cross that boundary).
 */
export function createHostSession(config: HostSessionConfig): HostSession {
  const ledger = createLedger(createKindRegistry(KINDS_V0));
  const rng = createRng(config.campaignSeed);
  const agendaActions = config.deck.agendas.flatMap((agenda) => agenda.actions);
  const interpreter = createPhaseInterpreter(ledger, config.script, {
    rng,
    deck: config.incidentDeck,
    commitReveal: { campaignSeed: config.campaignSeed, campaignSalt: config.campaignSalt },
    agenda: { actions: agendaActions, currentHex: config.currentHex, registry: createKindRegistry(KINDS_V0) },
  });
  const socialSession = createSocialSession({ interpreter });

  const offers: PairingOffer[] = config.players.map((player) => ({
    playerId: player.playerId,
    bindingEpoch: 1,
    claimToken: hex(randomBytes(16)),
    key: randomBytes(32),
  }));
  const offersByPlayerId = new Map(offers.map((offer) => [offer.playerId, offer]));
  const pairingHost: PairingHost = createPairingHost({ sessionId: config.sessionId, hostEpoch: 1, offers });

  const agendaActionsByObjectiveId = Object.fromEntries(
    config.deck.agendas.map((agenda) => [agenda.id, agenda.actions.map((action) => ({ actionId: action.id, templateKey: action.labelTemplate }))]),
  );

  const peerIdToPlayerId = new Map<string, string>();
  const playerIdToPeerId = new Map<string, string>();
  let sequence = 0;
  let seedPreimage: CampaignSeedPreimage | undefined;
  const drawPreimages: SecretDrawPreimage[] = [];

  function recordPreimages(preimages: CommitmentPreimages): void {
    if (preimages.seed && !seedPreimage) seedPreimage = preimages.seed;
    drawPreimages.push(...preimages.draws);
  }

  async function snapshotTo(playerId: string): Promise<void> {
    const peerId = playerIdToPeerId.get(playerId);
    if (peerId === undefined) return;
    sequence += 1;
    const delivery = buildPlayerDelivery(ledger, playerId, { agendaActionsByObjectiveId });
    const envelope = await pairingHost.snapshot(playerId, delivery, sequence);
    config.channel.send(envelope, peerId);
  }

  async function snapshotAll(): Promise<void> {
    await Promise.all(config.players.map((player) => snapshotTo(player.playerId)));
  }

  /** [Spec Appendix A "no traitor exists" / worked example] The forced envelope's contents are
   * the target's own true state: the deck's fixed "LOYAL" marker for the routine (non-agenda)
   * objective, or the dealt agenda's own id otherwise. The Spec doesn't prescribe a literal
   * string for the agenda case (resolveConfrontation's own tests use opaque caller-supplied
   * values like "LOYAL"/"SIM-CONTENTS"), so this is this card's extrapolation, not a derived
   * rule -- a real renderer would still need to turn either into MAGGIE-voiced prose. */
  function envelopeContentsFor(targetId: string): { objectiveFactId: string; contents: string } | undefined {
    const objective = [...ledger.all()].reverse().find((fact) => fact.kind === "objective.assigned" && fact.payload.playerId === targetId);
    if (!objective) return undefined;
    const objectiveId = objective.payload.objectiveId as string;
    return { objectiveFactId: objective.id, contents: objectiveId === config.deck.routineObjective.id ? "LOYAL" : objectiveId };
  }

  config.channel.onReceive((envelope, peerId) => {
    // Real message delivery is fire-and-forget (a WebRTC send has no receipt promise), so this
    // handler is declared void per EnvelopeChannel's own signature -- but TS's void-return
    // compatibility rule (the same one that lets Array.forEach take an async callback) also lets
    // it actually return the promise, which the test-only fake hub uses to await processing
    // deterministically instead of racing real async pairing/decrypt work.
    return (async () => {
      if (!peerIdToPlayerId.has(peerId)) {
        const claimed = await pairingHost.receiveClaim(peerId, envelope);
        if (claimed?.status === "accepted") {
          peerIdToPlayerId.set(peerId, claimed.playerId);
          playerIdToPeerId.set(claimed.playerId, peerId);
          await snapshotTo(claimed.playerId);
          config.onChange?.();
        }
        return;
      }

      const result = await pairingHost.receive(peerId, envelope);
      if (result.status !== "accepted") return;
      const { playerId, message } = result;

      switch (message.header.type) {
        case "comms.queue": {
          socialSession.handleCommsQueue(config.t, message.payload as ProtocolPayloadMap["comms.queue"]);
          await snapshotTo(playerId);
          config.onChange?.();
          break;
        }
        case "confrontation.command": {
          const payload = message.payload as ProtocolPayloadMap["confrontation.command"];
          socialSession.handleConfrontationCommand(config.t, payload);
          if (payload.command === "accuse" && payload.targetId) {
            const context = envelopeContentsFor(payload.targetId);
            if (context) {
              socialSession.openConfrontation({
                topic: `burn:${payload.targetId}`,
                declarer: playerId,
                target: { kind: "pc", id: payload.targetId },
                eligiblePlayerIds: config.players.map((player) => player.playerId),
                objectiveFactId: context.objectiveFactId,
                contents: context.contents,
              });
            }
          }
          await snapshotAll();
          config.onChange?.();
          break;
        }
        case "vote.cast": {
          const payload = message.payload as ProtocolPayloadMap["vote.cast"];
          socialSession.castVote(config.t, payload.topic, payload.playerId, payload.value);
          await snapshotAll();
          config.onChange?.();
          break;
        }
        default:
          break;
      }
    })();
  });

  return {
    ledger,
    interpreter,

    pairingMaterialFor(playerId) {
      const offer = offersByPlayerId.get(playerId);
      if (!offer) throw new Error(`no pairing offer for player ${playerId}`);
      return {
        origin: config.origin,
        protocolVersion: PROTOCOL_VERSION,
        sessionId: config.sessionId,
        playerId,
        bindingEpoch: offer.bindingEpoch,
        claimToken: offer.claimToken,
        transportKey: offer.key,
        players: config.players,
      };
    },

    claimedPlayerIds() {
      return [...playerIdToPeerId.keys()];
    },

    async dealAgendas() {
      const deal = await interpreter.dealAgendas({ t: config.t, players: config.players.map((player) => player.playerId), deck: config.deck });
      recordPreimages(deal.commitmentPreimages);
      await snapshotAll();
      config.onChange?.();
    },

    async advanceStep() {
      const result = await socialSession.advanceStep(config.t, REFEREE);
      recordPreimages(result.commitmentPreimages);
      await snapshotAll();
      config.onChange?.();
      return { rendered: result.rendered };
    },

    async assembleBlackBox() {
      if (!seedPreimage) throw new Error("no seed commitment yet -- deal agendas before assembling the black box");
      const artifact = await assembleBlackBoxArtifact({ facts: ledger.all(), seedPreimage, drawPreimages });
      const verification = await verifyBlackBoxArtifact(artifact);
      return { artifact, verification };
    },
  };
}
