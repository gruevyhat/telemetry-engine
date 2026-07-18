/**
 * Minimal slice of Spec §15's Plugin interface that M1-01's economy needs: the goods list the
 * weekly market tick generator reads for `base(good, worldTraits)` (Spec §7.1), simplified here
 * to a flat basePrice per good — worldTraits modulation is content the plugin doesn't have a
 * shape for yet, so it's left for a future task rather than guessed at. The rest of Plugin
 * (persona, dice, characterSchema, careerEdges, travel) is out of scope here; each slice is
 * added incrementally by the task that needs it, not built ahead of need.
 */
export interface GoodDef {
  readonly id: string;
  readonly basePrice: number;
}

export interface EconomyPluginApi {
  readonly goods: readonly GoodDef[];
}
