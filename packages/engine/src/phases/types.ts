import type { Visibility } from "../ledger/types.js";

export type StepRef = string;

/** A branch step's next-step lookup, keyed by whatever branch key the step resolves to. */
export type BranchTable = Readonly<Record<string, StepRef>>;

export type PhaseStepKind = "announce" | "generate" | "check" | "vote" | "commsWindow" | "confrontation" | "branch" | "tickClock";

export interface CheckSpec {
  skillSlot: string;
  /**
   * [extrapolation] Spec §4's PhaseStep interface references a DifficultyRef type that isn't
   * defined anywhere yet (no task has introduced it). Treated as a plain target number to beat
   * for M0-06; a later task can widen this to a real formula/skill-scaled type without changing
   * this field's name.
   */
  difficulty: number;
  onFail: StepRef;
  onSuccess: StepRef;
}

/**
 * [extrapolation] Spec §4 doesn't show a tickClock-specific payload field on PhaseStep (its
 * shown interface is evidently abridged — check has one, tickClock needs one too). A tickClock
 * step has to know which clock and by how much; modeled as this optional field, used only when
 * kind === 'tickClock'.
 */
export interface TickSpec {
  clockId: string;
  delta: number;
}

export interface PhaseStep {
  id: StepRef;
  kind: PhaseStepKind;
  render?: unknown; // RenderRef — undefined until M1-09
  gen?: unknown; // GeneratorRef — undefined until M1-03
  check?: CheckSpec;
  tick?: TickSpec;
  timer?: number;
  visibility?: Visibility;
  next: StepRef | BranchTable;
}

/** A frame's turn script (content, not engine — Spec §4 Do-not: no beat sequence in engine code). */
export interface PhaseScript {
  frame: string;
  start: StepRef;
  steps: readonly PhaseStep[];
}
