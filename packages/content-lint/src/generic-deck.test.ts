import { readFileSync } from "node:fs";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import { createRng } from "../../engine/src/rng/index.js";
import { checkIncidentAmbiguity, fireFrame, type IncidentFrame } from "../../engine/src/generate/frame.js";
import { IMPLIES_V0 } from "../../engine/src/validate/closure.js";
import type { Fact } from "../../engine/src/ledger/types.js";

const frameSchemaUrl = new URL("../../engine/src/generate/incident-frame.schema.json", import.meta.url);
const frameSchema = JSON.parse(readFileSync(frameSchemaUrl, "utf8"));
const ajv = new Ajv({ allErrors: true });
const validateFrame = ajv.compile(frameSchema);

const deckUrl = new URL("../../../content/decks/generic/frames.json", import.meta.url);
const frames: readonly IncidentFrame[] = JSON.parse(readFileSync(deckUrl, "utf8"));
const T = { day: 14, slot: "DOCKSIDE" as const };

const FAMILIES = ["shortfall", "substitution", "leak", "malfunction", "ghost"];

/**
 * [M1-11b Done-when: "one nearly-unconstrained frame per Appendix-A family"] Appendix A itself
 * doesn't name these five families anywhere in the Spec -- they're M1-11b's own task-card
 * taxonomy (informal archetypes pattern-matched against Appendix A's worked example), not a
 * Spec-defined enum. Verified here only as "one frame per name the card lists," not against any
 * Spec text.
 */
describe("content/decks/generic/frames.json -- generic-family safety-net frames [Spec §17 rung 1, M1-11b]", () => {
  it("ships exactly one frame per family", () => {
    expect(frames).toHaveLength(FAMILIES.length);
    for (const family of FAMILIES) {
      expect(frames.some((frame) => frame.id === `generic:${family}`)).toBe(true);
    }
  });

  it("every frame validates against incident-frame.schema.json", () => {
    for (const frame of frames) {
      const valid = validateFrame(frame);
      if (!valid) {
        throw new Error(`generic:${frame.id} failed schema: ${ajv.errorsText(validateFrame.errors)}`);
      }
      expect(valid).toBe(true);
    }
  });

  it.each(frames.map((frame) => frame.id))(
    "%s fires and independently satisfies INV-10 ambiguity against an adversarial ledger (only its own committed facts visible)",
    (frameId) => {
      const frame = frames.find((f) => f.id === frameId)!;
      const fired = fireFrame(frame, T, createRng("adversarial-check"));
      expect(fired.causeProposals.length).toBeGreaterThan(0);

      const facts: Fact[] = fired.causeProposals.map((proposal, i) => ({
        id: `${frameId}-${i}`,
        wall: 0,
        ...proposal,
        visibility: { level: "referee" },
      }));
      const primaryCause = facts.find((f) => f.kind in IMPLIES_V0);
      expect(primaryCause, `expected at least one committed cause fact whose kind has an IMPLIES_V0 entry (frame "${frameId}")`).toBeDefined();

      const rule = IMPLIES_V0[primaryCause!.kind]!;
      const result = checkIncidentAmbiguity(primaryCause!, rule, facts);
      expect(result, `frame "${frameId}" should hold INV-10 ambiguity from only its own committed facts: ${JSON.stringify(result)}`).toBeUndefined();
    },
  );
});
