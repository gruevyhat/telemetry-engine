/**
 * Minimal slice of Spec §15's Plugin interface that M1-01's economy needs: the goods list the
 * weekly market tick generator reads for `base(good, worldTraits)` (Spec §7.1), simplified here
 * to a flat basePrice per good — worldTraits modulation is content the plugin doesn't have a
 * shape for yet, so it's left for a future task rather than guessed at.
 *
 * Slices are added incrementally by the task that needs them, never ahead of need. M3-03 adds
 * `./travel.js` and `./character.js`. M3-11 adds `./plugin.js`: `persona`, `dice`, and the
 * composed `Plugin` object that binds every slice to one plugin id.
 */
export * from "./travel.js";
export * from "./character.js";
export * from "./plugin.js";

export interface GoodDef {
  readonly id: string;
  readonly basePrice: number;
}

export interface EconomyPluginApi {
  readonly goods: readonly GoodDef[];
}
