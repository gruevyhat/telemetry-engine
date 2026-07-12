import { describe, expect, it } from "vitest";
import { derive } from "../ledger/derive.js";
import { createKindRegistry } from "../ledger/registry.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import { createLedger } from "../ledger/ledger.js";
import type { GameTime } from "../time/index.js";
import { fundsProjection } from "./funds.js";

const T: GameTime = { day: 1, slot: "DOCKSIDE" };
const REFEREE = { kind: "referee", id: "referee" } as const;

describe("fundsProjection", () => {
  it("sums sale.settled as credits and purchase.settled as debits", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    ledger.append({ t: T, kind: "sale.settled", actor: REFEREE, payload: { lotId: "L1", amount: 500, countDelivered: 20, buyer: "buyer" } });
    ledger.append({ t: T, kind: "purchase.settled", actor: REFEREE, payload: { lotId: "L2", amount: 200, seller: "seller" } });
    expect(derive(ledger.all(), fundsProjection)).toBe(300);
  });

  it("a correction fact excludes its target from the funds projection", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const wrongSale = ledger.append({
      t: T,
      kind: "sale.settled",
      actor: REFEREE,
      payload: { lotId: "L1", amount: 5000, countDelivered: 20, buyer: "buyer" },
    });
    const rightSale = ledger.append({
      t: T,
      kind: "sale.settled",
      actor: REFEREE,
      payload: { lotId: "L1", amount: 500, countDelivered: 20, buyer: "buyer" },
    });
    ledger.append({
      t: T,
      kind: "correction",
      actor: REFEREE,
      payload: { supersedes: wrongSale.id, note: "misreported amount" },
    });

    expect(derive(ledger.all(), fundsProjection)).toBe(rightSale.payload.amount);
  });
});
