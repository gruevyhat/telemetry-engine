import type { KindDefinition } from "./registry.js";
import type { FieldSchema, FieldType } from "./schema.js";

/**
 * v0 fact-kind catalog per docs/design/fact-kinds-v0.md §2. That doc gives payload field
 * names and a prose "vis" column but not JS types; field types below are inferred from the
 * field name and the doc's prose (e.g. "tons" -> number, "lotId" -> string) and are an
 * extrapolation to be corrected by a catalog PR if a future task needs otherwise. `implies`
 * edges are catalog metadata for the ambiguity checker (M1-04) and are intentionally not
 * represented here — do-not per M0-02's task card.
 */

function f(type: FieldType, optional = false): FieldSchema {
  return { type, optional };
}

export const KINDS_V0: readonly KindDefinition[] = [
  // system / meta
  { kind: "phase.transition", defaultVisibility: "public", payload: { fromStep: f("string"), toStep: f("string"), frame: f("string", true) } },
  { kind: "clock.tick", defaultVisibility: "referee", payload: { clockId: f("string"), delta: f("number"), cause: f("string", true) } },
  { kind: "check.reported", defaultVisibility: "public", payload: { actor: f("string"), skill: f("string"), dm: f("number"), total: f("number"), difficulty: f("number"), effect: f("number") } },
  { kind: "campaign.seedCommitted", defaultVisibility: "public", payload: { hash: f("string"), scheme: f("string") } },
  {
    kind: "secretRoll.committed",
    defaultVisibility: "public",
    payload: { hash: f("string"), scheme: f("string"), seedCommitmentFactId: f("string") },
  },
  // likelihood corrected from number to string at M1-06: Spec §8.4's ladder is named rungs
  // (certain|likely|even|unlikely|remote), not a raw number -- see fact-kinds-v0.md §4.
  { kind: "oracle.answered", defaultVisibility: "table", payload: { question: f("string"), likelihood: f("string"), answer: f("string"), texture: f("string", true) } },
  { kind: "correction", defaultVisibility: "referee", payload: { supersedes: f("string"), note: f("string") } },
  { kind: "reveal", defaultVisibility: "public", payload: { targets: f("array"), fields: f("array") } },
  { kind: "action.fizzled", defaultVisibility: "referee", payload: { attemptedActionId: f("string"), reason: f("string") } },
  { kind: "degrade.reported", defaultVisibility: "referee", payload: { rung: f("string"), context: f("string") } },
  { kind: "vote.recorded", defaultVisibility: "public", payload: { topic: f("string"), tally: f("object"), captainBreak: f("boolean", true) } },

  // position / access
  {
    kind: "presence.declared",
    defaultVisibility: "table",
    payload: { actor: f("string"), station: f("string", true), hex: f("string", true), day: f("number"), slot: f("string") },
    exactlyOneOf: [["station", "hex"]],
  },
  { kind: "access.granted", defaultVisibility: "referee", payload: { actor: f("string"), codeClass: f("string"), grantor: f("string") } },

  // trade / economy
  { kind: "cargo.loaded", defaultVisibility: "public", payload: { lotId: f("string"), tons: f("number"), manifestId: f("string"), bay: f("string") } },
  { kind: "cargo.unloaded", defaultVisibility: "public", payload: { lotId: f("string"), tons: f("number"), bay: f("string") } },
  { kind: "cargo.diverted", defaultVisibility: "referee", payload: { lotId: f("string"), qty: f("number"), channel: f("string") } },
  { kind: "sale.settled", defaultVisibility: "public", payload: { lotId: f("string"), amount: f("number"), countDelivered: f("number"), buyer: f("string") } },
  { kind: "purchase.settled", defaultVisibility: "public", payload: { lotId: f("string"), amount: f("number"), seller: f("string") } },
  { kind: "market.tick", defaultVisibility: "referee", payload: { hex: f("string"), good: f("string"), price: f("number"), week: f("number") } },
  { kind: "market.trade", defaultVisibility: "public", payload: { hex: f("string"), good: f("string"), qty: f("number"), price: f("number"), actor: f("string") } },
  // Shock input for market.tick's generator (Spec §7.1's shock_t): "event-driven (war, glut,
  // embargo) via world-event facts." Rare, large, narrated -> public. `label` is intended to be
  // one of war|glut|embargo (not yet enum-enforced, same gap as npc.truthTierAssigned's tier).
  { kind: "world.event", defaultVisibility: "public", payload: { hex: f("string"), good: f("string"), magnitude: f("number"), label: f("string"), week: f("number") } },

  // ship operations
  { kind: "lock.cycled", defaultVisibility: "referee", payload: { door: f("string"), codeClass: f("string"), time: f("string") } },
  { kind: "camera.looped", defaultVisibility: "referee", payload: { camera: f("string"), from: f("string"), to: f("string") } },
  { kind: "jump.plotted", defaultVisibility: "public", payload: { fromHex: f("string"), toHex: f("string"), parsecs: f("number"), checkRef: f("string") } },
  { kind: "fuel.consumed", defaultVisibility: "public", payload: { tons: f("number"), refined: f("boolean") } },
  { kind: "maintenance.deferred", defaultVisibility: "public", payload: { system: f("string"), weeksOverdue: f("number") } },
  { kind: "system.failed", defaultVisibility: "table", payload: { system: f("string"), mode: f("string") } },
  { kind: "system.tampered", defaultVisibility: "referee", payload: { system: f("string"), method: f("string") } },

  // social / meta-game
  { kind: "agenda.dealt", defaultVisibility: "referee", payload: { playerId: f("string"), result: f("boolean"), tier: f("string", true) } },
  { kind: "agenda.actionTaken", defaultVisibility: "referee", payload: { playerId: f("string"), actionId: f("string"), frameClaim: f("string", true) } },
  { kind: "envelope.opened", defaultVisibility: "public", payload: { playerId: f("string"), contents: f("unknown") } },
  { kind: "objective.forfeit", defaultVisibility: "public", payload: { playerId: f("string") } },
  { kind: "confrontation.opened", defaultVisibility: "public", payload: { declarer: f("string"), mode: f("string"), target: f("string", true) } },
  { kind: "confrontation.resolved", defaultVisibility: "public", payload: { outcome: f("string"), logNote: f("string") } },
  { kind: "npc.hired", defaultVisibility: "public", payload: { npcId: f("string"), role: f("string"), wage: f("number") } },
  { kind: "npc.statement", defaultVisibility: "table", payload: { npcId: f("string"), topic: f("string") } },
  // Referee-scoped companion to npc.statement (fact-kinds-v0.md §2/§3): the ladder tier links to
  // its statement via the fact-level `causes` field, not a payload field, per the split-visibility
  // rule. Named at the M0 retro; not yet emitted by any shipped content. `tier` is intended to be
  // one of evasion|partial|trueWithTell|true (Spec §12) but FieldSchema has no enum type yet, so
  // any string currently validates.
  { kind: "npc.truthTierAssigned", defaultVisibility: "referee", payload: { tier: f("string") } },
];
