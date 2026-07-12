import type { Rng } from "../rng/index.js";

/**
 * [Spec §8.4] "The gap-filler when no procedure or content answers a question." ask() rolls on
 * the fixed named stream "oracle" — not a caller-chosen stream — matching Spec §6's named
 * streams list ("oracle" is one of the enumerated stream names alongside market:<hex> etc.).
 */
export type Likelihood = "certain" | "likely" | "even" | "unlikely" | "remote";

export const LIKELIHOOD_THRESHOLDS: Readonly<Record<Likelihood, number>> = {
  certain: 3,
  likely: 6,
  even: 8,
  unlikely: 10,
  remote: 12,
};

/** Ordered low-probability-of-YES to high, for "shift one step toward consistency." */
const LADDER: readonly Likelihood[] = ["remote", "unlikely", "even", "likely", "certain"];

export type Texture = "and" | "plain" | "but" | "opposite-and";

/** [Spec §8.4] flux = d6 - d6: >=+3 "and" · +1..2 plain · 0 plain · -1..-2 "but" · <=-3 "opposite-and". */
export function textureFor(flux: number): Texture {
  if (flux >= 3) {
    return "and";
  }
  if (flux <= -3) {
    return "opposite-and";
  }
  if (flux <= -1) {
    return "but";
  }
  return "plain";
}

export interface OracleAnswer {
  readonly question: string;
  readonly likelihood: Likelihood;
  readonly answer: "YES" | "NO";
  readonly texture: Texture;
}

/** A caller-supplied ledger-consistency check: ask() knows nothing about game state, so the
 * caller decides whether a candidate answer would contradict what's already committed. */
export type ConsistencyCheck = (candidate: "YES" | "NO") => boolean;

function shiftToward(likelihood: Likelihood, targetAnswer: "YES" | "NO"): Likelihood {
  const index = LADDER.indexOf(likelihood);
  const direction = targetAnswer === "YES" ? 1 : -1;
  const nextIndex = Math.min(LADDER.length - 1, Math.max(0, index + direction));
  return LADDER[nextIndex]!;
}

function d6(rng: { nextInt(maxExclusive: number): number }): number {
  return rng.nextInt(6) + 1;
}

function roll(likelihood: Likelihood, stream: { nextInt(maxExclusive: number): number }): { answer: "YES" | "NO"; texture: Texture } {
  const total2d6 = d6(stream) + d6(stream);
  const answer: "YES" | "NO" = total2d6 >= LIKELIHOOD_THRESHOLDS[likelihood] ? "YES" : "NO";
  const flux = d6(stream) - d6(stream);
  return { answer, texture: textureFor(flux) };
}

/**
 * [Spec §8.4] "Oracle answers are facts and therefore validated: an answer that would
 * contradict the ledger is re-drawn once with likelihood shifted one step toward consistency;
 * if still contradictory, the answer is forced to the consistent pole and the texture die is
 * kept." Do-not: oracle output passes the validator like everything else -- `isConsistent`
 * defaults to accepting anything, so a caller that doesn't wire a real check gets an unvetoed
 * (but still schema-valid, still-validated-by-validate()) answer, not a bypass.
 */
export function ask(question: string, likelihood: Likelihood, rng: Rng, isConsistent: ConsistencyCheck = () => true): OracleAnswer {
  const stream = rng.derive("oracle");

  const first = roll(likelihood, stream);
  if (isConsistent(first.answer)) {
    return { question, likelihood, answer: first.answer, texture: first.texture };
  }

  const targetAnswer: "YES" | "NO" = first.answer === "YES" ? "NO" : "YES";
  const shiftedLikelihood = shiftToward(likelihood, targetAnswer);
  const second = roll(shiftedLikelihood, stream);
  const finalAnswer = isConsistent(second.answer) ? second.answer : targetAnswer;
  return { question, likelihood, answer: finalAnswer, texture: second.texture };
}
