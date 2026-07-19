import { describe, expect, it } from "vitest";
import type { FiredIncident } from "../generate/frame.js";
import type { OracleAnswer } from "../oracle/oracle.js";
import { degradeReportedProposal, runDegradeLadder, type DegradeLadderDeps } from "./ladder.js";

const T = { day: 14, slot: "DOCKSIDE" as const };
const REFEREE = { kind: "referee" as const, id: "referee" };

const GENERIC_INCIDENT: FiredIncident = {
  frameId: "generic:shortfall",
  surface: { fields: {} },
  causeProposals: [],
  causeSource: "innocentTwin",
  innocentAlternativeProposals: [],
};
const ORACLE_ANSWER: OracleAnswer = { question: "Does the crew notice?", likelihood: "even", answer: "YES", texture: "plain" };

function deps(overrides: Partial<DegradeLadderDeps> = {}): DegradeLadderDeps {
  return {
    attemptGeneric: () => GENERIC_INCIDENT,
    attemptOracle: () => ORACLE_ANSWER,
    ...overrides,
  };
}

function failing(): never {
  throw new Error("this rung's content pool is exhausted");
}

describe("runDegradeLadder — INV-14: from any reachable state, the engine produces a next playable step [Spec §17]", () => {
  it("rung 1: a generic family incident fires when the (already-failed) normal composer hands off to it", () => {
    const outcome = runDegradeLadder(deps());
    expect(outcome).toEqual({ rung: "1", incident: GENERIC_INCIDENT });
  });

  it("rung 2: an oracle-only beat fires when the generic pool is also exhausted", () => {
    const outcome = runDegradeLadder(deps({ attemptGeneric: failing }));
    expect(outcome).toEqual({ rung: "2", oracle: ORACLE_ANSWER });
  });

  it("rung 3: MAGGIE's canned line fires when the oracle itself is unusable (content bug defense)", () => {
    const outcome = runDegradeLadder(deps({ attemptGeneric: failing, attemptOracle: failing }));
    expect(outcome).toEqual({ rung: "3", line: "Nothing to report. Enjoy it; it is rented." });
  });

  it("rung 4: a genuine engine fault (not a content-pool failure) is caught rather than thrown, never a blank screen or a stack trace", () => {
    const outcome = runDegradeLadder({
      attemptGeneric: failing,
      attemptOracle: () => {
        throw new TypeError("unexpected: not a content-pool failure at all");
      },
      // Simulate a fault in the ladder's own bookkeeping, not a content-attempt failure, by
      // making rung 3's canned line itself explode -- the one case Spec §17 calls "should be
      // unreachable," which is exactly what the outer safety net exists for.
      attemptCannedLine: failing,
    });
    expect(outcome.rung).toBe("4");
    if (outcome.rung !== "4") return;
    expect(outcome.fault).toBeInstanceOf(Error);
  });

  it("never throws, for any combination of failures -- always returns a next playable step", () => {
    for (const attemptGeneric of [deps().attemptGeneric, failing]) {
      for (const attemptOracle of [deps().attemptOracle, failing]) {
        expect(() => runDegradeLadder({ attemptGeneric, attemptOracle })).not.toThrow();
      }
    }
  });
});

describe("degradeReportedProposal — every degradation logs degrade.reported with the correct rung [fact-kinds-v0.md]", () => {
  it("rung 1", () => {
    const proposal = degradeReportedProposal(T, REFEREE, { rung: "1", incident: GENERIC_INCIDENT });
    expect(proposal).toMatchObject({ t: T, kind: "degrade.reported", actor: REFEREE, payload: { rung: "1" } });
    expect(proposal.payload.context).toContain("generic:shortfall");
  });

  it("rung 2", () => {
    const proposal = degradeReportedProposal(T, REFEREE, { rung: "2", oracle: ORACLE_ANSWER });
    expect(proposal.payload).toMatchObject({ rung: "2" });
    expect(proposal.payload.context).toContain(ORACLE_ANSWER.question);
  });

  it("rung 3", () => {
    const proposal = degradeReportedProposal(T, REFEREE, { rung: "3", line: "Nothing to report. Enjoy it; it is rented." });
    expect(proposal.payload).toMatchObject({ rung: "3" });
  });

  it("rung 4", () => {
    const proposal = degradeReportedProposal(T, REFEREE, { rung: "4", fault: new Error("boom") });
    expect(proposal.payload).toMatchObject({ rung: "4" });
    expect(proposal.payload.context).toContain("boom");
  });
});
