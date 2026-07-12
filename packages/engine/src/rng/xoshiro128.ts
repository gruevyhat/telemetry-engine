/**
 * xoshiro128** (Blackman & Vigna, public-domain reference algorithm) plus splitmix32 for
 * seeding — hand-rolled per CLAUDE.md's "seeded RNG via named streams only" style rule; no
 * dependency for this exists on the M0-01 approved list, and none is needed, since it's ~20
 * lines of well-published bitwise arithmetic. No Math.random anywhere in this file.
 */

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

/** Deterministically expands a single 32-bit seed into a well-mixed stream of 32-bit words. */
export function splitmix32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/** Returns a generator of floats in [0, 1), seeded (via splitmix32) from a single 32-bit seed. */
export function createXoshiro128(seed: number): () => number {
  const seedWord = splitmix32(seed);
  let s0 = seedWord();
  let s1 = seedWord();
  let s2 = seedWord();
  let s3 = seedWord();

  return function next(): number {
    const result = (Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0) / 4294967296;

    const t = (s1 << 9) >>> 0;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11);

    return result;
  };
}
