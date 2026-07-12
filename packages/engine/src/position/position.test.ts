import { describe, expect, it } from "vitest";
import { derive } from "../ledger/derive.js";
import { createKindRegistry } from "../ledger/registry.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import { createLedger } from "../ledger/ledger.js";
import type { GameTime } from "../time/index.js";
import { presenceOf, presenceProjection } from "./index.js";

const T: GameTime = { day: 1, slot: "DOCKSIDE" };
const REFEREE = { kind: "referee", id: "referee" } as const;

describe("presenceProjection [fact-kinds-v0.md position model]", () => {
  it("an actor with no declaration for a given day/slot resolves to berth/common, not unknown", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const state = derive(ledger.all(), presenceProjection);
    expect(presenceOf(state, "pc:zhan", 3, "DOCKSIDE")).toEqual({ kind: "berth" });
  });

  it("a declared station is reported back for that exact (actor, day, slot)", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    ledger.append({
      t: T,
      kind: "presence.declared",
      actor: REFEREE,
      payload: { actor: "pc:zhan", station: "bridge", day: 3, slot: "DOCKSIDE" },
    });
    const state = derive(ledger.all(), presenceProjection);
    expect(presenceOf(state, "pc:zhan", 3, "DOCKSIDE")).toEqual({ kind: "station", station: "bridge" });
    // a different day/slot for the same actor is still undeclared -> berth/common
    expect(presenceOf(state, "pc:zhan", 4, "DOCKSIDE")).toEqual({ kind: "berth" });
  });
});
