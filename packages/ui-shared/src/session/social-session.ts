import type { ActorRef, AdvanceResult, CommitmentPreimages, Fact, GameTime, PhaseInterpreter } from "@telemetry/engine";
import type { ProtocolPayloadMap } from "@telemetry/transport";

export interface SocialSessionDeps {
  readonly interpreter: PhaseInterpreter;
}

export interface OpenConfrontationInput {
  readonly topic: string;
  readonly declarer: string;
  readonly target: { readonly kind: "pc" | "npc"; readonly id: string };
  readonly eligiblePlayerIds: readonly string[];
  readonly objectiveFactId: string;
  readonly contents: unknown;
}

export type CastVoteResult =
  | { readonly topic: string; readonly status: "open"; readonly committed: readonly Fact[] }
  | { readonly topic: string; readonly status: "carried" | "failed"; readonly outcome: string; readonly committed: readonly Fact[] };

export interface SocialSession {
  /** `comms.queue` (decrypted) -> `queueCommsAction` -> `comms.ack` payload to send back. */
  handleCommsQueue(t: GameTime, message: ProtocolPayloadMap["comms.queue"]): ProtocolPayloadMap["comms.ack"];
  /** Advances the current phase-script step (referee-driven) -- closes a comms window (M2-05:
   * seeded close-order) or fires the incident `generate` step alike. Always goes through
   * `advanceCommitted`, never the sync `advance`: every M2 step this session drives carries
   * seeded RNG needing a commit/reveal seal (INV-8), and `advance` throws for exactly these step
   * kinds once `commitReveal` is configured (interpreter.ts). Not named after one specific step
   * kind because the same call shape serves both -- the interpreter, not this session, knows what
   * the current step actually is. */
  advanceStep(t: GameTime, actor: ActorRef): Promise<AdvanceResult & { readonly commitmentPreimages: CommitmentPreimages }>;
  /** `confrontation.command` (decrypted) -> `declareConfrontation` for `command: "accuse"`. The
   * other typed commands (search/let-lie/replace-captain/put-off-ship) are real protocol shapes
   * but M2-07 itself scoped their branches out unless separately carded, and this card's own
   * walkthrough only exercises an accusation vote, so they throw rather than silently no-op. */
  handleConfrontationCommand(t: GameTime, message: ProtocolPayloadMap["confrontation.command"]): Fact;
  /** Records a topic's static voting context (who's eligible, what's at stake) once, right after
   * a declared accusation. `castVote` needs this on every cast, and the wire protocol's
   * `vote.cast` payload carries none of it (screens-v2: eligibility/threshold are `vote.open`'s
   * own, host-authored fields, not something a client supplies). */
  openConfrontation(input: OpenConfrontationInput): void;
  /** `vote.cast` (decrypted) -> one `resolveConfrontation` call per cast, over the accumulated
   * ballot set for that topic (screens-v2 §4.2/§8.1: append-only, cumulative-tally
   * `vote.recorded`). Once a topic resolves to `carried`/`failed`, every later cast is a no-op
   * that returns the same cached result -- `resolveConfrontation` was never verified safe to call
   * again after a topic goes terminal (a repeat call would re-evaluate the full ballot set and
   * could re-append `envelope.opened`), so this is the one place that's guarded against it. */
  castVote(t: GameTime, topic: string, playerId: string, value: boolean): CastVoteResult;
}

/**
 * [M2-15b] Translation layer between the wire protocol (`@telemetry/transport`'s
 * `ProtocolPayloadMap`) and the phase interpreter -- routes decrypted inbound messages to the
 * one interpreter call each names, and shapes the interpreter's result back into the outbound
 * payload the protocol expects. Holds no game logic and no ledger access of its own: every fact
 * this session touches goes through `deps.interpreter`, never `ledger.append` directly (INV-6).
 * The only local state is per-topic voting context (`openConfrontation`) and the in-memory ballot
 * accumulator `castVote` builds up, since the wire protocol casts one ballot per message while
 * `resolveConfrontation` takes the full ballot set on every call.
 */
export function createSocialSession(deps: SocialSessionDeps): SocialSession {
  const ballotsByTopic = new Map<string, Record<string, boolean>>();
  const contextByTopic = new Map<string, OpenConfrontationInput>();
  const terminalResultByTopic = new Map<string, CastVoteResult & { readonly status: "carried" | "failed" }>();

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

    advanceStep(t, actor) {
      return deps.interpreter.advanceCommitted(t, actor);
    },

    handleConfrontationCommand(t, message) {
      if (message.command !== "accuse") throw new Error(`confrontation command "${message.command}" is not wired for this demo`);
      if (message.targetId === undefined) throw new Error("an accusation command requires targetId");
      return deps.interpreter.declareConfrontation(t, { kind: "pc", id: message.playerId }, { mode: "accusation", target: message.targetId });
    },

    openConfrontation(input) {
      contextByTopic.set(input.topic, input);
    },

    castVote(t, topic, playerId, value) {
      const cached = terminalResultByTopic.get(topic);
      if (cached) return cached;

      const context = contextByTopic.get(topic);
      if (!context) throw new Error(`castVote for topic "${topic}" before openConfrontation`);
      const ballots = { ...(ballotsByTopic.get(topic) ?? {}), [playerId]: value };
      ballotsByTopic.set(topic, ballots);

      const { committed } = deps.interpreter.resolveConfrontation({
        t,
        declarer: context.declarer,
        target: context.target,
        eligiblePlayerIds: context.eligiblePlayerIds,
        ballots,
        objectiveFactId: context.objectiveFactId,
        contents: context.contents,
      });
      const vote = committed.find((fact) => fact.kind === "vote.recorded");
      const status = (vote?.payload as { status?: "carried" | "failed" | "open" } | undefined)?.status;
      if (status === "open" || status === undefined) return { topic, status: "open", committed };

      const outcome = status === "carried" ? "burned" : "failed";
      const result: CastVoteResult & { status: "carried" | "failed" } = { topic, status, outcome, committed };
      terminalResultByTopic.set(topic, result);
      return result;
    },
  };
}
