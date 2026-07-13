import { readFileSync } from "node:fs";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";

const frameSchemaUrl = new URL("../../engine/src/generate/incident-frame.schema.json", import.meta.url);
const frameSchema = JSON.parse(readFileSync(frameSchemaUrl, "utf8"));
const ajv = new Ajv({ allErrors: true });
const validateFrame = ajv.compile(frameSchema);

const VALID_FRAME = {
  id: "trade:fixture",
  pillar: "trade",
  surfaceTables: {
    actor: [{ id: "npc:kessler", factFields: {}, surfaceFields: {} }],
    motive: [{ id: "unexplained", factFields: {}, surfaceFields: {} }],
    method: [{ id: "off-schedule-cycle", factFields: {}, surfaceFields: {} }],
    location: [{ id: "aft-bay", factFields: {}, surfaceFields: {} }],
    trace: [{ id: "log-entry", factFields: {}, surfaceFields: {} }],
  },
  innocentTwin: [
    {
      kind: "lock.cycled",
      tables: {
        actor: [{ id: "npc:kessler", factFields: {}, surfaceFields: {} }],
        motive: [{ id: "routine", factFields: {}, surfaceFields: {} }],
        method: [{ id: "captain-override", factFields: { door: "aft-bay-door", codeClass: "CAPT-OVR", time: "0340" }, surfaceFields: {} }],
        location: [{ id: "aft-bay", factFields: {}, surfaceFields: {} }],
        trace: [{ id: "log-entry", factFields: {}, surfaceFields: {} }],
      },
    },
  ],
  evidenceTrail: [{ id: "camera-log", description: "aft bay camera", access: { kind: "aboard" } }],
  cooldownWeeks: 2,
};

describe("incident-frame.schema.json [Spec §8.2, §19 schema+balance passes, M1-11a]", () => {
  it("accepts a well-formed incident frame", () => {
    expect(validateFrame(VALID_FRAME)).toBe(true);
  });

  it("rejects an evidence trail entry missing an access precondition (balance: §19's 'every evidence trail entry has an access precondition')", () => {
    const bad = { ...VALID_FRAME, evidenceTrail: [{ id: "camera-log", description: "aft bay camera" }] };
    expect(validateFrame(bad)).toBe(false);
  });

  it("rejects cooldownWeeks of zero or less (balance: §19's 'cooldowns within bounds')", () => {
    expect(validateFrame({ ...VALID_FRAME, cooldownWeeks: 0 })).toBe(false);
    expect(validateFrame({ ...VALID_FRAME, cooldownWeeks: -1 })).toBe(false);
  });

  it("rejects a frame with no innocentTwin (balance: every incident frame has an innocent_twin)", () => {
    expect(validateFrame({ ...VALID_FRAME, innocentTwin: [] })).toBe(false);
  });

  it("rejects an unknown pillar", () => {
    expect(validateFrame({ ...VALID_FRAME, pillar: "not-a-pillar" })).toBe(false);
  });

  it("accepts the forward-looking claimant field (M2 agenda claiming, not read by any code yet)", () => {
    expect(validateFrame({ ...VALID_FRAME, claimant: { agendaActionId: "agenda:some-action" } })).toBe(true);
  });
});
