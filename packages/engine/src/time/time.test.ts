import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { advanceEvidenceAction, advanceToSlot, type BeatSlot, type GameTime } from "./index.js";

const SLOTS: BeatSlot[] = ["DOCKSIDE", "COMMS", "TRANSIT", "ARRIVAL", "DOWNTIME"];
const slotArb = fc.constantFrom(...SLOTS);

describe("advanceToSlot [Spec §3.1]", () => {
  it("leaving TRANSIT for a different slot advances day += 7", () => {
    const result = advanceToSlot({ day: 7, slot: "TRANSIT" }, "ARRIVAL");
    expect(result).toEqual({ day: 14, slot: "ARRIVAL" });
  });

  it("a transition that does not leave TRANSIT does not advance the day", () => {
    expect(advanceToSlot({ day: 3, slot: "DOCKSIDE" }, "COMMS")).toEqual({ day: 3, slot: "COMMS" });
    expect(advanceToSlot({ day: 3, slot: "ARRIVAL" }, "DOWNTIME")).toEqual({ day: 3, slot: "DOWNTIME" });
    // staying in TRANSIT (e.g. an in-transit event) is not "leaving" TRANSIT
    expect(advanceToSlot({ day: 7, slot: "TRANSIT" }, "TRANSIT")).toEqual({ day: 7, slot: "TRANSIT" });
  });
});

describe("advanceEvidenceAction [Spec §3.1]", () => {
  it("advances day += 1 and leaves the slot unchanged", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 1000 }), slotArb, (day, slot) => {
        const result = advanceEvidenceAction({ day, slot });
        expect(result).toEqual({ day: day + 1, slot });
      }),
    );
  });
});

describe("GameTime advancement [INV-6 time facet]: only these two pure functions move it", () => {
  type Op = { kind: "slot"; target: BeatSlot } | { kind: "evidence" };
  const opArb: fc.Arbitrary<Op> = fc.oneof(
    fc.record({ kind: fc.constant("slot" as const), target: slotArb }),
    fc.record({ kind: fc.constant("evidence" as const) }),
  );

  function apply(time: GameTime, op: Op): GameTime {
    return op.kind === "slot" ? advanceToSlot(time, op.target) : advanceEvidenceAction(time);
  }

  function expectedDelta(fromSlot: BeatSlot, op: Op): number {
    if (op.kind === "evidence") return 1;
    return fromSlot === "TRANSIT" && op.target !== "TRANSIT" ? 7 : 0;
  }

  it("day is monotonically non-decreasing across any sequence of advancement operations", () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 0, maxLength: 50 }), slotArb, (ops, startSlot) => {
        let time: GameTime = { day: 1, slot: startSlot };
        for (const op of ops) {
          const next = apply(time, op);
          expect(next.day).toBeGreaterThanOrEqual(time.day);
          time = next;
        }
      }),
    );
  });

  it("the final day always equals the sum of each step's own {0, +1, +7} delta — no other path changes it", () => {
    fc.assert(
      fc.property(fc.array(opArb, { minLength: 0, maxLength: 50 }), slotArb, (ops, startSlot) => {
        let time: GameTime = { day: 1, slot: startSlot };
        let expectedDay = 1;
        for (const op of ops) {
          expectedDay += expectedDelta(time.slot, op);
          time = apply(time, op);
        }
        expect(time.day).toBe(expectedDay);
      }),
    );
  });
});
