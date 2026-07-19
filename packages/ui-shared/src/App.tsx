import { useState } from "react";
import {
  assembleInterrogationAnswer,
  clocksProjection,
  commitEvidenceReveal,
  commitInterrogationAnswer,
  createKindRegistry,
  createLedger,
  createPhaseInterpreter,
  createRng,
  derive,
  evaluateAccess,
  factsOwnedBy,
  fundsProjection,
  rankAndPlanReveal,
  renderFeed,
  KINDS_V0,
  loadPhaseScript,
  type AccessContext,
  type AccessResult,
  type ActorRef,
  type BeatSlot,
  type EvidencePlan,
  type EvidenceQuery,
  type Fact,
  type GameTime,
  type GoodDef,
  type IncidentFrame,
  type InterrogationAnswer,
  type Ledger,
  type NpcDef,
  type PhaseInterpreter,
  type PhaseScript,
  type PhaseStep,
} from "@telemetry/engine";
import tradeTemplatesJson from "../../../content/frames/trade-campaign/announce-templates.json";
import tradeTurnJson from "../../../content/frames/trade-campaign/turn.json";
import tradeDeckJson from "../../../content/decks/trade/frames.json";
import genericDeckJson from "../../../content/decks/generic/frames.json";
import { Interstitial, MarketFeed, SharedScreen } from "./shared-screen/index.js";

const REFEREE = { kind: "referee", id: "referee" } as const;
const tradeTemplates = tradeTemplatesJson as Readonly<Record<string, string>>;
const TRADE_DECK = tradeDeckJson as unknown as readonly IncidentFrame[];
const GENERIC_DECK = genericDeckJson as unknown as readonly IncidentFrame[];

/** [M1-13] Local, minimal goods list -- ui-shared has no plugin dependency (build:stub is
 * plugin-stub's job, not the browser UI's); base prices only feed feedLine's display, the
 * campaign script's own literal market.tick facts are what actually drives marketAt. */
const GOODS: readonly GoodDef[] = [
  { id: "machine-parts", basePrice: 410 },
  { id: "refined-ore", basePrice: 188 },
];

/** [M1-13] The trade-campaign script's step ids are "t<turn>-<beat>" (e.g. "t2-arrival"); day
 * advances one week (7 days) per turn so marketAt/renderFeed read the turn's own market.tick
 * facts rather than a stale week. */
function gameTimeFor(step: PhaseStep): GameTime {
  const slot = step.slot ?? "DOCKSIDE";
  const turn = Number(step.id.match(/^t(\d+)-/)?.[1] ?? "1");
  return { day: turn * 7, slot };
}

/** Content may declare literal-fact automatic steps (e.g. this script's per-turn market seed).
 * Skipping through them keeps every posted fact inside INV-6's single ledger-write path while
 * never asking the player to click through a step with nothing for them to decide. */
function skipAutomaticSteps(
  script: ReturnType<typeof loadPhaseScript>,
  interpreter: ReturnType<typeof createPhaseInterpreter>,
): void {
  for (let guard = 0; guard < script.stepsById.size; guard += 1) {
    const step = script.stepsById.get(interpreter.currentStep());
    if (!step?.automatic) break;
    interpreter.advance(gameTimeFor(step), REFEREE);
  }
}

/** [M1-15] The trade-campaign's four generate steps each name a real trade-deck NPC as the
 * incident's actor (per content/decks/trade/frames.json's surfaceTables); these are the only
 * three this session's script can ever fire, so a static def per known id is enough for M1 --
 * a full NPC content pipeline is out of scope here. INTERROGATION_DIFFICULTY (6) is this card's
 * own extrapolation, same status as the TRANSIT check's difficulty (M1-14): the Spec gives no
 * number for either. */
