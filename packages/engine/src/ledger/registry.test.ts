import { describe, expect, it } from "vitest";
import { createKindRegistry, type KindDefinition } from "./registry.js";
import type { PayloadSchema } from "./schema.js";
import { KINDS_V0 } from "./kinds-v0.js";

describe("kind registry", () => {
  const registry = createKindRegistry(KINDS_V0);

  it("loads the v0 catalog kinds", () => {
    expect(registry.has("cargo.loaded")).toBe(true);
    expect(registry.has("lock.cycled")).toBe(true);
    expect(registry.has("npc.statement")).toBe(true);
  });

  it("rejects an unregistered kind", () => {
    const result = registry.validate("made.up.kind", {});
    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatch(/unregistered kind/);
  });

  it("rejects a payload missing required fields", () => {
    const result = registry.validate("cargo.loaded", { lotId: "L1" });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/tons/);
    expect(result.errors.join(" ")).toMatch(/manifestId/);
    expect(result.errors.join(" ")).toMatch(/bay/);
  });

  it("rejects a payload with a wrong-typed field", () => {
    const result = registry.validate("cargo.loaded", { lotId: "L1", tons: "twenty", manifestId: "M1", bay: "B1" });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/tons/);
  });

  it("rejects a payload with an unexpected field (payloads are exact)", () => {
    const result = registry.validate("cargo.loaded", {
      lotId: "L1",
      tons: 20,
      manifestId: "M1",
      bay: "B1",
      extra: "nope",
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/extra/);
  });

  it("accepts a well-formed payload for a registered kind", () => {
    const result = registry.validate("cargo.loaded", { lotId: "L1", tons: 20, manifestId: "M1", bay: "B1" });
    expect(result).toEqual({ ok: true, errors: [] });
  });

  it("makes split-visibility payloads impossible by construction: registering a kind whose payload field smuggles in a visibility key throws", () => {
    // FieldSchema has no visibility key, so this can only be reached by data that bypasses
    // the type system (e.g. a future content-loaded, untyped catalog) — simulated here via cast.
    const untypedPayload = {
      truthTier: { type: "string", visibility: "referee" },
    } as unknown as PayloadSchema;

    const smuggled: KindDefinition = {
      kind: "npc.statement.truthTier",
      defaultVisibility: "referee",
      payload: untypedPayload,
    };

    expect(() => createKindRegistry([...KINDS_V0, smuggled])).toThrow(/split-visibility/);
  });
});
