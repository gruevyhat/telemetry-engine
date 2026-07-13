import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createKindRegistry } from "../ledger/registry.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import { createLedger } from "../ledger/ledger.js";
import { createRng } from "../rng/index.js";
import { createActorView, decide, type Disposition, type MarketLot } from "./policy.js";

const DISPOSITIONS: readonly Disposition[] = ["naive", "diligent", "paranoid", "loyalist", "selfish"];

describe("createActorView — no policy may read beyond its actor's visibility slice [INV-13]", () => {
  it("exposes only the pre-filtered facts, and peekFullLedger() always throws", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    ledger.append({ t: { day: 1, slot: "DOCKSIDE" }, kind: "cargo.diverted", actor: { kind: "npc", id: "npc:kessler" }, payload: { lotId: "L1", qty: 1, channel: "fence" } });

    const view = createActorView(ledger, { scope: "private", playerId: "pc:zhan" });
    expect(view.facts.some((f) => f.kind === "cargo.diverted")).toBe(false); // referee-scoped, not visible to pc:zhan
    expect(() => view.peekFullLedger()).toThrow(/visibility slice/i);
  });
});

describe("market decision [sim-bot-policies.md §2 market]", () => {
  const LOTS: readonly MarketLot[] = [
    { lotId: "good", buyPrice: 100, destPrice: 150, stalenessWeeks: 0, fuelShare: 10 }, // score = 150 - 100 - 10 = 40
    { lotId: "bad", buyPrice: 200, destPrice: 150, stalenessWeeks: 0, fuelShare: 10 }, // score negative
  ];

  it("buys the best positive-score lot within funds minus the disposition's reserve", () => {
    const action = decide({ situation: "market", lots: LOTS, funds: 1000, nextObligationPayment: 100 }, "naive", createRng("seed").derive("npc:test"));
    expect(action).toEqual({ kind: "market.buy", lotId: "good" });
  });

  it("passes when no lot has positive score", () => {
    const negativeLots: readonly MarketLot[] = [{ lotId: "bad", buyPrice: 200, destPrice: 150, stalenessWeeks: 0, fuelShare: 10 }];
    const action = decide({ situation: "market", lots: negativeLots, funds: 1000, nextObligationPayment: 100 }, "diligent", createRng("seed").derive("npc:test"));
    expect(action).toEqual({ kind: "market.pass" });
  });

  it("passes when funds minus the reserve can't cover the best lot's buy price (paranoid holds back 90%)", () => {
    // nextObligationPayment 1000 * 0.9 reserve = 900 held back; funds 1000 leaves only 100
    // spendable, which can't afford the 100-buyPrice lot AND its own reserve headroom check.
    const action = decide({ situation: "market", lots: LOTS, funds: 1000, nextObligationPayment: 1000 }, "paranoid", createRng("seed").derive("npc:test"));
    expect(action).toEqual({ kind: "market.pass" });
  });
});

describe("discrepancy decision [sim-bot-policies.md §2 discrepancy]", () => {
  it("naive never investigates (threshold is infinite)", () => {
    const action = decide({ situation: "discrepancy", lossValue: 1_000_000, obligationSlackDays: 100 }, "naive", createRng("seed").derive("npc:test"));
    expect(action).toEqual({ kind: "skip-investigation" });
  });

  it("paranoid investigates a small loss with little slack (threshold Cr500 / 1 day)", () => {
    const action = decide({ situation: "discrepancy", lossValue: 600, obligationSlackDays: 2 }, "paranoid", createRng("seed").derive("npc:test"));
    expect(action).toEqual({ kind: "investigate" });
  });

  it("paranoid skips when slack is below the floor even if the loss clears the threshold", () => {
    const action = decide({ situation: "discrepancy", lossValue: 600, obligationSlackDays: 0 }, "paranoid", createRng("seed").derive("npc:test"));
    expect(action).toEqual({ kind: "skip-investigation" });
  });

  it("diligent needs a bigger loss than paranoid before investigating (Cr5,000 / 4 days)", () => {
    const smallLoss = decide({ situation: "discrepancy", lossValue: 600, obligationSlackDays: 10 }, "diligent", createRng("seed").derive("npc:test"));
    expect(smallLoss).toEqual({ kind: "skip-investigation" });
    const bigLoss = decide({ situation: "discrepancy", lossValue: 6000, obligationSlackDays: 10 }, "diligent", createRng("seed").derive("npc:test"));
    expect(bigLoss).toEqual({ kind: "investigate" });
  });
});

describe("property: seeded determinism -- same view + seed = same decision, across all dispositions", () => {
  it("holds for market decisions", () => {
    const lots: readonly MarketLot[] = [{ lotId: "L1", buyPrice: 100, destPrice: 140, stalenessWeeks: 1, fuelShare: 5 }];
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.constantFrom(...DISPOSITIONS), (seed, disposition) => {
        const input = { situation: "market" as const, lots, funds: 5000, nextObligationPayment: 200 };
        const first = decide(input, disposition, createRng(seed).derive("npc:test"));
        const second = decide(input, disposition, createRng(seed).derive("npc:test"));
        expect(second).toEqual(first);
      }),
    );
  });

  it("holds for discrepancy decisions", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.constantFrom(...DISPOSITIONS), fc.nat({ max: 10000 }), fc.nat({ max: 30 }), (seed, disposition, lossValue, slack) => {
        const input = { situation: "discrepancy" as const, lossValue, obligationSlackDays: slack };
        const first = decide(input, disposition, createRng(seed).derive("npc:test"));
        const second = decide(input, disposition, createRng(seed).derive("npc:test"));
        expect(second).toEqual(first);
      }),
    );
  });
});
