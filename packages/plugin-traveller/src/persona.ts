/**
 * [M3-11, Spec §15] MAGGIE's persona, in the shape the engine's `PersonaDef` declares
 * (`packages/engine/src/plugin-api/plugin.ts`). `Lexicon`'s keys and how many a plugin ships
 * are unspecified anywhere — this is a small, plugin-owned starting set of named phrases for
 * situations this milestone's own modules produce (career-edge use, trust mode), reviewed
 * against `docs/design/maggie-voice.md` rather than mechanically checked: `pnpm lint:content`
 * only schema-validates `content/frames`/`content/decks` JSON, never `.ts` source strings (the
 * same gap already logged on M3-10). Every string below follows maggie-voice.md §2-3: fact
 * first, flat declarative, no exclamation points, no markup, none of §6's hard-never words.
 */

import type { Lexicon, PersonaDef } from "@telemetry/engine";

export const lexicon: Lexicon = {
  edgeUsed: "Edge used. Logged.",
  edgeAlreadyUsed: "That edge is already spent this campaign.",
  edgeDeferred: "That edge has no system behind it yet. Declared, not active.",
  trustMode: "This sector isn't in my charts. I verify arithmetic; I do not verify distance.",
  charted: "Sector loaded. Distance is real, not counted.",
};

export const persona: PersonaDef = {
  name: "MAGGIE",
  epigraphStyle: "maggie",
  lexicon,
};
