import type { PhaseStep } from "./types.js";

/**
 * [M0-09] The shape `content/frames/<frame>/announce-templates.json` already ships and
 * `announce-templates.schema.json` already validates statically: a flat map of non-empty
 * strings, keyed by whatever `PhaseStep.render` a turn script names. This is the same contract,
 * enforced at load time so a malformed map fails loudly the moment it's loaded, not silently at
 * whatever later point a lookup happens to miss.
 */
export type AnnounceTemplates = Readonly<Record<string, string>>;

export function loadAnnounceTemplates(raw: unknown): AnnounceTemplates {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new Error(`announce templates: expected a flat object, got ${JSON.stringify(raw)}`);
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0) {
    throw new Error("announce templates: expected at least one entry");
  }
  for (const [key, value] of entries) {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(`announce templates: "${key}" must be a non-empty string, got ${JSON.stringify(value)}`);
    }
  }
  return raw as AnnounceTemplates;
}

/**
 * [Spec §14 TTS: "browser speechSynthesis reading MAGGIE's announce steps"] Looks up an
 * announce step's authored text. Returns undefined for a step with no render key (an automatic
 * announce step content-lint doesn't require one for) -- there is nothing to read aloud, which
 * is different from a render key that's set but unresolvable, which throws: mirrors
 * content-lint's own two semantic checks ("announce step has no render key" is a content
 * authoring error only when the step isn't automatic; "render key has no announce template" is
 * always an error) as a runtime guarantee, not just a static content-lint pass.
 */
export function announcementText(templates: AnnounceTemplates, step: PhaseStep): string | undefined {
  if (!step.render) {
    return undefined;
  }
  const text = templates[step.render];
  if (text === undefined) {
    throw new Error(`announcementText: no template for render key "${step.render}"`);
  }
  return text;
}
