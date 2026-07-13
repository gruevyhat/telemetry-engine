import type { Fact } from "../ledger/types.js";
import { ensureSentence, humanize, indefiniteArticle, joinList, properName } from "./grammar.js";

/**
 * [Spec §14, docs/design/maggie-voice.md §4 "Canonical lines by beat"] The nine reference
 * categories the voice bible enumerates. The bible calls these "the reference set — imitate
 * these," so the templates below are original lines written to the same rules, not verbatim
 * copies of the bible's examples (those examples are frame-specific authored copy; a generic
 * template can't reproduce their exact content fields, e.g. berthing price, without a content
 * source that doesn't exist yet).
 */
export type BeatType =
  | "announceDockside"
  | "checkRequest"
  | "evidenceResult"
  | "transitEvent"
  | "incidentSurface"
  | "confrontationOpen"
  | "obligationQuip"
  | "degradeLine"
  | "blackBoxPreamble";

/**
 * [extrapolation] Spec §14's pseudocode types `facts: FactBundle` without defining the type
 * anywhere; elsewhere (§16) "fact bundle" means a set of committed Facts, but the "generate" step
 * (M1-05) already produces presentation-only surface fields (SlotComposer's SurfaceDescriptor)
 * that are deliberately never committed as facts (INV-12: nothing not in the fact bundle may be
 * said). A renderer needs to speak from both sources without ever inventing a third one, so
 * FactBundle is modeled as the union of what's actually groundable: real ledger facts, and/or an
 * uncommitted surface descriptor from the same turn's generation step.
 */
export interface FactBundle {
  readonly facts?: readonly Fact[];
  readonly surface?: Readonly<Record<string, string | number | boolean>>;
}

/**
 * [extrapolation] Spec §15's Plugin.persona.epigraphStyle: StyleRef is referenced but never
 * defined, and Plugin.persona itself has no shape yet in plugin-api (no task has introduced it).
 * Treated as an opaque style identifier; "maggie" is the only value any v1 content ships.
 */
export type StyleRef = string;

const RENDERED_TEXT_BRAND: unique symbol = Symbol("RenderedText");

/**
 * [INV-12: "Rendered text is presentation only — never parsed back into facts"] Branded so that
 * no code outside this module can construct one directly (an object literal `{ text: "x" }`
 * fails to satisfy the brand at the type level — see renderer.test.ts's type-level check). The
 * only way to obtain a RenderedText is to call a Renderer's render(); nothing in the engine's
 * public API accepts a RenderedText as a parameter, keeping it a sink, never a source.
 */
export interface RenderedText {
  readonly [RENDERED_TEXT_BRAND]: true;
  readonly text: string;
}

function rendered(text: string): RenderedText {
  return { [RENDERED_TEXT_BRAND]: true, text };
}

/** [Spec §14] `interface Renderer { render(beat, facts, style): Promise<RenderedText>; }` —
 * async because the (future, M5, flagged) LLM backend genuinely needs a network round trip; the
 * template backend below is synchronous work wrapped in an already-resolved Promise. */
export interface Renderer {
  render(beat: BeatType, facts: FactBundle, style: StyleRef): Promise<RenderedText>;
}

function latestOfKind(facts: readonly Fact[] | undefined, kind: string): Fact | undefined {
  const matches = (facts ?? []).filter((fact) => fact.kind === kind);
  return matches[matches.length - 1];
}

function requireFact(facts: readonly Fact[] | undefined, kind: string, beat: BeatType): Fact {
  const fact = latestOfKind(facts, kind);
  if (!fact) {
    throw new Error(`renderer: beat "${beat}" requires a "${kind}" fact in the bundle, none present`);
  }
  return fact;
}

function announceDockside(bundle: FactBundle): string {
  const fact = requireFact(bundle.facts, "presence.declared", "announceDockside");
  return ensureSentence(`Dockside at ${fact.payload.hex}, day ${fact.payload.day}. Comms and the market feed are both live`);
}

function checkRequest(bundle: FactBundle): string {
  const fact = requireFact(bundle.facts, "check.reported", "checkRequest");
  const skill = String(fact.payload.skill);
  return ensureSentence(
    `That is ${indefiniteArticle(skill)} ${skill} check, difficulty ${fact.payload.difficulty}. Roll when ready. I will do the regretting`,
  );
}

function evidenceResult(bundle: FactBundle): string {
  const fact = requireFact(bundle.facts, "reveal", "evidenceResult");
  // Field names are camelCase content keys (e.g. "codeClass") -- not something MAGGIE would say
  // as written; humanize() splits them into plain spoken words (maggie-voice.md §7).
  const fields = (fact.payload.fields as string[]).map((field) => humanize(field));
  return ensureSentence(`Confirmed: ${joinList(fields)}. I record. I do not interpret`);
}

