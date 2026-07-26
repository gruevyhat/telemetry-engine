import { describe, expect, it } from "vitest";
import type { GameTime } from "../../packages/engine/src/time/index.js";
import type { Plugin } from "../../packages/engine/src/plugin-api/plugin.js";
import { createKindRegistry } from "../../packages/engine/src/ledger/registry.js";
import { KINDS_V0 } from "../../packages/engine/src/ledger/kinds-v0.js";
import { createLedger } from "../../packages/engine/src/ledger/ledger.js";
import { commitEdgeUsed } from "../../packages/engine/src/phases/commits.js";
import { travellerPlugin } from "../../packages/plugin-traveller/src/index.js";
import { useEdge } from "../../packages/plugin-traveller/src/edges.js";

/**
 * M3-11 acceptance tests — the two things that need both packages in scope together:
 * type-level `Plugin` conformance (already checked at `index.ts`'s declaration site since
 * `plugin-traveller` now depends on `@telemetry/engine` — see the M3-11 amendment — but
 * asserted here too as a standing regression guard), and the M3-09 commit seam this card
 * discovered was never actually exercised end-to-end.
 */

describe("travellerPlugin satisfies the engine's Plugin interface [M3-11, Spec §15]", () => {
  it("type-checks as a Plugin", () => {
    const plugin: Plugin = travellerPlugin;
    expect(plugin.id).toBe("traveller");
  });
});

describe("useEdge -> commitEdgeUsed -> ledger [M3-11 closes an M3-09 seam]", () => {
  it("a Merchant's edge-use proposal commits end-to-end into a real ledger", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const t: GameTime = { day: 1, slot: "DOCKSIDE" };

    const importedFact = ledger.append({
      t,
      kind: "crew.imported",
      actor: { kind: "referee", id: "referee" },
      payload: { crewMemberId: "crew:zhan", name: "Zhan", career: "Merchant", sourceHash: "hash:zhan" },
    });
    const checkFact = ledger.append({
      t,
      kind: "check.reported",
      actor: { kind: "pc", id: "crew:zhan" },
      payload: { actor: "crew:zhan", skill: "Broker", dm: 2, total: 9, difficulty: 8, effect: 1 },
    });

    const result = useEdge(ledger.all(), { crewMemberId: "crew:zhan", career: "Merchant" }, { checkFact }, t);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected the reroll edge to be available");

    const committed = commitEdgeUsed(ledger, result.proposal);
    expect(committed.kind).toBe("edge.used");
    expect(committed.payload).toMatchObject({ crewMemberId: "crew:zhan", edgeId: "merchant-broker-reroll", targetFactId: checkFact.id });
    expect(ledger.all()).toHaveLength(3);

    // A second attempt in the same (only, per M3-09's resolution) campaign is refused.
    const second = useEdge(ledger.all(), { crewMemberId: "crew:zhan", career: "Merchant" }, { checkFact }, t);
    expect(second).toEqual({ ok: false, reason: "already-used" });

    void importedFact;
  });
});
