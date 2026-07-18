import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createRng } from "../../engine/src/rng/index.js";
import { fireFrame, type IncidentFrame } from "../../engine/src/generate/frame.js";
import { IMPLIES_V0 } from "../../engine/src/validate/closure.js";
import { consistentWorlds } from "../../engine/src/inference/bot.js";
import type { Fact } from "../../engine/src/ledger/types.js";

const T = { day: 14, slot: "DOCKSIDE" as const };

/** A representative small-table roster covering every actor named across both shipped decks,
 * plus the usual PC crew -- the inference bot's enumeration domain is the roster, not whichever
 * actor a frame happens to draw (fact-kinds-v0.md §3). */
const ROSTER = ["pc:zhan", "pc:brennan", "pc:deuce", "npc:kessler", "npc:reyes", "npc:okonkwo", "npc:duty-officer", "npc:backup-officer"];

function loadDeck(relativePath: string): readonly IncidentFrame[] {
  return JSON.parse(readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

const DECKS: ReadonlyArray<readonly [string, readonly IncidentFrame[]]> = [
  ["trade", loadDeck("../../../content/decks/trade/frames.json")],
  ["generic", loadDeck("../../../content/decks/generic/frames.json")],
];

/**
 * [Spec §21.2: "sim bots run brute-force implication closure; assert no incident is uniquely
 * attributable from visible facts alone" -- zero tolerance, M1-12's own Tests-first bullet]
 * Fires every real frame in both shipped decks and checks the inference bot's roster enumeration
 * against an adversarial ledger containing only that frame's own committed facts -- nothing a
 * campaign might coincidentally have seeded. This supersedes the narrower, IMPLIES_V0-keyed
 * ambiguity check generic-deck.test.ts had before the real inference bot existed.
 */
describe("inference bot property: zero-unique-attribution across every shipped frame [Spec §21.2, INV-5, INV-10]", () => {
  for (const [deckName, frames] of DECKS) {
    it.each(frames.map((frame) => frame.id))(`%s (${deckName} deck) never uniquely attributes`, (frameId) => {
      const frame = frames.find((f) => f.id === frameId)!;
      const fired = fireFrame(frame, T, createRng("inv10-property-check"));
      expect(fired.causeProposals.length).toBeGreaterThan(0);

      const facts: Fact[] = fired.causeProposals.map((proposal, i) => ({
        id: `${frameId}-${i}`,
        wall: 0,
        ...proposal,
        visibility: { level: "referee" },
      }));

      // The property applies to the frame's own designated incident cause -- innocentTwin[0] --
      // not to every auxiliary fact a frame also commits. A frame may commit supporting cause
      // facts purely so the *primary* cause's own implies rule has something to enumerate over
      // (e.g. two access.granted grants backing a lock.cycled cause); those supporting facts
      // aren't themselves "the surfaced incident" and checking them independently would demand
      // every one of them separately satisfy ambiguity too, which isn't what Spec §8.2 describes
      // ("for every surfaced incident..." -- one incident per fired frame).
      const causeFact = facts[0]!;
      const worlds = consistentWorlds(causeFact, ROSTER, facts, IMPLIES_V0[causeFact.kind]);
      expect(
        worlds.size,
        `frame "${frameId}" cause fact "${causeFact.kind}" (actor ${causeFact.actor.id}) has only ${worlds.size} consistent world(s): ${JSON.stringify([...worlds])}`,
      ).toBeGreaterThanOrEqual(2);
    });
  }
});
