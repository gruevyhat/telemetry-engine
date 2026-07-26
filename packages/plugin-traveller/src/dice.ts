/**
 * [M3-11, Spec §6, §15] The standard 2d6 convention: total = the player's reported raw roll
 * (physical dice; "the engine never rolls for a PC") plus a combined characteristic+skill DM;
 * effect = total - difficulty, matching `packages/engine/src/phases/interpreter.ts`'s
 * `reportCheck` exactly so a player can report `dice.check`'s `total` there unmodified.
 * Natural 2 always fails, natural 12 always succeeds, independent of the modified total — the
 * standard automatic-extremes rule.
 */

import type { CheckResult, DiceCheckInput, DiceConvention } from "@telemetry/engine";

export const convention: DiceConvention = "2d6";

export function check(input: DiceCheckInput): CheckResult {
  const total = input.rawRoll + input.dm;
  const effect = total - input.difficulty;
  const critical: CheckResult["critical"] = input.rawRoll === 2 ? "failure" : input.rawRoll === 12 ? "success" : undefined;
  const outcome: CheckResult["outcome"] = critical === "failure" ? "failure" : critical === "success" ? "success" : effect >= 0 ? "success" : "failure";

  return { total, effect, outcome, critical };
}
