import { useState } from "react";
import {
  clocksProjection,
  createKindRegistry,
  createLedger,
  createPhaseInterpreter,
  createRng,
  derive,
  fundsProjection,
  renderFeed,
  KINDS_V0,
  loadPhaseScript,
  type BeatSlot,
  type GameTime,
  type GoodDef,
  type IncidentFrame,
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

  // Four turns x four beats each (DOCKSIDE -> COMMS -> TRANSIT -> ARRIVAL); the script loops back
  // to t1-dockside afterward (INV-2/3: no interpreter state beyond the ledger), so the button
  // disables at 16 advances rather than silently starting a second, unrequested lap.
  const campaignLength = [...script.stepsById.values()].filter((step) => !step.automatic).length;
  const campaignComplete = advanceCount >= campaignLength;

  function advanceTurn(): void {
    if (!currentStep || campaignComplete) return;
    const result = interpreter.advance(gameTimeFor(currentStep), REFEREE);
    const newCount = advanceCount + 1;
    // Only skip forward through automatic steps while more of the campaign remains -- at 16 the
    // script's own "next" wraps back to t1-seed, and re-running that seed here would silently
    // re-commit turn 1's market/purchase facts a second time.
    if (newCount < campaignLength) {
      skipAutomaticSteps(script, interpreter);
    }
    setLastRendered(result.rendered);
    setAdvanceCount(newCount);
    renderRevision((revision) => revision + 1);
  }

  return (
    <>
      <SharedScreen status={status} currentSlot={currentSlot} facts={facts}>
        {currentSlot === "DOCKSIDE" ? (
          <MarketFeed lines={marketLines} />
        ) : (
          <p style={{ margin: 0 }}>{announcement}</p>
        )}
      </SharedScreen>
      <button type="button" onClick={advanceTurn} disabled={campaignComplete}>
        Advance turn
      </button>
      <Interstitial
        playerName="Zhan"
        visibleFacts={ledger.visibleTo({ scope: "private", playerId: "pc:zhan" })}
      />
    </>
  );
}
