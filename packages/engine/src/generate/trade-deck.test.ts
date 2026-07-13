import { describe, expect, it } from "vitest";
import { createRng } from "../rng/index.js";
import { fireFrame, type IncidentFrame } from "./frame.js";
import rawFrames from "../../../../content/decks/trade/frames.json" with { type: "json" };

const frames = rawFrames as readonly IncidentFrame[];
const T = { day: 14, slot: "DOCKSIDE" as const };

/**
 * [Spec §19: "sim smoke: new/changed content runs 50 headless campaigns"] The real sim runner is
 * a no-op skeleton until M1-12 (packages/sim/bin/sim.mjs), so a full campaign-level smoke test
 * isn't buildable yet. This is the engine-level smoke check that *is* buildable now: every real
 * frame in the trade deck actually fires -- composes, resolves its cross-axis refs, and never
 * trips compose()'s "never prose" guard -- across several seeds, not just whichever one a
 * hand-written unit test happened to pick.
 */
describe("trade deck smoke [content/decks/trade/frames.json, Spec §8.1/§8.2]", () => {
  it("ships at least 10 frames", () => {
    expect(frames.length).toBeGreaterThanOrEqual(10);
  });

  it.each(frames.map((frame) => frame.id))("fires %s across several seeds without throwing", (frameId) => {
    const frame = frames.find((f) => f.id === frameId)!;
    for (const seed of ["seed-a", "seed-b", "seed-c"]) {
      const fired = fireFrame(frame, T, createRng(seed));
      expect(fired.frameId).toBe(frame.id);
      expect(fired.causeProposals.length).toBeGreaterThan(0);
    }
  });
});
