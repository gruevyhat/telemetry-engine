import { describe, expect, it } from "vitest";
import { derive } from "../ledger/derive.js";
import type { Fact } from "../ledger/types.js";
import { IMPLIES_V0 } from "../validate/closure.js";
import { presenceProjection } from "../position/index.js";
import { consistentWorlds } from "./bot.js";

const T = { day: 14, slot: "DOCKSIDE" as const };
const ROSTER = ["pc:zhan", "pc:brennan", "pc:deuce", "npc:duty-officer", "npc:backup-officer"];

let nextId = 0;
function fact(kind: string, actorId: string, payload: Record<string, unknown>): Fact {
  nextId += 1;
  return {
    id: `f${nextId}`,
    wall: 0,
    t: T,
    kind,
    actor: { kind: actorId.startsWith("npc:") ? "npc" : "pc", id: actorId },
    payload,
    visibility: { level: "referee" },
  };
}

describe("consistentWorlds — the inference bot's roster enumeration [fact-kinds-v0.md §3, Spec §21.2 INV-5/10]", () => {
  it("(visible facts ∪ implies closure ∪ position model): a lock.cycled cause fact, with two roster members sharing its codeClass, keeps both as consistent worlds", () => {
    const causeFact = fact("lock.cycled", "npc:duty-officer", { door: "cargo-hold-door", codeClass: "SHARED-OVR", time: "0300" });
    const grants = [fact("access.granted", "npc:duty-officer", { actor: "npc:duty-officer", codeClass: "SHARED-OVR", grantor: "referee" }), fact("access.granted", "npc:backup-officer", { actor: "npc:backup-officer", codeClass: "SHARED-OVR", grantor: "referee" })];
    const worlds = consistentWorlds(causeFact, ROSTER, [causeFact, ...grants], IMPLIES_V0["lock.cycled"]);
    expect(worlds.size).toBeGreaterThanOrEqual(2);
    expect(worlds.has("npc:duty-officer")).toBe(true);
    expect(worlds.has("npc:backup-officer")).toBe(true);
  });

  it("position model rules out a roster member declared off-ship at the cause's time, even if they'd otherwise be a candidate", () => {
    const causeFact = fact("lock.cycled", "npc:duty-officer", { door: "cargo-hold-door", codeClass: "SHARED-OVR", time: "0300" });
    const grants = [fact("access.granted", "npc:duty-officer", { actor: "npc:duty-officer", codeClass: "SHARED-OVR", grantor: "referee" }), fact("access.granted", "npc:backup-officer", { actor: "npc:backup-officer", codeClass: "SHARED-OVR", grantor: "referee" })];
    const offShip = fact("presence.declared", "npc:backup-officer", { actor: "npc:backup-officer", hex: "Vantage", day: T.day, slot: T.slot });
    const worlds = consistentWorlds(causeFact, ROSTER, [causeFact, ...grants, offShip], IMPLIES_V0["lock.cycled"]);
    expect(worlds.has("npc:backup-officer")).toBe(false);
    expect(worlds.has("npc:duty-officer")).toBe(true);
  });

  it("a cause-fact kind with no implies rule imposes no implies constraint -- the whole (position-filtered) roster stays consistent", () => {
    const causeFact = fact("system.failed", "npc:duty-officer", { system: "hold-power-bus", mode: "breaker-trip" });
    const worlds = consistentWorlds(causeFact, ROSTER, [causeFact], IMPLIES_V0["system.failed"]);
    expect(worlds.size).toBe(ROSTER.length);
  });

  it("zero tolerance: a cause-fact kind whose implies clause is entirely sameActor-correlated (camera.looped) enumerates zero consistent actors from its own facts alone -- a real INV-10 violation, not a measurement gap", () => {
    const causeFact = fact("camera.looped", "npc:duty-officer", { camera: "aft-bay-cam", from: "0330", to: "0335" });
    const worlds = consistentWorlds(causeFact, ROSTER, [causeFact], IMPLIES_V0["camera.looped"]);
    expect(worlds.size).toBe(0);
  });
});
