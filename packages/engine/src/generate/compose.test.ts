import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createRng } from "../rng/index.js";
import { compose, type SlotEntry, type SlotTables } from "./compose.js";

const REVENGE: SlotEntry = { id: "revenge", factFields: {}, surfaceFields: {} };
const AFT_BAY: SlotEntry = { id: "aft-bay", factFields: {}, surfaceFields: {} };
const CAMERA: SlotEntry = { id: "camera-loop", factFields: {}, surfaceFields: {} };

function minimalTables(overrides: Partial<SlotTables> = {}): SlotTables {
  return {
    actor: [{ id: "npc:kessler", factFields: {}, surfaceFields: {} }],
    motive: [REVENGE],
    method: [{ id: "cargo-diversion", factFields: { channel: "black market" }, surfaceFields: {} }],
    location: [AFT_BAY],
    trace: [CAMERA],
    ...overrides,
  };
}

describe("compose [Spec §8.1: actor x motive x method x location x trace]", () => {
  it("draws exactly one entry per axis and merges their fields into a fact bundle + surface descriptor", () => {
    const result = compose(minimalTables(), createRng("seed").derive("compose:test"));
    expect(result.chosen).toEqual({
      actor: "npc:kessler",
      motive: "revenge",
      method: "cargo-diversion",
      location: "aft-bay",
      trace: "camera-loop",
    });
    expect(result.factBundle.fields).toEqual({ channel: "black market" });
  });

  it("resolves a cross-axis ref to whichever entry was drawn on the referenced axis", () => {
    const tables = minimalTables({
      trace: [{ id: "camera-loop", factFields: { seenAt: { ref: "location" } }, surfaceFields: { involvedActor: { ref: "actor" } } }],
    });
    const result = compose(tables, createRng("seed").derive("compose:test"));
    expect(result.factBundle.fields.seenAt).toBe("aft-bay");
    expect(result.surface.fields.involvedActor).toBe("npc:kessler");
  });

  it("throws rather than emit a prose-like field (Spec §8.1: never prose)", () => {
    const tables = minimalTables({
      method: [{ id: "cargo-diversion", factFields: { note: "The crew diverted the cargo late at night." }, surfaceFields: {} }],
    });
    expect(() => compose(tables, createRng("seed").derive("compose:test"))).toThrow(/prose/);
  });

  it("type-level: FactBundleProposal/SurfaceDescriptor fields are flat primitives, never a nested object", () => {
    const result = compose(minimalTables(), createRng("seed").derive("compose:test"));
    // No TS error assigning a primitive-only view of the fields; this line only compiles if the
    // type is exactly Record<string, string | number | boolean>, not `unknown`/`object`.
    const check: Record<string, string | number | boolean> = result.factBundle.fields;
    expect(check).toBeDefined();
  });

  it("property: composition over random tables always yields fully-resolved bundles (every slot ref resolves)", () => {
    const axisArb = fc.constantFrom("actor", "motive", "method", "location", "trace") as fc.Arbitrary<
      "actor" | "motive" | "method" | "location" | "trace"
    >;
    const fieldArb = fc.oneof(fc.string({ minLength: 1, maxLength: 8 }).filter((s) => !/[.!?\n]/.test(s)), axisArb.map((ref) => ({ ref })));
    const entryArb = fc.record({
      id: fc.string({ minLength: 1, maxLength: 8 }).filter((s) => !/[.!?\n]/.test(s)),
      factFields: fc.dictionary(fc.string({ minLength: 1, maxLength: 6 }), fieldArb, { maxKeys: 3 }),
      surfaceFields: fc.dictionary(fc.string({ minLength: 1, maxLength: 6 }), fieldArb, { maxKeys: 3 }),
    });
    const tablesArb = fc.record({
      actor: fc.array(entryArb, { minLength: 1, maxLength: 3 }),
      motive: fc.array(entryArb, { minLength: 1, maxLength: 3 }),
      method: fc.array(entryArb, { minLength: 1, maxLength: 3 }),
      location: fc.array(entryArb, { minLength: 1, maxLength: 3 }),
      trace: fc.array(entryArb, { minLength: 1, maxLength: 3 }),
    });

    fc.assert(
      fc.property(tablesArb, fc.string({ minLength: 1 }), (tables, seed) => {
        const result = compose(tables, createRng(seed).derive("compose:test"));
        for (const value of Object.values(result.factBundle.fields)) {
          expect(typeof value === "string" || typeof value === "number" || typeof value === "boolean").toBe(true);
        }
        for (const value of Object.values(result.surface.fields)) {
          expect(typeof value === "string" || typeof value === "number" || typeof value === "boolean").toBe(true);
        }
      }),
    );
  });
});
