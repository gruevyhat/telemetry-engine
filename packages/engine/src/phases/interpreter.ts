import { derive, type Projection } from "../ledger/derive.js";
import type { AppendInput, Ledger } from "../ledger/ledger.js";
import type { ActorRef, Fact } from "../ledger/types.js";
import type { GameTime } from "../time/index.js";
import type { LoadedPhaseScript } from "./load.js";
import type { PhaseStep, StepRef } from "./types.js";

export interface StepInput {
  checkTotal?: number;
  branchKey?: string;
}

export interface AdvanceResult {
  fromStep: StepRef;
  toStep: StepRef;
  committed: readonly Fact[];
}

/** Where a script currently is: the toStep of its most recent phase.transition, else its start. */
export function currentStepProjection(script: LoadedPhaseScript): Projection<StepRef> {
  return {
    initial: script.start,
    apply(state, fact) {
      if (fact.kind !== "phase.transition" || fact.payload.frame !== script.frame) {
        return state;
      }
      return typeof fact.payload.toStep === "string" ? fact.payload.toStep : state;
    },
  };
}

export function currentStepOf(facts: readonly Fact[], script: LoadedPhaseScript): StepRef {
  return derive(facts, currentStepProjection(script));
}

interface ResolvedStep {
  nextStepId: StepRef;
  proposals: AppendInput[];
}

function requirePlainNext(step: PhaseStep): StepRef {
  if (typeof step.next !== "string") {
    throw new Error(`step "${step.id}" (${step.kind}) must have a plain next step, not a branch table`);
  }
  return step.next;
}

/** Per-kind resolution. generate/vote/confrontation UI+generation are out of scope (M1-03+/M0-07/M2) — steps just transition. */
function resolveStep(step: PhaseStep, t: GameTime, actor: ActorRef, input: StepInput | undefined): ResolvedStep {
  switch (step.kind) {
    case "check": {
      const checkSpec = step.check;
      if (!checkSpec) {
        throw new Error(`step "${step.id}": missing check (should have been rejected at load)`);
      }
      if (input?.checkTotal === undefined) {
        throw new Error(`step "${step.id}": check requires input.checkTotal (Spec §6: the engine never rolls for a PC)`);
      }
      const nextStepId = input.checkTotal >= checkSpec.difficulty ? checkSpec.onSuccess : checkSpec.onFail;
      return { nextStepId, proposals: [] };
    }
    case "branch": {
      if (typeof step.next === "string") {
        throw new Error(`step "${step.id}": branch step must have a branch table for next`);
      }
      const branchKey = input?.branchKey;
      if (!branchKey || !(branchKey in step.next)) {
        throw new Error(`step "${step.id}": branch requires a valid input.branchKey`);
      }
      return { nextStepId: step.next[branchKey]!, proposals: [] };
    }
    case "tickClock": {
      const tick = step.tick;
      if (!tick) {
        throw new Error(`step "${step.id}": missing tick (should have been rejected at load)`);
      }
      return {
        nextStepId: requirePlainNext(step),
        proposals: [{ t, kind: "clock.tick", actor, payload: { clockId: tick.clockId, delta: tick.delta } }],
      };
    }
    case "commsWindow":
      // batch-resolution stub — M2 fills it in (Spec §3.3's shuffled sequential resolution).
      return { nextStepId: requirePlainNext(step), proposals: [] };
    case "announce":
    case "generate":
    case "vote":
      return { nextStepId: requirePlainNext(step), proposals: [] };
    case "confrontation":
      throw new Error(`step "${step.id}": confrontation sub-script is not implemented until M2`);
  }
}

export interface PhaseInterpreter {
  currentStep(): StepRef;
  advance(t: GameTime, actor: ActorRef, input?: StepInput): AdvanceResult;
  queueCommsAction(action: Readonly<Record<string, unknown>>): void;
}

/**
 * [Spec §3.2, INV-6] The only ledger.append call site in the codebase. Holds no state of its
 * own beyond an in-memory, non-durable comms-action queue (Spec §3.3's real queue/shuffle is
 * M2) — currentStep() is always derived fresh from the ledger, so killing and recreating this
 * interpreter mid-script and calling advance() again produces the same facts as an
 * uninterrupted run: nothing survives a restart except what's already committed.
 */
export function createPhaseInterpreter(ledger: Ledger, script: LoadedPhaseScript): PhaseInterpreter {
  let commsQueue: Record<string, unknown>[] = [];

  function currentStep(): StepRef {
    return currentStepOf(ledger.all(), script);
  }

  function advance(t: GameTime, actor: ActorRef, input?: StepInput): AdvanceResult {
    const fromStep = currentStep();
    const step = script.stepsById.get(fromStep);
    if (!step) {
      throw new Error(`phase script "${script.frame}": current step "${fromStep}" not found`);
    }

    const { nextStepId, proposals } = resolveStep(step, t, actor, input);

    const committed: Fact[] = [];
    for (const proposal of proposals) {
      committed.push(ledger.append(proposal));
    }
    committed.push(
      ledger.append({
        t,
        kind: "phase.transition",
        actor,
        payload: { fromStep, toStep: nextStepId, frame: script.frame },
      }),
    );

    if (step.kind === "commsWindow") {
      commsQueue = [];
    }

    return { fromStep, toStep: nextStepId, committed };
  }

  function queueCommsAction(action: Readonly<Record<string, unknown>>): void {
    commsQueue.push(action);
  }

  return { currentStep, advance, queueCommsAction };
}
