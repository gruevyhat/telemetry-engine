export * from "./hex.js";
export * from "./travel.js";
export * from "./sec.js";
export * from "./sector.js";
export * from "./character.js";
export * from "./edges.js";
export * from "./persona.js";
export * from "./dice.js";

/**
 * [M3-11, Spec §1, §15] The real `Plugin` object — assembly only, no new behavior: every field
 * either re-exports an already-tested module (hex/travel/sec/sector/character/edges) or wires
 * in this card's own persona/dice/economy/schema, none of which existed before this card.
 *
 * `@telemetry/engine` is a real dependency of this package as of this card — a reconsideration
 * of the M3-01/06/07/09 precedent, logged in PROJECT.md: those cards avoided the dependency
 * because their own narrow modules (Hex, Ship, CrewMember, EdgeDef) didn't need engine types.
 * This card's entire job is producing an object the engine's own `Plugin` interface describes,
 * and `@telemetry/plugin-stub` already depends on `@telemetry/engine` for exactly this reason
 * (`build:stub`'s own stand-in Plugin). INV-1 is one-directional — the engine never imports a
 * plugin — so this does not touch that invariant; `pnpm build:stub` proves the engine still
 * compiles with this whole package absent.
 */
import type { AttributeDef, CharacterSchema, Plugin } from "@telemetry/engine";
import { careerEdges } from "./edges.js";
import { importCharacter } from "./character.js";
import { travellerTravel } from "./travel.js";
import { persona } from "./persona.js";
import { convention, check } from "./dice.js";

const ATTRIBUTES: readonly AttributeDef[] = [
  { id: "str", label: "Strength", min: 0, max: 15 },
  { id: "dex", label: "Dexterity", min: 0, max: 15 },
  { id: "end_stat", label: "Endurance", min: 0, max: 15 },
  { id: "int_stat", label: "Intellect", min: 0, max: 15 },
  { id: "edu", label: "Education", min: 0, max: 15 },
  { id: "soc", label: "Social Standing", min: 0, max: 15 },
  { id: "chr", label: "Charisma", min: 0, max: 15 },
  { id: "mor", label: "Morale", min: 0, max: 15 },
  { id: "lck", label: "Luck", min: 0, max: 15 },
];

// Fair-use hygiene: career terms already named elsewhere in this repo's docs (rulebook §13.2),
// not transcribed from any Mongoose table. "Negotiated" is the fallback bucket (edges.ts),
// never a travtools career, so it is deliberately absent here.
const CAREER_IDS = ["Merchant", "Scout", "Agent", "Army", "Marines", "Noble", "Rogue"] as const;

const characterSchema: CharacterSchema = {
  attributes: ATTRIBUTES,
  skillIds: ["Broker", "Admin", "Astrogation", "Persuade", "Intimidate", "Pilot", "Gunner", "Mechanic", "Steward", "Recon"],
  careerIds: CAREER_IDS,
};

export const travellerPlugin: Plugin = {
  id: "traveller",
  persona,
  dice: { convention, check },
  characterSchema,
  importCharacter,
  careerEdges,
  // Original, generic trade-good entries (Spec §15 fair-use hygiene) — no rulebook table prose.
  economy: {
    currency: "credits",
    goods: [
      { id: "general-cargo", basePrice: 100 },
      { id: "machine-parts", basePrice: 250 },
    ],
  },
  travel: travellerTravel,
};
