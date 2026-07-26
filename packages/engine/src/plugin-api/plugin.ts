import type { StyleRef } from "../render/renderer.js";
import type { CharacterSchema, EdgeDef } from "./character.js";
import type { GoodDef } from "./index.js";
import type { TravelModel } from "./travel.js";

/**
 * [Spec §15] The persona/dice slices of the Plugin interface, plus the composed `Plugin` object
 * itself — none of this existed before M3-11 (`plugin-api/index.ts`'s own comment named this
 * card as the one that adds it). INV-1 boundary: no setting-specific vocabulary appears here,
 * same rule as `character.ts`/`travel.ts` — `scripts/build-stub.mjs` scans this directory for
 * the Traveller package's name as a raw string, comments included, so keep prose generic.
 */

/** A flat term → phrase map. Spec §15 references `Lexicon` on `Plugin.persona` but never
 * defines its shape; the simplest thing that could work — a plugin supplies whatever named
 * phrases its persona voice needs, the engine never inspects a specific key. */
export type Lexicon = Readonly<Record<string, string>>;

export interface PersonaDef {
  readonly name: string;
  readonly epigraphStyle: StyleRef;
  readonly lexicon: Lexicon;
}

/** Opaque, like `StyleRef` (`render/renderer.ts`) — Spec §15 references `DiceConvention` but
 * never defines it. Treated as an identifying label a plugin's `dice.check` implementation
 * assigns meaning to internally; the engine never branches on its value. */
export type DiceConvention = string;

export interface DiceCheckInput {
  /** Skill label, carried through for the record — the engine's own `effect = total -
   * difficulty` math (`phases/interpreter.ts`'s `reportCheck`) never uses it. */
  readonly skill: string;
  /** Combined characteristic + skill-level modifier, per the standard convention. */
  readonly dm: number;
  readonly difficulty: number;
  /** The player's reported raw dice result (e.g. 2-12 on 2d6) — not yet combined with `dm`.
   * "Player dice are physical; results enter as check.reported facts" (Spec §6): this is the
   * one input a plugin cannot derive itself. */
  readonly rawRoll: number;
}

export interface CheckResult {
  /** `rawRoll + dm` — exactly what a caller would then report as `CheckReportInput.total`
   * (`phases/interpreter.ts`), so a plugin's `dice.check` and the engine's own check-reporting
   * path never disagree about what "total" means. */
  readonly total: number;
  readonly effect: number;
  readonly outcome: "success" | "failure";
  /** Set only on a natural extreme roll (the standard 2d6 convention's automatic success/failure
   * override), independent of `effect`. */
  readonly critical: "success" | "failure" | undefined;
}

/**
 * [Spec §15] The full Plugin interface. `importCharacter` returns `CharacterImportResult`
 * (a result union), not the bare `CrewMember` Spec §15's pseudocode shows — logged as a
 * deliberate divergence in PROJECT.md: M3-07 already built the result-union API for good
 * reason (raw import data is untrusted input; a thrown exception or a silently-any value is
 * worse), and this card's own acceptance criterion is that assembly "adds no behavior of its
 * own," which rules out wrapping it in something that throws instead.
 */
export interface Plugin {
  readonly id: string;
  readonly persona: PersonaDef;
  readonly dice: {
    readonly convention: DiceConvention;
    check(input: DiceCheckInput): CheckResult;
  };
  readonly characterSchema: CharacterSchema;
  importCharacter(raw: unknown): unknown;
  readonly careerEdges: Readonly<Record<string, EdgeDef>>;
  readonly economy: {
    readonly currency: string;
    readonly goods: readonly GoodDef[];
  };
  readonly travel: TravelModel;
}
