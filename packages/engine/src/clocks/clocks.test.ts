import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { derive } from "../ledger/derive.js";
import { createKindRegistry } from "../ledger/registry.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import { createLedger } from "../ledger/ledger.js";
import type { GameTime } from "../time/index.js";
import { clocksProjection } from "./index.js";

const T: GameTime = { day: 1, slot: "DOCKSIDE" };
const REFEREE = { kind: "referee", id: "referee" } as const;

describe("clocksProjection [Spec §5, INV-7]", () => {
  it("a clock's derived value equals the sum of its clock.tick deltas", () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -10, max: 10 }), { minLength: 0, maxLength: 30 }), (deltas) => {
        const ledger = createLedger(createKindRegistry(KINDS_V0));
        for (const delta of deltas) {
          ledger.append({ t: T, kind: "clock.tick", actor: REFEREE, payload: { clockId: "obligation", delta } });
        }
        const state = derive(ledger.all(), clocksProjection);
        const expected = deltas.reduce((sum, d) => sum + d, 0);
        expect(state.obligation ?? 0).toBe(expected);
      }),
    );
  });

  it("keeps independent clocks independent", () => {
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    ledger.append({ t: T, kind: "clock.tick", actor: REFEREE, payload: { clockId: "obligation", delta: -1 } });
    ledger.append({ t: T, kind: "clock.tick", actor: REFEREE, payload: { clockId: "heat", delta: 3 } });
    const state = derive(ledger.all(), clocksProjection);
    expect(state).toEqual({ obligation: -1, heat: 3 });
  });
});
