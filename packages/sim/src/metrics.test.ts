import { describe, expect, it } from "vitest";
import type { CampaignEvent } from "./campaign.js";
import {
  degradationRate,
  evidenceInformativeness,
  misattributionRate,
  obligationFailureCurve,
  recurrenceRate,
} from "./metrics.js";

describe("recurrenceRate [Spec §21.4 'frame recurrence within 4 turns < 5%']", () => {
  it("is 0 for an empty event list", () => {
    expect(recurrenceRate([])).toBe(0);
  });

  it("is 0 when no frame repeats within the window", () => {
    const events: CampaignEvent[] = [
      { turn: 1, kind: "incident", frameId: "a", causeActorId: "x" },
      { turn: 2, kind: "incident", frameId: "b", causeActorId: "x" },
    ];
    expect(recurrenceRate(events)).toBe(0);
  });

  it("counts a frame that fires twice within the window as one recurrence", () => {
    const events: CampaignEvent[] = [
      { turn: 1, kind: "incident", frameId: "a", causeActorId: "x" },
      { turn: 3, kind: "incident", frameId: "a", causeActorId: "x" },
    ];
    expect(recurrenceRate(events)).toBe(0.5);
  });

  it("does not count a repeat outside the window", () => {
    const events: CampaignEvent[] = [
      { turn: 1, kind: "incident", frameId: "a", causeActorId: "x" },
      { turn: 10, kind: "incident", frameId: "a", causeActorId: "x" },
    ];
    expect(recurrenceRate(events, 4)).toBe(0);
  });
});

describe("degradationRate [Spec §21.4 'degradation events < 0.5% of beats']", () => {
  it("is 0 for an empty event list", () => {
    expect(degradationRate([])).toBe(0);
  });

  it("is the fraction of degraded turns", () => {
    const events: CampaignEvent[] = [
      { turn: 1, kind: "incident", frameId: "a", causeActorId: "x" },
      { turn: 2, kind: "degraded", rung: "2" },
      { turn: 3, kind: "incident", frameId: "b", causeActorId: "y" },
      { turn: 4, kind: "degraded", rung: "1" },
    ];
    expect(degradationRate(events)).toBe(0.5);
  });
});

describe("misattributionRate [Spec §21.4 'misattribution rate 25-40% per incident']", () => {
  it("is 0 for no pairs", () => {
    expect(misattributionRate([])).toBe(0);
  });

  it("is the fraction of pairs where accused differs from actual", () => {
    const pairs = [
      { accused: "npc:kessler", actual: "npc:kessler" },
      { accused: "npc:reyes", actual: "npc:kessler" },
      { accused: "npc:kessler", actual: "npc:kessler" },
      { accused: "npc:okonkwo", actual: "npc:kessler" },
    ];
    expect(misattributionRate(pairs)).toBe(0.5);
  });
});

describe("evidenceInformativeness [Spec §21.4 'mean entropy reduction per action above floor']", () => {
  it("is 0 for no samples", () => {
    expect(evidenceInformativeness([])).toBe(0);
  });

  it("is 0 bits when an action narrows nothing (worldsBefore === worldsAfter)", () => {
    expect(evidenceInformativeness([{ worldsBefore: 4, worldsAfter: 4 }])).toBe(0);
  });

  it("computes mean log2 entropy reduction across samples", () => {
    // 4 -> 2 worlds is 1 bit; 8 -> 2 worlds is 2 bits; mean is 1.5
    expect(evidenceInformativeness([
      { worldsBefore: 4, worldsAfter: 2 },
      { worldsBefore: 8, worldsAfter: 2 },
    ])).toBe(1.5);
  });
});

describe("obligationFailureCurve [Spec §21.4 \"Obligation-failure curve inside the frame's design band\"]", () => {
  it("returns an empty curve for no samples", () => {
    expect(obligationFailureCurve([])).toEqual([]);
  });

  it("tracks cumulative failure rate in turn order regardless of input order", () => {
    const curve = obligationFailureCurve([
      { turn: 2, met: false },
      { turn: 1, met: true },
      { turn: 3, met: true },
    ]);
    expect(curve).toEqual([
      { turn: 1, cumulativeFailureRate: 0 },
      { turn: 2, cumulativeFailureRate: 0.5 },
      { turn: 3, cumulativeFailureRate: 1 / 3 },
    ]);
  });
});
