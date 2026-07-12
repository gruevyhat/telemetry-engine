import { useState } from "react";
import {
  clocksProjection,
  createKindRegistry,
  createLedger,
  createPhaseInterpreter,
  derive,
  fundsProjection,
  KINDS_V0,
  loadPhaseScript,
  type BeatSlot,
  type GameTime,
  type PhaseScript,
  type PhaseStep,
} from "@telemetry/engine";
import demoTemplatesJson from "../../../content/frames/demo/announce-templates.json";
import demoTurnJson from "../../../content/frames/demo/turn.json";
import { Interstitial, SharedScreen } from "./shared-screen/index.js";

const REFEREE = { kind: "referee", id: "referee" } as const;
const demoTemplates = demoTemplatesJson as Readonly<Record<string, string>>;

function gameTimeFor(step: PhaseStep): GameTime {
  const slot = step.slot ?? "DOCKSIDE";
  return { day: slot === "ARRIVAL" ? 14 : 7, slot };
}

function createDemoSession() {
  const ledger = createLedger(createKindRegistry(KINDS_V0));
  const script = loadPhaseScript(demoTurnJson as unknown as PhaseScript);
  const interpreter = createPhaseInterpreter(ledger, script);

  // Content may declare a literal setup prelude. Advancing it through the interpreter keeps
  // even canned fixture facts inside INV-6's single ledger-write path.
  for (let guard = 0; guard < script.stepsById.size; guard += 1) {
    const step = script.stepsById.get(interpreter.currentStep());
    if (!step?.automatic) break;
    interpreter.advance(gameTimeFor(step), REFEREE);
  }

  return { ledger, script, interpreter };
}

export function App() {
  const [session] = useState(createDemoSession);
  const [, renderRevision] = useState(0);
  const [advanceCount, setAdvanceCount] = useState(0);
  const { ledger, script, interpreter } = session;
  const facts = ledger.all();
  const clocks = derive(facts, clocksProjection);
  const currentStep = script.stepsById.get(interpreter.currentStep());
  const currentSlot: BeatSlot = currentStep?.slot ?? "DOCKSIDE";
  const announcement = currentStep?.render ? demoTemplates[currentStep.render] : undefined;
  const status = {
    funds: derive(facts, fundsProjection),
    obligationDays: clocks.obligation ?? 0,
    hex: currentSlot === "ARRIVAL" ? "Vantage" : "Regina",
    fuelTons: 12,
    holdState: "18/20t",
  };

  // The demo script is a closed cycle (ARRIVAL -> DOCKSIDE), so nothing about the interpreter
  // itself ever "finishes." The demo's walkthrough is exactly one lap through its non-automatic
  // steps, so the button disables there rather than silently re-committing a second lap's facts.
  const lapLength = [...script.stepsById.values()].filter((step) => !step.automatic).length;
  const lapComplete = advanceCount >= lapLength;

  function advanceDemoTurn(): void {
    if (!currentStep || lapComplete) return;
    interpreter.advance(gameTimeFor(currentStep), REFEREE);
    setAdvanceCount((count) => count + 1);
    renderRevision((revision) => revision + 1);
  }

  return (
    <>
      <SharedScreen status={status} currentSlot={currentSlot} facts={facts}>
        <p style={{ margin: 0 }}>{announcement}</p>
      </SharedScreen>
      <button type="button" onClick={advanceDemoTurn} disabled={lapComplete}>
        Advance demo turn
      </button>
      <Interstitial
        playerName="Zhan"
        visibleFacts={ledger.visibleTo({ scope: "private", playerId: "pc:zhan" })}
      />
    </>
  );
}
