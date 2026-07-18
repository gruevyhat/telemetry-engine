import { describe, expect, it } from "vitest";
import type { CampaignResult } from "./campaign.js";
import { exportLineupMetrics } from "./export.js";

const RESULT_A: CampaignResult = {
  events: [
    { turn: 1, kind: "incident", frameId: "trade:a", causeActorId: "npc:x" },
    { turn: 2, kind: "degraded", rung: "2" },
  ],
  facts: [],
};

const RESULT_B: CampaignResult = {
  events: [
    { turn: 1, kind: "incident", frameId: "trade:b", causeActorId: "npc:y" },
    { turn: 2, kind: "incident", frameId: "trade:c", causeActorId: "npc:z" },
  ],
  facts: [],
};

describe("exportLineupMetrics [Spec §20/§21.4]", () => {
  it("aggregates real recurrence/degradation across campaigns and reports campaign count", () => {
    const exported = exportLineupMetrics("L1", 4, [RESULT_A, RESULT_B]);
    expect(exported.lineup).toBe("L1");
    expect(exported.campaigns).toBe(2);
    expect(exported.turnsPerCampaign).toBe(4);
    expect(exported.degradationRate).toBe(0.25);
    expect(exported.recurrenceRate).toBe(0);
  });

  it("reports the not-yet-wired M2-dependent metrics as null rather than omitting them", () => {
    const exported = exportLineupMetrics("L2", 4, [RESULT_A]);
    expect(exported.misattributionRate).toBeNull();
    expect(exported.evidenceInformativeness).toBeNull();
    expect(exported.obligationFailureCurve).toBeNull();
  });

  it("is valid JSON-serializable output", () => {
    const exported = exportLineupMetrics("L4", 4, [RESULT_A]);
    expect(() => JSON.stringify(exported)).not.toThrow();
  });
});
