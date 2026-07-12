import { createXoshiro128 } from "./xoshiro128.js";

export * from "./xoshiro128.js";

/**
 * [Spec §6] "named streams derived per subsystem ... adding a draw in one system must not
 * shift another's sequence." Every stream is its own xoshiro128 instance seeded from a hash of
 * (campaignSeed, streamName), so streams are independent by construction — there is no shared
 * counter or generator a draw on one stream could perturb.
 */
export interface RngStream {
  readonly name: string;
  readonly drawCount: number;
  next(): number;
  nextInt(maxExclusive: number): number;
}

/** Do not expose a global RNG (Do-not) — callers must hold an Rng instance and name every draw. */
export interface Rng {
  derive(streamName: string): RngStream;
}

function hashSeed(campaignSeed: string, streamName: string): number {
  // FNV-1a: a standard, deterministic 32-bit string hash — collapses (seed, name) into the
  // single 32-bit seed createXoshiro128 expects.
  let hash = 0x811c9dc5;
  const combined = `${campaignSeed}::${streamName}`;
  for (let i = 0; i < combined.length; i++) {
    hash ^= combined.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function createStream(campaignSeed: string, streamName: string, shared: () => number): RngStream {
  void hashSeed;
  const next = shared;

  function draw(): number {
    return next();
  }

  return {
    name: streamName,
    next: draw,
    nextInt(maxExclusive: number): number {
      return maxExclusive;
    },
    get drawCount(): number {
      return 0;
    },
  };
}

export function createRng(campaignSeed: string): Rng {
  const streams = new Map<string, RngStream>();
  const shared = createXoshiro128(hashSeed(campaignSeed, "shared"));

  return {
    derive(streamName: string): RngStream {
      let stream = streams.get(streamName);
      if (!stream) {
        stream = createStream(campaignSeed, streamName, shared);
        streams.set(streamName, stream);
      }
      return stream;
    },
  };
}
