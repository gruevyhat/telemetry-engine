import { readFileSync } from "node:fs";
import {
  drawFrame,
  eligibleFrames,
  fireFrame,
  initialCooldownState,
  recordFired,
  type CooldownState,
  type IncidentFrame,
} from "../../engine/src/generate/frame.js";
import { runDegradeLadder, degradeReportedProposal, type DegradeOutcome } from "../../engine/src/degrade/ladder.js";
import { ask } from "../../engine/src/oracle/oracle.js";
import { createRng, type Rng } from "../../engine/src/rng/index.js";
import type { GameTime } from "../../engine/src/time/index.js";
import type { ActorRef, Fact } from "../../engine/src/ledger/types.js";

const REFEREE: ActorRef = { kind: "referee", id: "referee" };

export function loadDeck(relativePath: string): readonly IncidentFrame[] {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

/** [M1-12] Loaded once per process; both shipped decks are the same content the property suite
 * (packages/content-lint) already proves ambiguity-safe -- the sim harness trusts that gate
 * rather than re-running it per campaign. */
export const TRADE_DECK: readonly IncidentFrame[] = loadDeck("../../../content/decks/trade/frames.json");
export const GENERIC_DECK: readonly IncidentFrame[] = loadDeck("../../../content/decks/generic/frames.json");

export type CampaignEvent =
  | { readonly turn: number; readonly kind: "incident"; readonly frameId: string; readonly causeActorId: string }
  | { readonly turn: number; readonly kind: "degraded"; readonly rung: DegradeOutcome["rung"] };

export interface CampaignResult {
  readonly events: readonly CampaignEvent[];
  readonly facts: readonly Fact[];
}

function turnTime(turn: number): GameTime {
  return { day: turn * 7, slot: "DOCKSIDE" };
}

function asFact(id: string, t: GameTime, actor: ActorRef, kind: string, payload: Record<string, unknown>): Fact {
  return { id, wall: 0, t, kind, actor, payload, visibility: { level: "referee" } };
}

/**
 * [Spec §8.3/§17, M1-12] One incident draw per turn: `eligibleFrames` -> `drawFrame` -> `fireFrame`,
 * falling back to the INV-14 degradation ladder (generic-family frame, then oracle, per
 * `runDegradeLadder`) when the trade deck's pool is empty. Deliberately bespoke rather than a
 * `PhaseScript` run -- the sim measures incident generation, not turn UI flow, and a scripted
 * turn would step into confrontation/comms machinery M1 doesn't have (see BL-03/BL-05). No bot
 * policy decision gates whether a frame fires: `decide()` (npc/policy.ts) affects what a seated
 * lineup *does* about an incident (market/discrepancy actions), not whether the composer draws
 * one -- so this loop's incident stream is the same regardless of which lineup is watching it.
 */
export function runCampaign(seed: string, turns: number, deck: readonly IncidentFrame[] = TRADE_DECK, genericDeck: readonly IncidentFrame[] = GENERIC_DECK): CampaignResult {
  const rng: Rng = createRng(seed);
  const events: CampaignEvent[] = [];
  const facts: Fact[] = [];
  let cooldown: CooldownState = initialCooldownState;
  let factId = 0;

  for (let turn = 1; turn <= turns; turn++) {
    const t = turnTime(turn);
    const pool = eligibleFrames(deck, cooldown, turn);
    const drawn = drawFrame(pool, rng.derive(`sim:draw:${turn}`));

    if (drawn) {
      const fired = fireFrame(drawn, t, rng);
      for (const proposal of fired.causeProposals) {
        factId += 1;
        facts.push(asFact(`f${factId}`, proposal.t, proposal.actor, proposal.kind, proposal.payload));
      }
      cooldown = recordFired(cooldown, drawn, turn);
      const primary = fired.causeProposals[0];
      events.push({ turn, kind: "incident", frameId: drawn.id, causeActorId: primary ? primary.actor.id : "" });
      continue;
    }

    const outcome = runDegradeLadder({
      attemptGeneric: () => {
        const genericPool = eligibleFrames(genericDeck, initialCooldownState, turn);
        const genericFrame = drawFrame(genericPool, rng.derive(`sim:degrade-generic:${turn}`));
        if (!genericFrame) {
          throw new Error("no generic-family frame available");
        }
        return fireFrame(genericFrame, t, rng);
      },
      attemptOracle: () => ask(`What happens on turn ${turn} instead?`, "even", rng),
    });
    const reported = degradeReportedProposal(t, REFEREE, outcome);
    factId += 1;
    facts.push(asFact(`f${factId}`, reported.t, reported.actor, reported.kind, reported.payload));
    events.push({ turn, kind: "degraded", rung: outcome.rung });
  }

  return { events, facts };
}