const INTERROGATION_DIFFICULTY = 6;
const NPC_DEFS: Readonly<Record<string, NpcDef>> = {
  "npc:kessler": { id: "npc:kessler", disposition: "naive", tells: ["Kessler brought up the log entry before you asked about it."] },
  "npc:reyes": { id: "npc:reyes", disposition: "diligent", tells: ["Reyes recounted the count twice, unprompted, the same way both times."] },
  "npc:okonkwo": { id: "npc:okonkwo", disposition: "selfish", tells: ["Okonkwo used the word approved. Nobody had used that word yet."] },
};

function firstNpcActor(committed: readonly Fact[]): string | undefined {
  return committed.find((fact) => fact.actor.kind === "npc")?.actor.id;
}

/** [M1-15, Spec §12, fact-kinds-v0.md §3] The full interrogation-answer commit: logs the roll
 * (check.reported, via the interpreter's reportCheck), then commits the split-visibility fact
 * pair fact-kinds-v0.md §3 defines for an interrogation answer (npc.statement at table
 * visibility, npc.truthTierAssigned at referee visibility, linked by `causes`) via
 * commitInterrogationAnswer. Exported standalone (not inlined in the component) so it's testable
 * against a real ledger without exposing App's internal session state. */
export function runInterrogation(
  ledger: Ledger,
  interpreter: PhaseInterpreter,
  npc: NpcDef,
  approach: "persuade" | "intimidate",
  checkTotal: number,
  t: GameTime,
  actor: ActorRef,
): InterrogationAnswer {
  interpreter.reportCheck(t, actor, { skill: approach, dm: 0, total: checkTotal, difficulty: INTERROGATION_DIFFICULTY });
  const effect = checkTotal - INTERROGATION_DIFFICULTY;
  const answer = assembleInterrogationAnswer(npc, "the incident", factsOwnedBy(ledger.all(), npc.id), effect);
  commitInterrogationAnswer(ledger, answer, t);
  return answer;
}

/** [M1-16, Spec §10.1] One query for M1: the aft-bay lock-cycle log (the same lock.cycled cause
 * fact turn 1's incident commits). EVIDENCE_DIFFICULTY (6) is this card's own extrapolation, same
 * status as M1-14's/M1-15's difficulty numbers -- the Spec gives none. "actor" is the fact-kinds
 * catalog's synthetic identity field name (fact-kinds-v0.md §3), not a real payload key. */
const EVIDENCE_DIFFICULTY = 6;
export const EVIDENCE_QUERY: EvidenceQuery = {
  target: { kinds: ["lock.cycled"] },
  access: { kind: "aboard" },
  probativeWeights: { "lock.cycled": 2 },
  identityFields: new Set(["actor"]),
};
const DEFAULT_ACCESS_CONTEXT: AccessContext = {
  presence: { declarations: {} },
  actorId: "pc:zhan",
  day: 0,
  slot: "DOCKSIDE",
  heldGear: new Set(),
  codeHolders: new Set(),
  holdsPrisoner: false,
};

/** [M1-16, Spec §10.1, INV-6, INV-11] evaluateAccess -> rankAndPlanReveal -> commitEvidenceReveal,
 * all three pre-existing and untested by this card -- only wired together here. Access failure
 * costs nothing (rankAndPlanReveal returns before spending the day); commitEvidenceReveal's own
 * ledger.appendAll call is what keeps the reveal fact(s) and the day-cost clock.tick atomic.
 * Exported standalone, like runInterrogation, so it's testable against a real ledger. */
export function runEvidenceInvestigation(
  ledger: Ledger,
  query: EvidenceQuery,
  candidateFacts: readonly Fact[],
  checkTotal: number,
  difficulty: number,
  t: GameTime,
  context: AccessContext = DEFAULT_ACCESS_CONTEXT,
): EvidencePlan {
  const effect = checkTotal - difficulty;
  const plan = rankAndPlanReveal(query, candidateFacts, effect, t, context);
  if (plan.ok) {
    commitEvidenceReveal(ledger, plan);
  }
  return plan;
}

