import { readFileSync } from "node:fs";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import type { IncidentFrame } from "../../engine/src/generate/frame.js";

const frameSchemaUrl = new URL("../../engine/src/generate/incident-frame.schema.json", import.meta.url);
const frameSchema = JSON.parse(readFileSync(frameSchemaUrl, "utf8"));
const ajv = new Ajv({ allErrors: true });
const validateFrame = ajv.compile(frameSchema);

const deckUrl = new URL("../../../content/decks/generic/frames.json", import.meta.url);
const frames: readonly IncidentFrame[] = JSON.parse(readFileSync(deckUrl, "utf8"));

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

  // INV-10 zero-unique-attribution ambiguity is covered for every deck (this one and trade's)
  // by inv10-property.test.ts's inference-bot property suite, not repeated here.
});
