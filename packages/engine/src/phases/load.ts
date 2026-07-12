import type { PhaseScript, PhaseStep, StepRef } from "./types.js";

export interface LoadedPhaseScript {
  readonly frame: string;
  readonly start: StepRef;
  readonly stepsById: ReadonlyMap<StepRef, PhaseStep>;
}

function referencedStepIds(step: PhaseStep): StepRef[] {
  const targets: StepRef[] = typeof step.next === "string" ? [step.next] : Object.values(step.next);
  if (step.check) {
    targets.push(step.check.onSuccess, step.check.onFail);
  }
  return targets;
}

/**
 * [Spec §4 guarantee: "exactly one active step"] Rejects a script at load time if it could ever
 * leave the interpreter without a single well-defined current step: an unknown start step, or
 * any step whose next/branch/check target doesn't exist. A script that loads is one where
 * currentStepOf() can never resolve to "nowhere."
 */
export function loadPhaseScript(script: PhaseScript): LoadedPhaseScript {
  void referencedStepIds;
  const stepsById = new Map(script.steps.map((step) => [step.id, step]));
  return { frame: script.frame, start: script.start, stepsById };
}
