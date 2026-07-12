import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createKindRegistry } from "./registry.js";
import { KINDS_V0 } from "./kinds-v0.js";
import { createLedger } from "./ledger.js";
import type { GameTime } from "../time/index.js";

const T: GameTime = { day: 1, slot: "DOCKSIDE" };
const ZHAN = { kind: "pc", id: "pc:zhan" } as const;

describe("fact id ordering [ulid, INV-2 adjacent]", () => {
  it("is a total order: ids are strictly, lexicographically increasing across sequential appends", () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 200 }), (count) => {
        const ledger = createLedger(createKindRegistry(KINDS_V0));
        for (let i = 0; i < count; i++) {
          ledger.append({
            t: T,
            kind: "cargo.loaded",
            actor: ZHAN,
            payload: { lotId: `L${i}`, tons: 1, manifestId: "M1", bay: "DOCK" },
          });
        }
        const ids = ledger.all().map((f) => f.id);
        for (let i = 1; i < ids.length; i++) {
          expect(ids[i]! > ids[i - 1]!).toBe(true);
        }
      }),
    );
  });

  it("is time-consistent: an id minted later never sorts before an id minted earlier, even within the same millisecond", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const first = ledger.append({
      t: T,
      kind: "cargo.loaded",
      actor: ZHAN,
      payload: { lotId: "L1", tons: 1, manifestId: "M1", bay: "DOCK" },
    });
    const second = ledger.append({
      t: T,
      kind: "cargo.loaded",
      actor: ZHAN,
      payload: { lotId: "L2", tons: 1, manifestId: "M1", bay: "DOCK" },
    });
    expect(second.id > first.id).toBe(true);
  });
});
