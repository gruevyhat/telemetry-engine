import type { EvidencePlan } from "../evidence/evidence.js";
import type { Ledger } from "../ledger/ledger.js";
import type { Fact } from "../ledger/types.js";
import type { InterrogationAnswer } from "../npc/interrogation.js";
import type { GameTime } from "../time/index.js";

/**
 * [INV-6] "Nothing writes to the ledger except the phase-engine interpreter." Evidence actions
 * and interrogation answers are player-triggered, not scripted turn-script steps (see M1-07's
 * extrapolation log: no new PhaseStepKind for evidence), so they have no `resolveStep` case to
 * live in -- but the actual ledger write still has to happen somewhere under phases/, per the
 * same rule that makes createPhaseInterpreter's advance() the only other append call site. These
 * are standalone functions rather than PhaseInterpreter methods because they don't need script/
 * step context, only a ledger.
 */

/** [INV-11] Commits a plan's proposals atomically via ledger.appendAll. Every proposal
 * rankAndPlanReveal builds is valid-by-construction (reveal's targets/fields are always arrays,
 * costTick's fields are always well-typed), so there is no reachable input that makes a real
 * plan fail appendAll -- appendAll's own atomicity is already covered directly (ledger.test.ts)
 * against a genuinely invalid batch. */
export function commitEvidenceReveal(ledger: Ledger, plan: Extract<EvidencePlan, { ok: true }>): Fact[] {
  return ledger.appendAll(plan.revealProposals);
}

/** [fact-kinds-v0.md §3] Split-visibility rule: npc.statement (table) and npc.truthTierAssigned
 * (referee) are separate facts linked by `causes`, never one payload with mixed visibility. The
 * second fact's `causes` needs the first's committed id, so this is two sequential appends
 * rather than one appendAll batch -- both proposals are always valid (statement's payload is
 * always well-typed strings; the tier assignment's payload is always a valid tier string), so
 * there's no atomicity risk in the gap between them. */
export function commitInterrogationAnswer(ledger: Ledger, answer: InterrogationAnswer, t: GameTime): { statement: Fact; tierAssignment: Fact } {
  const statement = ledger.append({
    t,
    kind: "npc.statement",
    actor: { kind: "npc", id: answer.npcId },
    payload: { npcId: answer.npcId, topic: answer.topic },
  });
  const tierAssignment = ledger.append({
    t,
    kind: "npc.truthTierAssigned",
    actor: { kind: "referee", id: "referee" },
    payload: { tier: answer.tier },
    causes: [statement.id],
  });
  return { statement, tierAssignment };
}
