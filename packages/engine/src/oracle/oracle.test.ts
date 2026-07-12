import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createRng } from "../rng/index.js";
import { ask, LIKELIHOOD_THRESHOLDS, textureFor } from "./oracle.js";

describe("ladder math table [Spec §8.4]", () => {
  it("matches the Spec's exact thresholds: certain 3+, likely 6+, even 8+, unlikely 10+, remote 12", () => {
    expect(LIKELIHOOD_THRESHOLDS).toEqual({ certain: 3, likely: 6, even: 8, unlikely: 10, remote: 12 });
  });
});

describe("flux texture bands [Spec §8.4]", () => {
  it("bands flux to the Spec's exact table", () => {
    expect(textureFor(5)).toBe("and");
    expect(textureFor(3)).toBe("and");
    expect(textureFor(2)).toBe("plain");
    expect(textureFor(1)).toBe("plain");
    expect(textureFor(0)).toBe("plain");
    expect(textureFor(-1)).toBe("but");
    expect(textureFor(-2)).toBe("but");
    expect(textureFor(-3)).toBe("opposite-and");
    expect(textureFor(-5)).toBe("opposite-and");
  });
});

describe("ask() [Spec §8.4]: rolls 2d6 on stream 'oracle', is deterministic per seed", () => {
  it("emits a question/likelihood/answer/texture bundle", () => {
    const answer = ask("Is anyone watching the door?", "even", createRng("seed"));
    expect(answer.question).toBe("Is anyone watching the door?");
    expect(answer.likelihood).toBe("even");
    expect(["YES", "NO"]).toContain(answer.answer);
    expect(["and", "plain", "but", "opposite-and"]).toContain(answer.texture);
  });

  it("draws only on the named 'oracle' stream, never touching another stream's sequence", () => {
    const rng = createRng("seed");
    const before = rng.derive("market:hexA").drawCount;
    ask("Is anyone watching the door?", "even", rng);
    expect(rng.derive("market:hexA").drawCount).toBe(before);
  });

  it("is deterministic for a given seed", () => {
    const first = ask("Q", "likely", createRng("seed-x"));
    const second = ask("Q", "likely", createRng("seed-x"));
    expect(second).toEqual(first);
  });
});

describe("ledger veto: re-draw-once likelihood shift [Spec §8.4]", () => {
  it("re-draws once, shifted toward consistency, when the first answer contradicts the ledger", () => {
    // "certain" (threshold 3) always rolls YES except on a natural 2 -- find a seed whose first
    // roll is the rare NO, then assert a consistency check that rejects NO forces a re-draw.
    let seed = 0;
    let rng = createRng(`seed-${seed}`);
    while (ask("Q", "certain", rng).answer !== "NO") {
      seed += 1;
      rng = createRng(`seed-${seed}`);
    }
    // isConsistent rejects NO -> re-draw once, shifted toward YES (already near-certain, so the
    // re-draw should very likely land YES, but even if not, it's forced to YES: consistency holds).
    const result = ask("Q", "certain", createRng(`seed-${seed}`), (candidate) => candidate === "YES");
    expect(result.answer).toBe("YES");
  });

  it("forces the consistent pole even when the shifted re-draw is still contradictory", () => {
    // "certain" (threshold 3) makes YES near-guaranteed on both the first roll and the shifted
    // re-draw (shifting away from "certain" still leaves a high YES chance) -- a check that only
    // ever accepts NO will very likely still see YES on the re-draw too, forcing NO regardless.
    const result = ask("Q", "certain", createRng("seed"), (candidate) => candidate === "NO");
    expect(result.answer).toBe("NO");
  });
});

describe("property: answers never contradict the ledger", () => {
  it("holds across random questions, likelihoods, and seeds when a consistency check is supplied", () => {
    const likelihoods = ["certain", "likely", "even", "unlikely", "remote"] as const;
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.constantFrom(...likelihoods),
        fc.string({ minLength: 1 }),
        fc.constantFrom<"YES" | "NO">("YES", "NO"),
        (question, likelihood, seed, requiredAnswer) => {
          const result = ask(question, likelihood, createRng(seed), (candidate) => candidate === requiredAnswer);
          expect(result.answer).toBe(requiredAnswer);
        },
      ),
    );
  });
});
