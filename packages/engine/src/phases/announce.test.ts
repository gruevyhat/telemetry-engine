import { describe, expect, it } from "vitest";
import { announcementText, loadAnnounceTemplates } from "./announce.js";
import type { PhaseStep } from "./types.js";

function announceStep(overrides: Partial<PhaseStep> = {}): PhaseStep {
  return { id: "s1", kind: "announce", next: "s2", ...overrides };
}

describe("loadAnnounceTemplates — content/frames/<frame>/announce-templates.json's shape [M0-09]", () => {
  it("accepts a flat map of non-empty strings", () => {
    const templates = loadAnnounceTemplates({ "demo.dockside": "Dockside systems are open." });
    expect(templates["demo.dockside"]).toBe("Dockside systems are open.");
  });

  it("rejects a non-object", () => {
    expect(() => loadAnnounceTemplates("not an object")).toThrow();
    expect(() => loadAnnounceTemplates(null)).toThrow();
    expect(() => loadAnnounceTemplates(["array"])).toThrow();
  });

  it("rejects an empty map (content-lint's own schema requires minProperties: 1)", () => {
    expect(() => loadAnnounceTemplates({})).toThrow();
  });

  it("rejects a non-string value", () => {
    expect(() => loadAnnounceTemplates({ "demo.dockside": 5 })).toThrow();
  });

  it("rejects an empty-string value", () => {
    expect(() => loadAnnounceTemplates({ "demo.dockside": "" })).toThrow();
  });
});

describe("announcementText — looks up an announce step's render key [Spec §14 TTS: reading announce steps]", () => {
  const templates = loadAnnounceTemplates({ "demo.dockside": "Dockside systems are open." });

  it("returns the template text for a step whose render key is present", () => {
    expect(announcementText(templates, announceStep({ render: "demo.dockside" }))).toBe("Dockside systems are open.");
  });

  it("returns undefined for an automatic announce step with no render key (nothing to say)", () => {
    expect(announcementText(templates, announceStep({ automatic: true }))).toBeUndefined();
  });

  it("throws when a render key is set but no template has it (mirrors content-lint's semantic check as a runtime guarantee)", () => {
    expect(() => announcementText(templates, announceStep({ render: "missing.key" }))).toThrow(/no template for render key "missing\.key"/);
  });
});
