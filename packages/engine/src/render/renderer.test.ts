import { describe, expect, it } from "vitest";
import type { Fact } from "../ledger/types.js";
import { type BeatType, type FactBundle, type RenderedText, createTemplateRenderer } from "./renderer.js";

const T = { day: 14, slot: "DOCKSIDE" as const };
const WORLD = { kind: "world", id: "world" } as const;

let nextId = 0;
function fact(kind: string, payload: Record<string, unknown>): Fact {
  nextId += 1;
  return { id: `f${nextId}`, wall: 0, t: T, kind, actor: WORLD, payload, visibility: { level: "public" } };
}

/** [demo fixture] mirrors content/frames/demo's own beats (dockside, transit, arrival). */
const DEMO_FACTS: readonly Fact[] = [
  fact("presence.declared", { actor: "pc:zhan", hex: "Vantage", day: 14, slot: "DOCKSIDE" }),
  fact("check.reported", { actor: "pc:zhan", skill: "Admin", dm: 1, total: 9, difficulty: 8, effect: 1 }),
  fact("reveal", { targets: ["f1"], fields: ["door", "codeClass", "time"] }),
  fact("world.event", { hex: "Vantage", good: "machine-parts", magnitude: 2, label: "A sensor ghost aft of the drive bay", week: 4 }),
  fact("confrontation.opened", { declarer: "pc:zhan", mode: "accusation", target: "npc:kessler" }),
  fact("degrade.reported", { rung: "1", context: "Comms window ran long" }),
];

/** [trade fixture] mirrors the economy's own fact kinds (market ticks, cargo). */
const TRADE_FACTS: readonly Fact[] = [
  fact("presence.declared", { actor: "pc:deuce", hex: "Regina", day: 21, slot: "DOCKSIDE" }),
  fact("check.reported", { actor: "pc:deuce", skill: "Broker", dm: 2, total: 11, difficulty: 8, effect: 3 }),
  fact("reveal", { targets: ["f2"], fields: ["lotId", "channel"] }),
  fact("world.event", { hex: "Regina", good: "spice", magnitude: 4, label: "Reach Consolidated disputes the manifest count", week: 3 }),
  fact("confrontation.opened", { declarer: "pc:deuce", mode: "dispute" }),
  fact("degrade.reported", { rung: "2", context: "The oracle answered without texture" }),
];

const ALL_BEATS: readonly BeatType[] = [
  "announceDockside",
  "checkRequest",
  "evidenceResult",
  "transitEvent",
  "incidentSurface",
  "confrontationOpen",
  "obligationQuip",
  "degradeLine",
  "blackBoxPreamble",
];

function bundleFor(beat: BeatType, facts: readonly Fact[]): FactBundle {
  if (beat === "incidentSurface") {
    return { surface: { actor: "npc:kessler", motive: "revenge", method: "cargo-diversion" } };
  }
  if (beat === "obligationQuip" || beat === "blackBoxPreamble") {
    return {};
  }
  return { facts };
}

describe("createTemplateRenderer — the template backend [Spec §14]", () => {
  const renderer = createTemplateRenderer();

  it.each(ALL_BEATS)("renders %s from the demo fixture (snapshot)", async (beat) => {
    const result = await renderer.render(beat, bundleFor(beat, DEMO_FACTS), "maggie");
    expect(result.text).toMatchSnapshot();
  });

  it.each(ALL_BEATS)("renders %s from the trade fixture (snapshot)", async (beat) => {
    const result = await renderer.render(beat, bundleFor(beat, TRADE_FACTS), "maggie");
    expect(result.text).toMatchSnapshot();
  });

  it("never invents: a beat whose backing fact is absent throws rather than fabricating text", async () => {
    await expect(renderer.render("announceDockside", {}, "maggie")).rejects.toThrow(/requires a "presence.declared" fact/);
  });

  it("obligationQuip and blackBoxPreamble refuse a non-empty bundle rather than silently ignoring it", async () => {
    await expect(renderer.render("obligationQuip", { facts: DEMO_FACTS }, "maggie")).rejects.toThrow(/empty bundle/);
    await expect(renderer.render("blackBoxPreamble", { facts: DEMO_FACTS }, "maggie")).rejects.toThrow(/empty bundle/);
  });

  it("lint: every rendered beat is TTS-safe (mirrors content-lint's unsafe/banned regexes)", async () => {
    const unsafe = /!|…|\.\.\.|<[^>]+>|[*_#`]/;
    const banned = /\b(unfortunately|sadly|amazing|just)\b/i;
    for (const beat of ALL_BEATS) {
      for (const facts of [DEMO_FACTS, TRADE_FACTS]) {
        const result = await renderer.render(beat, bundleFor(beat, facts), "maggie");
        expect(unsafe.test(result.text)).toBe(false);
        expect(banned.test(result.text)).toBe(false);
      }
    }
  });
});

describe("RenderedText — terminal [INV-12]", () => {
  it("type-level: a genuine render() result satisfies RenderedText", async () => {
    const renderer = createTemplateRenderer();
    const result: RenderedText = await renderer.render("degradeLine", {}, "maggie");
    expect(typeof result.text).toBe("string");
  });

  it("type-level: an external object literal cannot satisfy RenderedText (proves it's a sink, not constructible from a bare string elsewhere)", () => {
    // @ts-expect-error — { text: string } alone lacks the module-private brand; only this
    // module's render() can produce a value that actually satisfies RenderedText.
    const fake: RenderedText = { text: "not really rendered" };
    expect(fake.text).toBe("not really rendered");
  });
});
