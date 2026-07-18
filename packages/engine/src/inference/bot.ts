import { derive } from "../ledger/derive.js";
import type { Fact } from "../ledger/types.js";
import { evaluateAccess } from "../evidence/evidence.js";
import { presenceProjection } from "../position/index.js";
import { consistentActors, type ImpliesRule } from "../validate/closure.js";

/**
 * [fact-kinds-v0.md §3, Spec §21.2: "sim bots run brute-force implication closure; assert no
 * incident is uniquely attributable from visible facts alone"] "Enumerate actor assignments
 * consistent with (visible facts ∪ implies closure ∪ position model)." The enumeration domain is
 * the campaign roster (the "small actor set") -- not the IMPLIES_V0 keyset (that's
 * consistentActors's own narrower domain: actors appearing on a matching visible fact) and not
 * validate() (which checks registry/visibility conformance, not "was this actor elsewhere").
 *
 * A roster member survives unless a filter actively rules them out:
 * - **position model:** an actor declared off-ship at the cause fact's time/slot couldn't have
 *   been there. Reuses evaluateAccess's existing "aboard" check against derived presence state
 *   rather than a parallel alibi mechanism.
 * - **implies closure:** when the cause fact's kind has an IMPLIES_V0 rule, only actors
 *   consistentActors finds on a matching visible fact remain. A kind with *no* rule imposes no
 *   implies constraint at all -- that's a wide-open roster, not a measurement gap -- so
 *   `impliesRule` is skipped entirely when undefined.
 *
 * Zero survivors is a real, maximal violation (not "unmeasurable"): it means not even the cause
 * fact's own actor remains a consistent explanation once the constraints are applied, which is
 * the sameActor-only-clause failure mode `camera.looped`-shaped incidents hit (see
 * docs/tasks/BL-05.md).
 */
export function consistentWorlds(causeFact: Fact, roster: readonly string[], visibleFacts: readonly Fact[], impliesRule: ImpliesRule | undefined): ReadonlySet<string> {
  const presence = derive(visibleFacts, presenceProjection);

  const positionSurvivors = roster.filter((actorId) => {
    const result = evaluateAccess(
      { kind: "aboard" },
      { presence, actorId, day: causeFact.t.day, slot: causeFact.t.slot, heldGear: new Set(), codeHolders: new Set(), holdsPrisoner: false },
    );
    return result.ok;
  });

  if (!impliesRule) {
    return new Set(positionSurvivors);
  }

  const impliesSurvivors = consistentActors(impliesRule, causeFact, visibleFacts);
  return new Set(positionSurvivors.filter((actorId) => impliesSurvivors.has(actorId)));
}
