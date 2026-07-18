import type { Fact } from "../ledger/types.js";
import type { Disposition } from "./policy.js";

/** [fact-kinds-v0.md §2] Intended values for npc.truthTierAssigned's `tier` — not yet
 * enum-enforced by the registry (FieldSchema has no enum type as of M0). */
export type TruthTier = "evasion" | "partial" | "trueWithTell" | "true";

/** [Spec §12] "Persuade/Intimidate check; Effect maps to a truthfulness ladder (evasion ->
 * partial -> true-with-tell -> true)." Exact bands per sim-bot-policies.md §2: "E<0 evasion ·
 * 0-1 partial (true facts, material omission) · 2-3 true-with-tell (append one tells[] string) ·
 * 4+ true." */
export function truthTierFor(effect: number): TruthTier {
  if (effect < 0) {
    return "evasion";
  }
  if (effect <= 1) {
    return "partial";
  }
  if (effect <= 3) {
    return "trueWithTell";
  }
  return "true";
}

/**
 * [Spec §12] An NPC answering truthfully from what actually happened to it needs its own facts
 * regardless of their visibility level — this is self-knowledge, not the forbidden peek at
 * another actor's hidden facts that createActorView's peekFullLedger() guards against (INV-13
 * constrains reading *other* actors' scoped facts, not an actor's own).
 */
export function factsOwnedBy(allFacts: readonly Fact[], npcId: string): readonly Fact[] {
  return allFacts.filter((fact) => fact.actor.id === npcId);
}

/** [Spec §12] "{competencies, disposition, tells[], agenda?}" — a minimal v0 loader; the full
 * content schema (competencies, agenda) belongs to a content-format task, not this one. */
export interface NpcDef {
  readonly id: string;
  readonly disposition: Disposition;
  readonly tells: readonly string[];
}

export function loadNpcDef(raw: unknown): NpcDef {
  const candidate = raw as Partial<NpcDef> | null;
  if (!candidate || typeof candidate.id !== "string" || typeof candidate.disposition !== "string" || !Array.isArray(candidate.tells)) {
    throw new Error(`invalid NPC def: expected {id, disposition, tells[]}, got ${JSON.stringify(raw)}`);
  }
  return { id: candidate.id, disposition: candidate.disposition, tells: candidate.tells };
}

export interface InterrogationAnswer {
  readonly npcId: string;
  readonly topic: string;
  readonly tier: TruthTier;
  readonly visibleFactIds: readonly string[];
  readonly tell?: string;
}

/**
 * [Spec §12, sim-bot-policies.md §2 interrogation] "Content of answers: template over the NPC's
 * visible-to-self facts; never invents (oracle supplies texture only, ledger-vetoed)." This only
 * *selects* among facts that already exist in `ownFacts` — it never fabricates content. Answer
 * text itself is M1-09's renderer's job; this assembles the structure the renderer would consume
 * (which facts, which tier, which tell).
 */
export function assembleInterrogationAnswer(npc: NpcDef, topic: string, ownFacts: readonly Fact[], effect: number): InterrogationAnswer {
  const tier = truthTierFor(effect);

  let visible: readonly Fact[];
  switch (tier) {
    case "evasion":
      visible = [];
      break;
    case "partial":
      // "material omission": withholds at least one fact, favoring the most recent as the
      // omitted one (the freshest fact is the most likely to still be inconvenient).
      visible = ownFacts.slice(0, Math.max(0, ownFacts.length - 1));
      break;
    case "trueWithTell":
    case "true":
      visible = ownFacts;
      break;
  }

  const tell = tier === "trueWithTell" ? npc.tells[0] : undefined;
  return {
    npcId: npc.id,
    topic,
    tier,
    visibleFactIds: visible.map((fact) => fact.id),
    ...(tell !== undefined ? { tell } : {}),
  };
}