/** maggie-voice-linter note: the joined field list is raw payload key names (e.g. "codeClass"),
 * not display copy -- a real renderer would map each field to a spoken phrase. Same class of
 * simplification as NPC_DEFS' raw "npc:kessler" ids in answerText(); flagged, not fixed, to avoid
 * scope-creeping this card into building a field-name-to-phrase table. */
function revealText(plan: Extract<EvidencePlan, { ok: true }>): string {
  const fields = plan.revealProposals.filter((p) => p.kind === "reveal").flatMap((p) => p.payload.fields as string[]);
  return fields.length > 0 ? `Revealed: ${fields.join(", ")}.` : "Nothing matched. The day is still spent.";
}

function answerText(npcId: string, answer: InterrogationAnswer): string {
  switch (answer.tier) {
    case "evasion":
      return `${npcId} offers you nothing.`;
    case "partial":
      return `${npcId} answers incompletely. Logged.`;
    case "trueWithTell":
      return `${npcId} answers straight. ${answer.tell}`;
    case "true":
      return `${npcId} answers straight. Nothing held back, no tell.`;
  }
}

/** [M1-14] One playthrough of trade-campaign/turn.json advances 5 steps per turn (DOCKSIDE
 * generate, COMMS stub, the TRANSIT check, whichever of its two branches fires, ARRIVAL) x 4
 * turns -- counted directly rather than derived from `script.stepsById.size`, since that would
 * also count the branch never taken on a given run. */
const ADVANCES_PER_TURN = 5;
const TRADE_CAMPAIGN_TURNS = 4;

function createTradeSession() {
  const ledger = createLedger(createKindRegistry(KINDS_V0));
  const script = loadPhaseScript(tradeTurnJson as unknown as PhaseScript);
  const campaignSeed = "m1-13-by-hand-demo";
  const rng = createRng(campaignSeed);
  const interpreter = createPhaseInterpreter(ledger, script, {
    rng,
    deck: TRADE_DECK.concat(GENERIC_DECK),
    commitReveal: { campaignSeed, campaignSalt: "m2-browser-demo" },
  });

  skipAutomaticSteps(script, interpreter);

  return { ledger, script, interpreter };
}

