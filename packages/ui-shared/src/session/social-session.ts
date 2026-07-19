import type { ActorRef, Fact, GameTime, PhaseInterpreter } from "@telemetry/engine";
import type { ProtocolPayloadMap } from "@telemetry/transport";

export interface SocialSessionDeps {
  readonly interpreter: PhaseInterpreter;
}

export interface ConfrontationCloseInput {
  readonly t: GameTime;
  readonly topic: string;
  readonly declarer: string;
  readonly target: { readonly kind: "pc" | "npc"; readonly id: string };
  readonly eligiblePlayerIds: readonly string[];
  readonly objectiveFactId: string;
  readonly contents: unknown;
}

export interface SocialSession {
  /** `comms.queue` (decrypted) -> `queueCommsAction` -> `comms.ack` payload to send back. */
  handleCommsQueue(t: GameTime, message: ProtocolPayloadMap["comms.queue"]): ProtocolPayloadMap["comms.ack"];
  /** Closes the comms window (referee-driven `advance`); the resulting facts are read off the ledger. */
  closeCommsWindow(t: GameTime, actor: ActorRef): { readonly committed: readonly Fact[] };
  /** `vote.cast` (decrypted) accumulates into an in-memory ballot for its topic; no ledger write yet. */
  castVote(topic: string, playerId: string, value: boolean): void;
  /** Resolves the accumulated ballots for one topic via `resolveConfrontation`, returns the `vote.resolved` payload. */
  closeConfrontation(input: ConfrontationCloseInput): ProtocolPayloadMap["vote.resolved"] & { readonly committed: readonly Fact[] };
}

/**
 * [M2-15b] Translation layer between the wire protocol (`@telemetry/transport`'s
 * `ProtocolPayloadMap`) and the phase interpreter -- routes decrypted inbound messages to the
 * one interpreter call each names, and shapes the interpreter's result back into the outbound
 * payload the protocol expects. Holds no game logic and no ledger access of its own: every fact
 * this session touches goes through `deps.interpreter`, never `ledger.append` directly (INV-6).
 * The only local state is the in-memory ballot accumulator `castVote` builds up, since the wire
 * protocol casts one ballot per message while `resolveConfrontation` takes the full ballot set in
 * one call.
 */
export function createSocialSession(deps: SocialSessionDeps): SocialSession {
  const ballotsByTopic = new Map<string, Record<string, boolean>>();

  return {
    handleCommsQueue(t, message) {
      const fact = deps.interpreter.queueCommsAction({
        t,
        playerId: message.playerId,
        windowId: message.windowId,
        actionId: message.actionId,
        targetFactId: message.targetFactId,
        clientCommandId: message.clientCommandId,
      });
      return { clientCommandId: message.clientCommandId, committedFactId: fact.id };
    },

    closeCommsWindow(t, actor) {
      return deps.interpreter.advance(t, actor);
    },

    castVote(topic, playerId, value) {
      const ballots = ballotsByTopic.get(topic) ?? {};
      ballotsByTopic.set(topic, { ...ballots, [playerId]: value });
    },

    closeConfrontation(input) {
      const ballots = ballotsByTopic.get(input.topic) ?? {};
      const { committed } = deps.interpreter.resolveConfrontation({
        t: input.t,
        declarer: input.declarer,
        target: input.target,
        eligiblePlayerIds: input.eligiblePlayerIds,
        ballots,
        objectiveFactId: input.objectiveFactId,
        contents: input.contents,
      });
      const vote = committed.find((fact) => fact.kind === "vote.recorded");
      const status = (vote?.payload as { status?: "carried" | "failed" | "open" } | undefined)?.status;
      if (status !== "carried" && status !== "failed") throw new Error("confrontation did not resolve to a terminal status");
      const outcome = status === "carried" ? "burned" : "failed";
      return { topic: input.topic, status, outcome, committed };
    },
  };
}
