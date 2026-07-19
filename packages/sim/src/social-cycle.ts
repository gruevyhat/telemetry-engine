import { readFileSync } from "node:fs";
import {
  createKindRegistry,
  createLedger,
  createPhaseInterpreter,
  createRng,
  KINDS_V0,
  loadPhaseScript,
  decideSocial,
  consistentWorlds,
  IMPLIES_V0,
  fireFrame,
  drawFrame,
  eligibleFrames,
  initialCooldownState,
  assembleBlackBoxArtifact,
  verifyBlackBoxArtifact,
  type AgendaDeck,
  type BlackBoxVerification,
  type SecretDrawPreimage,
  type SocialAction,
} from "../../engine/src/index.js";
import { TRADE_DECK } from "./campaign.js";
import { LINEUPS, LINEUP_AGENDA_ODDS, type LineupName } from "./lineups.js";
import type { SocialGroundTruthSample } from "./metrics.js";

function loadAgendaDeck(relativePath: string): AgendaDeck {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

/** [M2-15b] The production agenda content authored for this milestone's demo/sim, not a test
 * fixture -- content-lint validates it (pnpm lint:content). */
export const TRADE_AGENDAS: AgendaDeck = loadAgendaDeck("../../../content/decks/trade/agendas.json");

const T = { day: 7, slot: "COMMS" as const };
const SCRIPT = loadPhaseScript({
  frame: "social-cycle",
  start: "comms",
  steps: [
    { id: "comms", kind: "commsWindow" as const, next: "after" },
    { id: "after", kind: "announce" as const, next: "comms" },
  ],
});

function noLedgerView() {
  return {
    facts: [],
    peekFullLedger(): never {
      throw new Error("sim policy has no hidden-ledger access");
    },
  };
}

export interface SocialCycleResult {
  readonly sample?: SocialGroundTruthSample;
  readonly worldsSize: number;
  readonly verification: BlackBoxVerification;
}

/**
 * [M2-15b, Spec §21.2/§21.4] One complete social cycle: an independent agenda deal, one comms
 * window resolved by real bot policy (`decideSocial`), one surfaced incident (ambiguity checked
 * the inv10 way -- over the fired frame's own cause, never the comms-window fact, since
 * cargo.diverted's implies rule needs supporting lock/access facts this cycle doesn't produce),
 * an accusation/vote cycle if any bot chooses to accuse, and a verified black box. Misattribution
 * ground truth (`actual`) is the referee's own knowledge of who committed the comms-window's
 * winning `cargo.diverted` fact -- not an inference, since the sim already knows it.
 */
export async function runSocialCycle(seed: string, lineup: LineupName): Promise<SocialCycleResult> {
  const members = LINEUPS[lineup].filter((member) => member.isPC);
  const playerIds = members.map((member) => member.actorId);
  const rng = createRng(seed);
  const ledger = createLedger(createKindRegistry(KINDS_V0));
  const deck: AgendaDeck = { ...TRADE_AGENDAS, odds: LINEUP_AGENDA_ODDS[lineup] };
  const allActions = deck.agendas.flatMap((agenda) => agenda.actions);
  const interpreter = createPhaseInterpreter(ledger, SCRIPT, {
    rng,
    deck: [],
    commitReveal: { campaignSeed: seed, campaignSalt: `${seed}-salt` },
    agenda: { actions: allActions, currentHex: "Regina", registry: createKindRegistry(KINDS_V0) },
  });

  const deal = await interpreter.dealAgendas({ t: T, players: playerIds, deck });
  const drawPreimages: SecretDrawPreimage[] = [...deal.commitmentPreimages.draws];
  const crate = ledger.append({
    t: T, kind: "cargo.loaded", actor: { kind: "world", id: "world" },
    payload: { lotId: "L1", tons: 2, manifestId: "M1", bay: "hold" },
  });

  const objectiveByPlayer = new Map<string, string>();
  for (const playerId of playerIds) {
    const objective = ledger.all().find((fact) => fact.kind === "objective.assigned" && fact.payload.playerId === playerId)!;
    objectiveByPlayer.set(playerId, objective.payload.objectiveId as string);
  }
  const actionsByAgendaId = new Map(deck.agendas.map((agenda) => [agenda.id, agenda.actions]));

  for (const member of members) {
    const actions = actionsByAgendaId.get(objectiveByPlayer.get(member.actorId)!) ?? [];
    const offers = actions.map((action) => ({ actionId: action.id, payout: action.payout, exposure: action.exposure.delta / 3, accessible: true }));
    const decision = decideSocial(
      { situation: "commsWindow", offers },
      member.disposition,
      noLedgerView(),
      rng.derive(`npc:${member.actorId}:comms`),
    );
    if (decision.kind === "comms.choose") {
      interpreter.queueCommsAction({ t: T, playerId: member.actorId, windowId: "window-1", actionId: decision.actionId, targetFactId: crate.id, clientCommandId: `${member.actorId}-comms` });
    }
  }

  const closed = await interpreter.advanceCommitted(T, { kind: "referee", id: "referee" });
  drawPreimages.push(...closed.commitmentPreimages.draws);
  const actual = ledger.all().find((fact) => fact.kind === "cargo.diverted")?.actor.id;

  // Surface one ambiguous incident. Checked the inv10 way: over the fired frame's own cause,
  // with the supporting facts its innocentTwin spec already produces -- independent of whatever
  // happened in the comms window above. The roster here is the trade deck's own fixed cast (the
  // same roster inv10-property.test.ts uses), not the sim lineup's abstract actor ids: the
  // shipped frames' ambiguity is authored against named characters (pc:brennan, npc:kessler,
  // npc:reyes, npc:okonkwo...) baked into content/decks/trade/frames.json, independent of which
  // bot lineup is nominally seated for this cycle's agenda/comms/confrontation story.
  const CONTENT_ROSTER = ["pc:zhan", "pc:brennan", "pc:deuce", "npc:kessler", "npc:reyes", "npc:okonkwo", "npc:duty-officer", "npc:backup-officer"];
  const pool = eligibleFrames(TRADE_DECK, initialCooldownState, 1);
  const drawnFrame = drawFrame(pool, rng.derive("social-cycle:incident-draw"))!;
  const fired = fireFrame(drawnFrame, T, rng);
  const firedFacts = fired.causeProposals.map((proposal) => ledger.append(proposal));
  const causeFact = firedFacts[0]!;
  const worldsSize = consistentWorlds(causeFact, CONTENT_ROSTER, ledger.all(), IMPLIES_V0[causeFact.kind]).size;

  let sample: SocialGroundTruthSample | undefined;
  if (actual) {
    let accusation: { accuserId: string; accused: string } | undefined;
    for (const member of members) {
      const candidates = playerIds.filter((id) => id !== member.actorId);
      const decision = decideSocial(
        { situation: "accusation", candidates, unresolvedDiscrepancies: 1 },
        member.disposition,
        noLedgerView(),
        rng.derive(`npc:${member.actorId}:accusation`),
      ) as Extract<SocialAction, { kind: "accuse" | "decline-accusation" }>;
      if (decision.kind === "accuse" && !accusation) accusation = { accuserId: member.actorId, accused: decision.actorId };
    }

    if (accusation) {
      const others = playerIds.filter((id) => id !== accusation!.accused);
      const posterior = 1 / Math.max(1, others.length);
      const captain = members.find((member) => member.actorId.includes("captain")) ?? members[0]!;
      const captainVote = captain.actorId === accusation.accused ? "innocent" : "guilty";
      const ballots: Record<string, boolean> = {};
      for (const member of members) {
        const vote = decideSocial(
          { situation: "vote", captainVote, posterior },
          member.disposition,
          noLedgerView(),
          rng.derive(`npc:${member.actorId}:vote`),
        ) as Extract<SocialAction, { kind: "vote" }>;
        ballots[member.actorId] = vote.value === "guilty";
      }
      const objectiveFactId = ledger.all().find((fact) => fact.kind === "objective.assigned" && fact.payload.playerId === accusation!.accused)!.id;
      const confrontation = interpreter.resolveConfrontation({
        t: T, declarer: accusation.accuserId,
        target: { kind: "pc", id: accusation.accused },
        eligiblePlayerIds: playerIds, ballots, objectiveFactId, contents: "SIM-CONTENTS",
      });
      const burned = confrontation.committed.some((fact) => fact.kind === "envelope.opened");
      const hadAgenda = objectiveByPlayer.get(accusation.accused) !== deck.routineObjective.id;
      sample = {
        accused: accusation.accused,
        actual,
        accusation: true,
        twin: accusation.accused !== actual,
        burned,
        loyal: accusation.accused !== actual,
        agendaDetected: burned && accusation.accused === actual,
        hadAgenda,
        shipSurvived: true,
      };
    }
  }

  const artifact = await assembleBlackBoxArtifact({ facts: ledger.all(), seedPreimage: deal.commitmentPreimages.seed!, drawPreimages });
  const verification = await verifyBlackBoxArtifact(artifact);
  return { sample, worldsSize, verification };
}
