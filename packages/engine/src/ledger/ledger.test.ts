import { describe, expect, it } from "vitest";
import { createKindRegistry } from "./registry.js";
import { KINDS_V0 } from "./kinds-v0.js";
import { createLedger } from "./ledger.js";
import type { GameTime } from "../time/index.js";

const T: GameTime = { day: 1, slot: "DOCKSIDE" };
const ZHAN = { kind: "pc", id: "pc:zhan" } as const;
const REFEREE = { kind: "referee", id: "referee" } as const;

function loadedInput(overrides: Partial<{ lotId: string; tons: number }> = {}) {
  return {
    t: T,
    kind: "cargo.loaded",
    actor: ZHAN,
    payload: { lotId: overrides.lotId ?? "L1", tons: overrides.tons ?? 20, manifestId: "M1", bay: "DOCK" },
  };
}

describe("ledger append-only [INV-2]", () => {
  it("has no API that mutates or removes: all() returns a fresh snapshot each call", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const before = ledger.all();
    ledger.append(loadedInput());
    expect(before).toHaveLength(0);
    expect(ledger.all()).toHaveLength(1);

    const snapshot = ledger.all();
    (snapshot as unknown[]).push({ intrusion: true });
    expect(ledger.all()).toHaveLength(1);
  });

  it("throws on an unregistered kind rather than appending it", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    expect(() => ledger.append({ t: T, kind: "made.up.kind", actor: ZHAN, payload: {} })).toThrow();
    expect(ledger.all()).toHaveLength(0);
  });

  it("throws on a malformed payload rather than appending it", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    expect(() => ledger.append({ t: T, kind: "cargo.loaded", actor: ZHAN, payload: { lotId: "L1" } })).toThrow();
    expect(ledger.all()).toHaveLength(0);
  });

  it("a correction fact supersedes its target in activeFacts() but never removes it from all()", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const original = ledger.append(loadedInput());
    const correction = ledger.append({
      t: T,
      kind: "correction",
      actor: REFEREE,
      payload: { supersedes: original.id, note: "wrong lot id" },
    });

    expect(ledger.all().map((f) => f.id)).toEqual([original.id, correction.id]);
    expect(ledger.activeFacts().map((f) => f.id)).toEqual([correction.id]);
  });
});

describe("ledger.appendAll [INV-11: evidence cost and result are atomic]", () => {
  it("appends every input in order when all are valid", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const facts = ledger.appendAll([
      loadedInput({ lotId: "L1" }),
      { t: T, kind: "clock.tick", actor: REFEREE, payload: { clockId: "obligation", delta: -1 } },
    ]);
    expect(facts.map((f) => f.kind)).toEqual(["cargo.loaded", "clock.tick"]);
    expect(ledger.all()).toHaveLength(2);
  });

  it("throws before appending anything if any input in the batch is invalid (real ledger, no mock)", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const validReveal = { t: T, kind: "reveal", actor: REFEREE, payload: { targets: ["f1"], fields: ["door"] } };
    const invalidTick = { t: T, kind: "clock.tick", actor: REFEREE, payload: { clockId: "obligation" /* missing delta */ } };

    expect(() => ledger.appendAll([validReveal, invalidTick])).toThrow();
    // The whole batch is rejected -- the valid reveal fact must not have landed either.
    expect(ledger.all()).toHaveLength(0);
  });
});

describe("ledger visibility-filtered views", () => {
  it("filters facts by viewer scope", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const pub = ledger.append(loadedInput());
    const secret = ledger.append({
      t: T,
      kind: "cargo.diverted",
      actor: REFEREE,
      payload: { lotId: "L1", qty: 2, channel: "fence" },
    });

    expect(ledger.visibleTo({ scope: "public" }).map((f) => f.id)).toEqual([pub.id]);
    expect(ledger.visibleTo({ scope: "referee" }).map((f) => f.id).sort()).toEqual([pub.id, secret.id].sort());
    expect(ledger.visibleTo({ scope: "private", playerId: "pc:zhan" }).map((f) => f.id)).toEqual([pub.id]);
  });
});
