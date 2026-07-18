import type { RngStream } from "../rng/index.js";

/**
 * [Spec §8.1] "Situations compose from orthogonal slot tables: actor x motive x method x
 * location x trace. Entries are content; the composer is engine. Composer contract: emit a
 * fact-bundle proposal (ground-truth facts) + a surface descriptor (what the table perceives).
 * Never prose." No validation (M1-04) and no cooldowns (M1-05) here — this is composition only.
 */
export type SlotAxis = "actor" | "motive" | "method" | "location" | "trace";

const SLOT_AXES: readonly SlotAxis[] = ["actor", "motive", "method", "location", "trace"];

export type SlotValue = string | number | boolean;

/** A field that resolves to whichever entry was drawn on another axis (e.g. "sameActor"-style refs). */
export interface SlotRef {
  readonly ref: SlotAxis;
}

export type SlotField = SlotValue | SlotRef;

/**
 * One entry in a slot table. `id` is the axis's own resolved value when another axis refs it
 * (picking an entry from a slot table *is* picking that axis's value, per Spec §8.1's slot
 * tables being keyed collections) — factFields/surfaceFields carry any additional structured
 * detail beyond the id itself.
 */
export interface SlotEntry {
  readonly id: string;
  readonly factFields: Readonly<Record<string, SlotField>>;
  readonly surfaceFields: Readonly<Record<string, SlotField>>;
}

export type SlotTables = Readonly<Record<SlotAxis, readonly SlotEntry[]>>;

export interface FactBundleProposal {
  readonly fields: Readonly<Record<string, SlotValue>>;
}

export interface SurfaceDescriptor {
  readonly fields: Readonly<Record<string, SlotValue>>;
}

export interface ComposedSituation {
  readonly chosen: Readonly<Record<SlotAxis, string>>;
  readonly factBundle: FactBundleProposal;
  readonly surface: SurfaceDescriptor;
}

function isSlotRef(value: SlotField): value is SlotRef {
  return typeof value === "object" && value !== null && "ref" in value;
}

/**
 * Deliberately simple heuristic — content authoring is the actual backstop; this only catches
 * the obvious case (Spec §8.1: "never prose"). A multi-word value ending in sentence
 * punctuation, or a value with more words than a short tag would need, reads as a sentence
 * rather than a content tag; a newline never belongs in a tag either.
 */
function looksLikeProse(value: string): boolean {
  if (/\n/.test(value)) {
    return true;
  }
  const words = value.trim().split(/\s+/).filter(Boolean);
  const endsLikeASentence = /[.!?]$/.test(value.trim());
  return (endsLikeASentence && words.length > 1) || words.length > 4;
}

function resolveFields(
  rawFields: Readonly<Record<string, SlotField>>,
  chosenValues: Readonly<Record<SlotAxis, SlotValue>>,
): Record<string, SlotValue> {
  const resolved: Record<string, SlotValue> = {};
  for (const [key, value] of Object.entries(rawFields)) {
    const resolvedValue = isSlotRef(value) ? chosenValues[value.ref] : value;
    if (typeof resolvedValue === "string" && looksLikeProse(resolvedValue)) {
      throw new Error(`slot composer: field "${key}" looks like prose ("${resolvedValue}") — composer output must be structured tags, never prose (Spec §8.1)`);
    }
    resolved[key] = resolvedValue;
  }
  return resolved;
}

export function compose(tables: SlotTables, rng: RngStream): ComposedSituation {
  const chosenEntries: Partial<Record<SlotAxis, SlotEntry>> = {};
  for (const axis of SLOT_AXES) {
    const entries = tables[axis];
    if (entries.length === 0) {
      throw new Error(`slot composer: axis "${axis}" has no entries`);
    }
    chosenEntries[axis] = entries[rng.nextInt(entries.length)]!;
  }

  const chosen = SLOT_AXES.reduce(
    (acc, axis) => ({ ...acc, [axis]: chosenEntries[axis]!.id }),
    {} as Record<SlotAxis, string>,
  );
  const chosenValues: Readonly<Record<SlotAxis, SlotValue>> = chosen;

  const factFields: Record<string, SlotValue> = {};
  const surfaceFields: Record<string, SlotValue> = {};
  for (const axis of SLOT_AXES) {
    Object.assign(factFields, resolveFields(chosenEntries[axis]!.factFields, chosenValues));
    Object.assign(surfaceFields, resolveFields(chosenEntries[axis]!.surfaceFields, chosenValues));
  }

  return { chosen, factBundle: { fields: factFields }, surface: { fields: surfaceFields } };
}