export function App() {
  const [session] = useState(createTradeSession);
  const [, renderRevision] = useState(0);
  const [advanceCount, setAdvanceCount] = useState(0);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [lastRendered, setLastRendered] = useState<string | undefined>(undefined);
  const [lastIncidentNpcId, setLastIncidentNpcId] = useState<string | undefined>(undefined);
  const [lastIncidentFacts, setLastIncidentFacts] = useState<readonly Fact[]>([]);
  const [interrogationApproach, setInterrogationApproach] = useState<"persuade" | "intimidate" | undefined>(undefined);
  const [interrogationAnswer, setInterrogationAnswer] = useState<string | undefined>(undefined);
  const [evidenceStarted, setEvidenceStarted] = useState(false);
  const [evidenceResult, setEvidenceResult] = useState<string | undefined>(undefined);
  const { ledger, script, interpreter } = session;
  const facts = ledger.all();
  const clocks = derive(facts, clocksProjection);
  const currentStep = script.stepsById.get(interpreter.currentStep());
  const currentSlot: BeatSlot = currentStep?.slot ?? "DOCKSIDE";
  const currentTime = currentStep ? gameTimeFor(currentStep) : { day: 7, slot: "DOCKSIDE" as const };
  const hex = "Regina";
  const marketLines = renderFeed(facts, hex, currentTime.day, 0, GOODS);
  const announcement = currentStep?.render ? tradeTemplates[currentStep.render] : lastRendered;
  const status = {
    funds: derive(facts, fundsProjection),
    obligationDays: clocks.obligation ?? 0,
    hex,
    fuelTons: 12,
    holdState: "18/20t",
  };

  // The script loops back to t1-seed afterward (INV-2/3: no interpreter state beyond the
  // ledger), so the control disables at the end of one full run rather than silently starting a
  // second, unrequested lap.
  const campaignLength = ADVANCES_PER_TURN * TRADE_CAMPAIGN_TURNS;
  const campaignComplete = advanceCount >= campaignLength;
  const isCheckStep = currentStep?.kind === "check";

  async function advanceTurn(input?: { checkTotal: number }): Promise<void> {
    if (!currentStep || campaignComplete || isAdvancing) return;
    setIsAdvancing(true);
    try {
      const result =
        currentStep.kind === "generate" || currentStep.kind === "commsWindow"
          ? await interpreter.advanceCommitted(gameTimeFor(currentStep), REFEREE, input)
          : interpreter.advance(gameTimeFor(currentStep), REFEREE, input);
      const newCount = advanceCount + 1;
      // Only skip forward through automatic steps while more of the campaign remains -- at the end
      // the script's own "next" wraps back to t1-seed, and re-running that seed here would silently
      // re-commit turn 1's market/purchase facts a second time.
      if (newCount < campaignLength) {
        skipAutomaticSteps(script, interpreter);
      }
      const npcId = firstNpcActor(result.committed);
      if (npcId) {
        setLastIncidentNpcId(npcId);
      }
      setLastIncidentFacts(result.committed.filter((fact) => fact.kind !== "phase.transition" && fact.kind !== "secretRoll.committed"));
      setInterrogationApproach(undefined);
      setInterrogationAnswer(undefined);
      setEvidenceStarted(false);
      setEvidenceResult(undefined);
      setLastRendered(result.rendered);
      setAdvanceCount(newCount);
      renderRevision((revision) => revision + 1);
    } finally {
      setIsAdvancing(false);
    }
  }

  function submitInterrogation(checkTotal: number): void {
    if (!interrogationApproach || !lastIncidentNpcId) return;
    const npc = NPC_DEFS[lastIncidentNpcId];
    if (!npc) return;
    const answer = runInterrogation(ledger, interpreter, npc, interrogationApproach, checkTotal, currentTime, { kind: "pc", id: "pc:zhan" });
    setInterrogationAnswer(answerText(npc.id, answer));
    renderRevision((revision) => revision + 1);
  }

  function submitEvidence(checkTotal: number): void {
    const plan = runEvidenceInvestigation(ledger, EVIDENCE_QUERY, lastIncidentFacts, checkTotal, EVIDENCE_DIFFICULTY, currentTime);
    setEvidenceResult(plan.ok ? revealText(plan) : plan.message);
    renderRevision((revision) => revision + 1);
  }

  const interrogatableNpc = currentSlot === "COMMS" && lastIncidentNpcId ? NPC_DEFS[lastIncidentNpcId] : undefined;
  const evidenceAvailable = currentSlot === "COMMS" && lastIncidentFacts.length > 0;
  const evidenceAccess = evidenceAvailable ? evaluateAccess(EVIDENCE_QUERY.access, DEFAULT_ACCESS_CONTEXT) : undefined;

  return (
    <>
      <SharedScreen status={status} currentSlot={currentSlot} facts={facts}>
        {currentSlot === "DOCKSIDE" ? (
          <MarketFeed lines={marketLines} />
        ) : (
          <p style={{ margin: 0 }}>{announcement}</p>
        )}
        {interrogatableNpc && (
          <InterrogationControl
            npc={interrogatableNpc}
            approach={interrogationApproach}
            answer={interrogationAnswer}
            onChooseApproach={setInterrogationApproach}
            onSubmit={submitInterrogation}
          />
        )}
        {evidenceAvailable && evidenceAccess && (
          <EvidenceControl
            access={evidenceAccess}
            started={evidenceStarted}
            result={evidenceResult}
            onStart={() => setEvidenceStarted(true)}
            onSubmit={submitEvidence}
          />
        )}
      </SharedScreen>
      {isCheckStep ? (
        <CheckControl onSubmit={(checkTotal) => advanceTurn({ checkTotal })} />
      ) : (
        <button type="button" onClick={() => void advanceTurn()} disabled={campaignComplete || isAdvancing}>
          {isAdvancing ? "Working" : "Advance turn"}
        </button>
      )}
      <Interstitial
        playerName="Zhan"
        visibleFacts={ledger.visibleTo({ scope: "private", playerId: "pc:zhan" })}
      />
    </>
  );
}

