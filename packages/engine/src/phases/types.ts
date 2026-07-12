import type { ActorRef, FactID, Visibility } from "../ledger/types.js";
import type { BeatSlot } from "../time/index.js";

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

/** A literal content proposal. The interpreter supplies game time and remains the only writer. */
export interface PhaseFactProposal {
  kind: string;
  actor: ActorRef;
  payload: Record<string, unknown>;
  visibility?: Visibility;
  causes?: FactID[];
  frame?: string;
}

export interface PhaseStep {
  id: StepRef;
  kind: PhaseStepKind;
  render?: string; // content template key; interpolation/rendering lands in M1-09
  /** [M1-05] GeneratorRef: which incident frame a "generate" step fires, looked up by id from
   * the deck passed to createPhaseInterpreter's deps. */
  gen?: { frameId: string };
  check?: CheckSpec;
  tick?: TickSpec;
  timer?: number;
  visibility?: Visibility;
  slot?: BeatSlot;
  automatic?: boolean;
  facts?: readonly PhaseFactProposal[];
  next: StepRef | BranchTable;
}

/** A frame's turn script (content, not engine — Spec §4 Do-not: no beat sequence in engine code). */
export interface PhaseScript {
  frame: string;
  start: StepRef;
  steps: readonly PhaseStep[];
}
