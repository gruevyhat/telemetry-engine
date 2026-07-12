import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { clocksProjection } from "../clocks/index.js";
import { fundsProjection } from "../economy/funds.js";
import { presenceProjection } from "../position/index.js";
import { combineProjections, createMemoizedProjection, derive, type Projection } from "./derive.js";
import { createKindRegistry } from "./registry.js";
import { KINDS_V0 } from "./kinds-v0.js";
import { createLedger } from "./ledger.js";
import type { GameTime } from "../time/index.js";

const T: GameTime = { day: 1, slot: "DOCKSIDE" };
const REFEREE = { kind: "referee", id: "referee" } as const;

const combined = combineProjections({ funds: fundsProjection, clocks: clocksProjection, presence: presenceProjection });

type Command =
  | { type: "sale"; amount: number }
  | { type: "purchase"; amount: number }
  | { type: "tick"; clockId: string; delta: number }
  | { type: "presence"; actor: string; day: number; slot: string; station: string };

const commandArb = fc.oneof(
  fc.record({ type: fc.constant("sale" as const), amount: fc.integer({ min: 0, max: 10_000 }) }),
  fc.record({ type: fc.constant("purchase" as const), amount: fc.integer({ min: 0, max: 10_000 }) }),
  fc.record({
    type: fc.constant("tick" as const),
    clockId: fc.constantFrom("obligation", "heat"),
    delta: fc.integer({ min: -5, max: 5 }),
  }),
  fc.record({
    type: fc.constant("presence" as const),
    actor: fc.constantFrom("pc:zhan", "pc:deuce"),
    day: fc.integer({ min: 1, max: 20 }),
    slot: fc.constantFrom("DOCKSIDE", "COMMS", "TRANSIT", "ARRIVAL", "DOWNTIME"),
    station: fc.constantFrom("bridge", "cargo-bay"),
  }),
);

function applyCommand(ledger: ReturnType<typeof createLedger>, command: Command): void {
  switch (command.type) {
    case "sale":
      ledger.append({
        t: T,
        kind: "sale.settled",
        actor: REFEREE,
        payload: { lotId: "L1", amount: command.amount, countDelivered: 1, buyer: "buyer" },
      });
      return;
    case "purchase":
      ledger.append({
        t: T,
        kind: "purchase.settled",
        actor: REFEREE,
        payload: { lotId: "L1", amount: command.amount, seller: "seller" },
      });
      return;
    case "tick":
      ledger.append({
        t: T,
        kind: "clock.tick",
        actor: REFEREE,
        payload: { clockId: command.clockId, delta: command.delta },
      });
      return;
    case "presence":
      ledger.append({
        t: T,
        kind: "presence.declared",
        actor: REFEREE,
        payload: { actor: command.actor, station: command.station, day: command.day, slot: command.slot },
      });
      return;
  }
}

describe("derive [INV-3 replay determinism]", () => {
  it("is byte-identical across two fresh derives of the same fact log", () => {
    fc.assert(
      fc.property(fc.array(commandArb, { minLength: 0, maxLength: 40 }), (commands) => {
        const ledger = createLedger(createKindRegistry(KINDS_V0));
        for (const command of commands) {
          applyCommand(ledger, command);
        }
        const facts = ledger.all();

        const first = derive(facts, combined);
        const second = derive(facts, combined);
        expect(JSON.stringify(second)).toBe(JSON.stringify(first));

        // simulates "on another machine": a brand new memoized-projection instance
        const freshMachine = createMemoizedProjection(combined).derive(facts);
        expect(JSON.stringify(freshMachine)).toBe(JSON.stringify(first));
      }),
      { numRuns: 100 },
    );
  });
});

describe("createMemoizedProjection", () => {
  it("does not recompute when the fact log hasn't grown", () => {
    const apply = vi.fn((state: number, _fact) => state + 1);
    const projection: Projection<number> = { initial: 0, apply };
    const memo = createMemoizedProjection(projection);

    const ledger = createLedger(createKindRegistry(KINDS_V0));
    ledger.append({ t: T, kind: "sale.settled", actor: REFEREE, payload: { lotId: "L1", amount: 1, countDelivered: 1, buyer: "b" } });

    const facts = ledger.all();
    expect(memo.derive(facts)).toBe(1);
    expect(memo.derive(facts)).toBe(1);
    expect(apply).toHaveBeenCalledTimes(1);

    ledger.append({ t: T, kind: "sale.settled", actor: REFEREE, payload: { lotId: "L2", amount: 1, countDelivered: 1, buyer: "b" } });
    expect(memo.derive(ledger.all())).toBe(2);
    expect(apply).toHaveBeenCalledTimes(3);
  });

  it("carries a schemaVersion", () => {
    const memo = createMemoizedProjection(fundsProjection);
    expect(typeof memo.schemaVersion).toBe("number");
  });
});
