import { describe, expect, it } from "vitest";
import { derive } from "../ledger/derive.js";
import { createKindRegistry } from "../ledger/registry.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import { createLedger } from "../ledger/ledger.js";
import type { GameTime } from "../time/index.js";
import type { CrewMember } from "../plugin-api/character.js";
import { commitImportBenefits } from "../phases/commits.js";
import { fundsProjection } from "./funds.js";
import { planImportBenefits } from "./benefits.js";

/**
 * M3-08 acceptance tests — lead-authored, worker read-only. `planImportBenefits`/
 * `commitImportBenefits` implement rulebook §13.3's cash-only muster-out benefits
 * (docs/design/travel-and-import-v1.md §5.2/§5.3): ship shares and inventory are deferred.
 */

const T: GameTime = { day: 1, slot: "DOCKSIDE" };

const ZHAN: CrewMember = {
  crewMemberId: "crew:zhan",
  name: "Zhan",
  career: "Merchant",
  sourceHash: "hash:zhan-v1",
  attributes: { str: 7 },
  skills: { Broker: 2 },
};

describe("planImportBenefits / commitImportBenefits [M3-08, rulebook §13.3, INV-6]", () => {
  it("importing a character with muster-out cash produces exactly one funds proposal of the right amount, reflected after the interpreter commits", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const proposals = planImportBenefits([], { crewMember: ZHAN, cashAmount: 5000, t: T });

    const cashProposals = proposals.filter((p) => p.kind === "benefit.cashGranted");
    expect(cashProposals).toHaveLength(1);
    expect(cashProposals[0]!.payload.amount).toBe(5000);

    commitImportBenefits(ledger, proposals);
    expect(derive(ledger.all(), fundsProjection)).toBe(5000);
  });

  it("the funds projection reads benefit.cashGranted alongside the existing settlement kinds; sale.settled/purchase.settled behavior is unchanged", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const REFEREE = { kind: "referee", id: "referee" } as const;
    ledger.append({ t: T, kind: "sale.settled", actor: REFEREE, payload: { lotId: "L1", amount: 500, countDelivered: 20, buyer: "buyer" } });
    ledger.append({ t: T, kind: "purchase.settled", actor: REFEREE, payload: { lotId: "L2", amount: 200, seller: "seller" } });
    commitImportBenefits(ledger, planImportBenefits(ledger.all(), { crewMember: ZHAN, cashAmount: 1000, t: T }));

    expect(derive(ledger.all(), fundsProjection)).toBe(500 - 200 + 1000);
  });

  it("benefits are proposals, not direct ledger writes (INV-6): planImportBenefits never touches a ledger", () => {
    // planImportBenefits's signature takes only a fact array, never a Ledger -- there is no
    // ledger reference for it to call .append on. The eslint rule
    // no-ledger-writes-outside-interpreter additionally enforces this statically for
    // packages/engine/src/economy/**, asserted by that rule's own test suite.
    const proposals = planImportBenefits([], { crewMember: ZHAN, cashAmount: 5000, t: T });
    for (const proposal of proposals) {
      expect(proposal).not.toHaveProperty("id");
      expect(proposal).not.toHaveProperty("wall");
    }
  });

  it("re-importing the same character (same sourceHash) does not double-post benefits", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    commitImportBenefits(ledger, planImportBenefits(ledger.all(), { crewMember: ZHAN, cashAmount: 5000, t: T }));
    commitImportBenefits(ledger, planImportBenefits(ledger.all(), { crewMember: ZHAN, cashAmount: 5000, t: T }));

    expect(ledger.all().filter((f) => f.kind === "crew.imported")).toHaveLength(1);
    expect(ledger.all().filter((f) => f.kind === "benefit.cashGranted")).toHaveLength(1);
    expect(derive(ledger.all(), fundsProjection)).toBe(5000);
  });

  it("replay determinism: deriving funds from the same committed fact stream twice gives byte-identical results (INV-3)", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    commitImportBenefits(ledger, planImportBenefits(ledger.all(), { crewMember: ZHAN, cashAmount: 5000, t: T }));
    const facts = ledger.all();

    expect(derive(facts, fundsProjection)).toBe(derive(facts, fundsProjection));
    expect(JSON.stringify(facts)).toBe(JSON.stringify(JSON.parse(JSON.stringify(facts))));
  });

  it("a character with no benefits posts nothing at all — no zero-value facts, but the roster entry still lands", () => {
    const noCash: CrewMember = { ...ZHAN, crewMemberId: "crew:noCash", sourceHash: "hash:no-cash" };
    const proposals = planImportBenefits([], { crewMember: noCash, cashAmount: 0, t: T });

    expect(proposals.filter((p) => p.kind === "benefit.cashGranted")).toHaveLength(0);
    expect(proposals.filter((p) => p.kind === "crew.imported")).toHaveLength(1);
  });
});
