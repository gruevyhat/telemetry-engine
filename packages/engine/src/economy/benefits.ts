import type { AppendInput } from "../ledger/ledger.js";
import type { Fact } from "../ledger/types.js";
import type { CrewMember } from "../plugin-api/character.js";
import type { GameTime } from "../time/index.js";

/**
 * [rulebook §13.3, docs/design/travel-and-import-v1.md §5] Cash muster-out benefits only —
 * ship shares and inventory are deferred with reasoning (§5.3), no principal or inventory
 * substrate exists to post them against. `cashAmount` is a plain number, not parsed here: what
 * a travtools payload's benefits mean in credits is plugin knowledge (INV-1), so the caller
 * (the import UI or a future assembly step) resolves it before calling this.
 */
export interface ImportBenefitsInput {
  readonly crewMember: CrewMember;
  readonly cashAmount: number;
  readonly t: GameTime;
}

const SYSTEM_ACTOR = { kind: "referee", id: "referee" } as const;

/**
 * [INV-6] Proposals only — the caller commits via `phases/commits.ts`'s `commitImportBenefits`.
 * Idempotent by `sourceHash` (Spec §15's re-import identity): if `facts` already contains a
 * `crew.imported` fact for this crew member's `sourceHash`, returns `[]` rather than re-posting.
 * A character with no benefits (`cashAmount` <= 0) still posts its `crew.imported` roster
 * entry, just no `benefit.cashGranted` — no zero-value facts.
 */
export function planImportBenefits(facts: readonly Fact[], input: ImportBenefitsInput): AppendInput[] {
  const alreadyImported = facts.some(
    (fact) => fact.kind === "crew.imported" && fact.payload.sourceHash === input.crewMember.sourceHash,
  );
  if (alreadyImported) return [];

  const proposals: AppendInput[] = [
    {
      t: input.t,
      kind: "crew.imported",
      actor: SYSTEM_ACTOR,
      payload: {
        crewMemberId: input.crewMember.crewMemberId,
        name: input.crewMember.name,
        ...(input.crewMember.career === undefined ? {} : { career: input.crewMember.career }),
        sourceHash: input.crewMember.sourceHash,
      },
    },
  ];

  if (input.cashAmount > 0) {
    proposals.push({
      t: input.t,
      kind: "benefit.cashGranted",
      actor: SYSTEM_ACTOR,
      payload: { crewMemberId: input.crewMember.crewMemberId, amount: input.cashAmount },
    });
  }

  return proposals;
}
