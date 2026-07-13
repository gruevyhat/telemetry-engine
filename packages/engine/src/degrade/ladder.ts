import type { AppendInput } from "../ledger/ledger.js";
import type { ActorRef } from "../ledger/types.js";
import type { GameTime } from "../time/index.js";
import type { FiredIncident } from "../generate/frame.js";
import type { OracleAnswer } from "../oracle/oracle.js";

/** [maggie-voice.md §4 "degrade line"] The bible's own canonical rung-3 line -- matches
 * render/renderer.ts's degradeLine template's no-fact branch, since rung 3 and "nothing to
 * report" describe the same moment: MAGGIE has nothing groundable left to say. */
export const CANNED_DEGRADE_LINE = "Nothing to report. Enjoy it; it is rented.";

export type DegradeOutcome =
  | { readonly rung: "1"; readonly incident: FiredIncident }
  | { readonly rung: "2"; readonly oracle: OracleAnswer }
  | { readonly rung: "3"; readonly line: string }
  | { readonly rung: "4"; readonly fault: unknown };

/**
 * [Spec §17] The ladder assumes the normal, curated-deck composer already failed (that handoff
 * is the caller's job, e.g. a future M1-11a/b content-deck selector) -- this starts at rung 1.
 * `attemptCannedLine` defaults to the real canned line; it's only overridable so the "should be
 * unreachable" rung-3 failure path is actually testable, per Spec §17's own framing of rung 3 as
 * "defends against content bugs."
 */
export interface DegradeLadderDeps {
  readonly attemptGeneric: () => FiredIncident;
  readonly attemptOracle: () => OracleAnswer;
  readonly attemptCannedLine?: () => string;
}

/**
 * [INV-14: "from any reachable state, the engine produces a next playable step"] Never throws:
 * an outer safety net catches any fault from any rung -- including rung 3's own trivial action,
 * which Spec §17 calls "should be unreachable" but is still defended, not assumed -- and reports
 * it as rung 4 rather than propagating. This is the whole point of the ladder: there is no input
 * that makes it crash instead of returning a described outcome.
 */
export function runDegradeLadder(deps: DegradeLadderDeps): DegradeOutcome {
  try {
    try {
      return { rung: "1", incident: deps.attemptGeneric() };
    } catch {
      // Curated generic-family pool also exhausted -- escalate to rung 2.
    }
    try {
      return { rung: "2", oracle: deps.attemptOracle() };
    } catch {
      // Oracle unusable -- escalate to rung 3.
    }
    const line = (deps.attemptCannedLine ?? (() => CANNED_DEGRADE_LINE))();
    return { rung: "3", line };
  } catch (fault) {
    return { rung: "4", fault };
  }
}

function contextFor(outcome: DegradeOutcome): string {
  switch (outcome.rung) {
    case "1":
      return `generic family incident "${outcome.incident.frameId}" fired`;
    case "2":
      return `oracle-only beat: ${outcome.oracle.question}`;
    case "3":
      return "canned line (oracle unusable)";
    case "4":
      return `engine fault: ${outcome.fault instanceof Error ? outcome.fault.message : String(outcome.fault)}`;
  }
}

/** [fact-kinds-v0.md, Spec §17: "Every degradation logs at referee scope"] One proposal per
 * ladder outcome, whichever rung it resolved at. */
export function degradeReportedProposal(t: GameTime, actor: ActorRef, outcome: DegradeOutcome): AppendInput {
  return { t, kind: "degrade.reported", actor, payload: { rung: outcome.rung, context: contextFor(outcome) } };
}
