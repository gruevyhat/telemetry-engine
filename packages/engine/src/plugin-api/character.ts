/**
 * [Spec §15] The character slice of the Plugin interface: what the engine needs to hold a crew
 * member, and what the plugin must describe so the UI can offer manual entry.
 *
 * INV-1 boundary: no Traveller vocabulary appears here. travtools' UPP stats (`str`, `dex`,
 * `end_stat`, `soc`, …) and its named skill list are *plugin* knowledge; the engine sees generic
 * `Record<string, number>` maps and a plugin-supplied field catalog. The Traveller plugin (M3-07)
 * maps one onto the other.
 *
 * Note for future editors: `scripts/build-stub.mjs` enforces INV-1 by scanning this directory for
 * that package's name as a raw string, comments included — hence the prose spelling here. The
 * bluntness is the point; do not loosen the guard to accommodate a comment.
 */

/**
 * A crew member as engine code sees one. The identifying fields match the `crew.imported` payload
 * in `docs/design/fact-kinds-v0.md` on purpose — the fact is the ledger's record of this object.
 */
export interface CrewMember {
  readonly crewMemberId: string;
  readonly name: string;
  /** Career id, keying into `careerEdges`. Absent for a character entered without one. */
  readonly career: string | undefined;
  /**
   * Hash of the imported source payload, and the idempotence identity: re-importing the same
   * character must not post its benefits twice (M3-08).
   */
  readonly sourceHash: string;
  /** Plugin-defined attribute values, keyed by `AttributeDef.id`. */
  readonly attributes: Readonly<Record<string, number>>;
  /** Plugin-defined skill levels, keyed by skill id. Absent key means untrained. */
  readonly skills: Readonly<Record<string, number>>;
}

/** One entry-form field the plugin asks the UI to collect. */
export interface AttributeDef {
  readonly id: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
}

/**
 * What the plugin tells the engine about character shape, so manual entry ("on paper in 1981",
 * rulebook §13) is a first-class path rather than a degraded import.
 */
export interface CharacterSchema {
  readonly attributes: readonly AttributeDef[];
  /** Skill ids the plugin recognises. Manual entry offers these; import validates against them. */
  readonly skillIds: readonly string[];
  /** Career ids the plugin recognises, keying `careerEdges`. */
  readonly careerIds: readonly string[];
}

/**
 * A career's pillar edge, usable once per session (rulebook §13.2).
 *
 * [travel-and-import-v1 §1.4] Every career's edge is declared, but only those whose target system
 * exists are `available`. Scout needs M4's exploration, Agent and Army/Marine need M5's — those
 * are declared `deferred` with the milestone that unblocks them. Complete data, zero faked
 * mechanics; a `deferred` edge is never offered to a player.
 */
export interface EdgeDef {
  readonly id: string;
  readonly career: string;
  readonly label: string;
  readonly availability: "available" | "deferred";
  /** Milestone id that will make a `deferred` edge available. Absent when `available`. */
  readonly deferredUntil: string | undefined;
}