function transitEvent(bundle: FactBundle): string {
  const fact = requireFact(bundle.facts, "world.event", "transitEvent");
  return ensureSentence(`${ensureSentence(String(fact.payload.label))} Logged at ${fact.payload.hex}, week ${fact.payload.week}`);
}

/** [Spec §8.1] The slot composer's five fixed axes get a fixed, readable order; any other
 * surface field (a future axis, or content-specific extra data) falls back to a generic
 * "key value" pairing so the template still says something rather than dropping data. */
const KNOWN_SURFACE_AXES = ["actor", "motive", "method", "location", "trace"] as const;

function incidentSurface(bundle: FactBundle): string {
  const fields = bundle.surface;
  if (!fields || Object.keys(fields).length === 0) {
    throw new Error('renderer: beat "incidentSurface" requires a non-empty surface descriptor, none present');
  }
  const parts: string[] = [];
  for (const axis of KNOWN_SURFACE_AXES) {
    const value = fields[axis];
    if (value === undefined) {
      continue;
    }
    // The actor slot is a proper noun (who); the rest are descriptive words (what/how/where).
    parts.push(axis === "actor" ? properName(String(value)) : `${axis} ${humanize(String(value))}`);
  }
  for (const [key, value] of Object.entries(fields)) {
    if ((KNOWN_SURFACE_AXES as readonly string[]).includes(key)) {
      continue;
    }
    parts.push(`${humanize(key)} ${humanize(String(value))}`);
  }
  return ensureSentence(`New complication: ${joinList(parts)}`);
}

function confrontationOpen(bundle: FactBundle): string {
  const fact = requireFact(bundle.facts, "confrontation.opened", "confrontationOpen");
  // declarer/target are ActorRef ids (e.g. "pc:zhan") -- see the humanize/properName doc comment
  // in grammar.ts on why these can't be spoken as written.
  const declarer = properName(String(fact.payload.declarer));
  const mode = humanize(String(fact.payload.mode));
  const target = fact.payload.target ? ` targeting ${properName(String(fact.payload.target))}` : "";
  return ensureSentence(
    `Confrontation opened by ${declarer}: ${mode}${target}. Five minutes on the clock. Everything said next is logged`,
  );
}

/**
 * [extrapolation] No obligation/debt fact kind exists in kinds-v0.ts yet (M1's economy work
 * covers goods pricing, not loan/debt tracking) — there is nothing groundable to require here.
 * Treated the same way as blackBoxPreamble: a fixed voice line that requires an empty bundle
 * rather than inventing a fact contract this milestone hasn't designed. Revisit once an
 * obligation fact kind lands (fact-kinds-v0.md catalog PR first, per CLAUDE.md).
 */
function obligationQuip(bundle: FactBundle): string {
  if ((bundle.facts?.length ?? 0) > 0 || bundle.surface) {
    throw new Error('renderer: beat "obligationQuip" has no backing fact kind yet; call it with an empty bundle');
  }
  return "Payment comes due on schedule. The bank sends its regards. It always does; it is automated.";
}

function degradeLine(bundle: FactBundle): string {
  const fact = latestOfKind(bundle.facts, "degrade.reported");
  if (!fact) {
    return "Nothing to report. Enjoy it; it is rented.";
  }
  return ensureSentence(`Degradation at rung ${fact.payload.rung}: ${fact.payload.context}`);
}

function blackBoxPreamble(bundle: FactBundle): string {
  if ((bundle.facts?.length ?? 0) > 0 || bundle.surface) {
    throw new Error('renderer: beat "blackBoxPreamble" is fixed boilerplate; call it with an empty bundle');
  }
  return "This is the record. It is complete, timestamped, and done being patient.";
}

const TEMPLATES: Readonly<Record<BeatType, (bundle: FactBundle) => string>> = {
  announceDockside,
  checkRequest,
  evidenceResult,
  transitEvent,
  incidentSurface,
  confrontationOpen,
  obligationQuip,
  degradeLine,
  blackBoxPreamble,
};

/**
 * [Spec §14 "Template backend (canonical): deterministic, snapshot-tested, complete"] The only
 * backend this milestone ships — no LLM backend until M5 (CLAUDE.md do-not).
 */
export function createTemplateRenderer(): Renderer {
  return {
    async render(beat: BeatType, facts: FactBundle, _style: StyleRef): Promise<RenderedText> {
      return rendered(TEMPLATES[beat](facts));
    },
  };
}