/** [M1-14, Spec §6] "The engine never rolls for a PC" -- a plain number entry for the player's
 * own roll total, not a simulated die. */
function CheckControl({ onSubmit }: { onSubmit: (checkTotal: number) => void }) {
  const [value, setValue] = useState("");

  return (
    <div>
      <label>
        Roll total
        <input
          type="number"
          aria-label="roll total"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button type="button" onClick={() => onSubmit(Number(value))} disabled={value === ""}>
        Submit roll
      </button>
    </div>
  );
}

/** [M1-15, Spec §12] Persuade/Intimidate only -- no free-text question entry. The exchange itself
 * (this component's rendered text) is presentation only (INV-12): submitting posts one
 * check.reported fact via reportCheck; the answer text is never written back as a fact. */
function InterrogationControl({
  npc,
  approach,
  answer,
  onChooseApproach,
  onSubmit,
}: {
  npc: NpcDef;
  approach: "persuade" | "intimidate" | undefined;
  answer: string | undefined;
  onChooseApproach: (approach: "persuade" | "intimidate") => void;
  onSubmit: (checkTotal: number) => void;
}) {
  const [value, setValue] = useState("");

  if (answer) {
    return <p data-testid="interrogation-answer">{answer}</p>;
  }

  if (!approach) {
    return (
      <div>
        <button type="button" onClick={() => onChooseApproach("persuade")}>
          Persuade {npc.id}
        </button>
        <button type="button" onClick={() => onChooseApproach("intimidate")}>
          Intimidate {npc.id}
        </button>
      </div>
    );
  }

  return (
    <div>
      <label>
        Interrogation roll total
        <input
          type="number"
          aria-label="interrogation roll total"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button type="button" onClick={() => onSubmit(Number(value))} disabled={value === ""}>
        Submit interrogation roll
      </button>
    </div>
  );
}

/** [M1-16, Spec §10.1] "Access failure narrates and stops -- no roll, no day cost." Access is
 * evaluated (evaluateAccess, pure/read-only) before this ever offers a roll control, and a denied
 * access never shows one at all -- there is no path from a failed access check to a submitted
 * roll in this component. */
function EvidenceControl({
  access,
  started,
  result,
  onStart,
  onSubmit,
}: {
  access: AccessResult;
  started: boolean;
  result: string | undefined;
  onStart: () => void;
  onSubmit: (checkTotal: number) => void;
}) {
  const [value, setValue] = useState("");

  if (result) {
    return <p data-testid="evidence-reveal">{result}</p>;
  }

  if (!access.ok) {
    // access.reason is an engine-internal diagnostic string (evaluateAccess's own wording, e.g.
    // `actor "pc:zhan" is declared off-ship at "Vantage"`), not authored player-voice copy -- a
    // real renderer would translate it. Prefixed rather than sentence-joined so it reads as a
    // system note, not a MAGGIE sentence with a raw internal string spliced into it.
    return (
      <p data-testid="evidence-access-denied">
        Access denied. Reason on file: {access.reason}
      </p>
    );
  }

  if (!started) {
    return (
      <button type="button" onClick={onStart}>
        Investigate
      </button>
    );
  }

  return (
    <div>
      <label>
        Evidence roll total
        <input
          type="number"
          aria-label="evidence roll total"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      <button type="button" onClick={() => onSubmit(Number(value))} disabled={value === ""}>
        Submit evidence roll
      </button>
    </div>
  );
}
