import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createRng } from "./index.js";

describe("named RNG streams [Spec §6]", () => {
  it("stream independence: extra draws on stream A leave stream B's sequence unchanged", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.nat({ max: 20 }), fc.nat({ max: 10 }), (seed, drawsOnB, extraDrawsOnA) => {
        const withoutNoise = createRng(seed);
        const bAlone: number[] = [];
        for (let i = 0; i < drawsOnB; i++) {
          bAlone.push(withoutNoise.derive("B").next());
        }

        const withNoise = createRng(seed);
        for (let i = 0; i < extraDrawsOnA; i++) {
          withNoise.derive("A").next();
        }
        const bAfterNoise: number[] = [];
        for (let i = 0; i < drawsOnB; i++) {
          bAfterNoise.push(withNoise.derive("B").next());
        }

        expect(bAfterNoise).toEqual(bAlone);
      }),
    );
  });

  it("same seed + same draw sequence produces the same outputs (reproducible across separate instances)", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), fc.nat({ max: 30 }), (seed, streamName, draws) => {
        const rngA = createRng(seed);
        const rngB = createRng(seed);
        const sequenceA = Array.from({ length: draws }, () => rngA.derive(streamName).next());
        const sequenceB = Array.from({ length: draws }, () => rngB.derive(streamName).next());
        expect(sequenceB).toEqual(sequenceA);
      }),
    );
  });

  it("stream derivation from the campaign seed is stable across restarts", () => {
    const firstRun = createRng("campaign-42");
    const firstDraw = firstRun.derive("oracle").next();

    // a brand-new Rng, as if the app restarted, from the same campaign seed
    const restarted = createRng("campaign-42");
    expect(restarted.derive("oracle").next()).toBe(firstDraw);

    // deriving the same name twice on one instance returns the same stream, not a fresh one
    expect(firstRun.derive("oracle")).toBe(firstRun.derive("oracle"));
  });

  it("tracks a per-stream draw count", () => {
    const rng = createRng("seed");
    const stream = rng.derive("agenda-deal");
    expect(stream.drawCount).toBe(0);
    stream.next();
    stream.next();
    stream.nextInt(6);
    expect(stream.drawCount).toBe(3);
  });

  it("nextInt stays within [0, maxExclusive)", () => {
    const rng = createRng("seed");
    const stream = rng.derive("market:vantage");
    for (let i = 0; i < 200; i++) {
      const value = stream.nextInt(6);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
    }
  });
});
