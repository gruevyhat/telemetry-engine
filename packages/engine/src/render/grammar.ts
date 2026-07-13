/**
 * [Spec §14: "Grammar helpers for seams (lists, tense, plugin lexicon)"] Small, pure formatting
 * seams the template backend leans on so every beat template doesn't hand-roll its own list
 * joining or sentence punctuation. "Plugin lexicon" (swapping a word per-plugin persona) isn't
 * built here: Spec §15's Plugin.persona.lexicon has no shape yet in plugin-api (no task has
 * introduced it), so there is nothing to seam against. Only the seams with a concrete, testable
 * need in this task's own templates are implemented.
 */

/** Joins a flat list MAGGIE-style: "a", "a and b", "a, b, and c" — never an Oxford-comma-less
 * run-on, never a bare comma join (which reads like a CSV dump, not a sentence). */
export function joinList(items: readonly string[]): string {
  if (items.length === 0) {
    return "";
  }
  if (items.length === 1) {
    return items[0]!;
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  const allButLast = items.slice(0, -1).join(", ");
  return `${allButLast}, and ${items[items.length - 1]}`;
}

/** [maggie-voice.md §3: "Short declaratives... no ellipses"] Ensures a fragment ends in a single
 * terminal period without doubling one a content author already supplied. */
export function ensureSentence(fragment: string): string {
  const trimmed = fragment.trim();
  return /[.?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** Picks "a"/"an" by sound, not spelling convention -- a plugin's skill names (content-defined,
 * e.g. "Admin", "Broker") aren't a closed set this module can special-case by hand. */
export function indefiniteArticle(word: string): "a" | "an" {
  return /^[aeiou]/i.test(word) ? "an" : "a";
}

function splitIdentifierWords(raw: string): string[] {
  const withoutRefPrefix = raw.includes(":") ? raw.slice(raw.indexOf(":") + 1) : raw;
  const spaced = withoutRefPrefix.replace(/[-_]/g, " ").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.split(/\s+/).filter((word) => word.length > 0);
}

/**
 * [maggie-voice.md §7: "read the line aloud" -- an ActorRef id like "npc:kessler" or a
 * kebab/camelCase content key like "cargo-diversion"/"codeClass" is not something a ship's
 * computer would say aloud.] Turns an internal identifier into plain spoken words: strips a
 * "kind:" ref prefix, splits kebab-case/camelCase/snake_case on word boundaries, lowercases.
 * No name registry exists yet (no content schema for crew/NPC display names), so this is a v0
 * stand-in for real names -- see renderer.ts's extrapolation note on confrontationOpen/
 * incidentSurface.
 */
export function humanize(raw: string): string {
  return splitIdentifierWords(raw).join(" ").toLowerCase();
}

/** Same humanization as {@link humanize}, but title-cased for use where the value functions as a
 * proper noun (a declarer, a target, an actor slot) rather than a descriptive word. */
export function properName(raw: string): string {
  return splitIdentifierWords(raw)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}
