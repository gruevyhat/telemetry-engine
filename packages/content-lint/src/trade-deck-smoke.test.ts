import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRng } from "../../engine/src/rng/index.js";
import { fireFrame, type IncidentFrame } from "../../engine/src/generate/frame.js";

const deckUrl = new URL("../../../content/decks/trade/frames.json", import.meta.url);
const frames: readonly IncidentFrame[] = JSON.parse(readFileSync(deckUrl, "utf8"));
const T = { day: 14, slot: "DOCKSIDE" as const };

/**
 * [Spec §19: "sim smoke: new/changed content runs 50 headless campaigns"] The real sim runner is
 * a no-op skeleton until M1-12 (packages/sim/bin/sim.mjs), so a full campaign-level smoke test
 * isn't buildable yet. This is the smoke check that *is* buildable now: every real frame in the
 * trade deck actually fires -- composes, resolves its cross-axis refs, and never trips
 * compose()'s "never prose" guard -- across several seeds, not just whichever one a hand-written
 * unit test happened to pick.
 *
 * Lives in content-lint, not packages/engine: content-lint is allowed to depend on both engine
 * and content (that's its job); packages/engine must never import from content/, not even in a
 * test (INV-1, CLAUDE.md's first hard rule -- "not types, not tests, not temporarily").
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
