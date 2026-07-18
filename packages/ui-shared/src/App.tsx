import { useState } from "react";
import {
  assembleInterrogationAnswer,
  clocksProjection,
  commitInterrogationAnswer,
  createKindRegistry,
  createLedger,
  createPhaseInterpreter,
  createRng,
  derive,
  factsOwnedBy,
  fundsProjection,
  renderFeed,
  KINDS_V0,
  loadPhaseScript,
  type ActorRef,
  type BeatSlot,
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
  const rng = createRng("m1-13-by-hand-demo");
  const interpreter = createPhaseInterpreter(ledger, script, { rng, deck: TRADE_DECK.concat(GENERIC_DECK) });

  skipAutomaticSteps(script, interpreter);

  return { ledger, script, interpreter };
}

export function App() {
  const [session] = useState(createTradeSession);
  const [, renderRevision] = useState(0);
  const [advanceCount, setAdvanceCount] = useState(0);
  const [lastRendered, setLastRendered] = useState<string | undefined>(undefined);
  const [lastIncidentNpcId, setLastIncidentNpcId] = useState<string | undefined>(undefined);
  const [interrogationApproach, setInterrogationApproach] = useState<"persuade" | "intimidate" | undefined>(undefined);
  const [interrogationAnswer, setInterrogationAnswer] = useState<string | undefined>(undefined);
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

  function advanceTurn(input?: { checkTotal: number }): void {
    if (!currentStep || campaignComplete) return;
    const result = interpreter.advance(gameTimeFor(currentStep), REFEREE, input);
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
    setInterrogationApproach(undefined);
    setInterrogationAnswer(undefined);
    setLastRendered(result.rendered);
    setAdvanceCount(newCount);
    renderRevision((revision) => revision + 1);
  }

  function submitInterrogation(checkTotal: number): void {
    if (!interrogationApproach || !lastIncidentNpcId) return;
    const npc = NPC_DEFS[lastIncidentNpcId];
    if (!npc) return;
    const answer = runInterrogation(ledger, interpreter, npc, interrogationApproach, checkTotal, currentTime, { kind: "pc", id: "pc:zhan" });
    setInterrogationAnswer(answerText(npc.id, answer));
    renderRevision((revision) => revision + 1);
  }

  const interrogatableNpc = currentSlot === "COMMS" && lastIncidentNpcId ? NPC_DEFS[lastIncidentNpcId] : undefined;

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
      </SharedScreen>
      {isCheckStep ? (
        <CheckControl onSubmit={(checkTotal) => advanceTurn({ checkTotal })} />
      ) : (
        <button type="button" onClick={() => advanceTurn()} disabled={campaignComplete}>
          Advance turn
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
