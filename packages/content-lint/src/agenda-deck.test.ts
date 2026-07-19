import { readFileSync } from "node:fs";
import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import { agendaReferentialErrors } from "./agenda-lint.js";

const schema = JSON.parse(
  readFileSync(new URL("../../engine/src/agenda/agenda-deck.schema.json", import.meta.url), "utf8"),
);
const validate = new Ajv({ allErrors: true }).compile(schema);

const VALID = {
  id: "fixture:agendas",
  odds: 0.3,
  tierWeights: { orthogonal: 0.2, parasitic: 0.5, hostile: 0.3 },
  routineObjective: {
    id: "routine:survive",
    successCondition: { kinds: ["jump.plotted"], rankBy: "probative", threshold: 1 },
  },
  templates: { "agenda.move.label": "Move the listed cargo." },
  agendas: [
    {
      id: "agenda:test",
      faction: "test",
      tier: "hostile",
      successCondition: { kinds: ["cargo.diverted"], rankBy: "probative", threshold: 1 },
      exposureCost: { clockId: "heat", delta: 1 },
      actions: [
        {
          id: "agenda:move",
          labelTemplate: "agenda.move.label",
          access: { kind: "aboard" },
          target: { kinds: ["cargo.loaded"], where: { tags: ["listed"] } },
          proposals: [{ kind: "cargo.diverted", actor: { ref: "self" }, payload: { lotId: { ref: "target", field: "lotId" }, qty: 1, channel: "private" } }],
          implies: [{ kind: "presence.declared" }],
          payout: 100,
          exposure: { clockId: "heat", delta: 1 },
        },
      ],
    },
  ],
};

describe("agenda deck schema and referential lint [Spec §10.2/§19, M2-03]", () => {
  it("accepts the approved tiers, selectors, actions, access rules, and exact-kind targets", () => {
    expect(validate(VALID)).toBe(true);
    expect(agendaReferentialErrors(VALID, [{ id: "frame:test", claimant: { agendaActionId: "agenda:move" } }], "fixture")).toEqual([]);
  });

  it("rejects invalid tiers, empty target kinds, executable/glob selectors, and unknown access kinds", () => {
    expect(validate({ ...VALID, agendas: [{ ...VALID.agendas[0], tier: "secret-fourth-tier" }] })).toBe(false);
    expect(validate({ ...VALID, agendas: [{ ...VALID.agendas[0], actions: [{ ...VALID.agendas[0].actions[0], target: { kinds: [] } }] }] })).toBe(false);
    expect(validate({ ...VALID, agendas: [{ ...VALID.agendas[0], actions: [{ ...VALID.agendas[0].actions[0], target: { kinds: ["cargo.*"] } }] }] })).toBe(false);
    expect(validate({ ...VALID, agendas: [{ ...VALID.agendas[0], actions: [{ ...VALID.agendas[0].actions[0], access: { kind: "eval" } }] }] })).toBe(false);
  });

  it("reports incomplete weights and every dangling kind, payload field, template, implication, target field, and claimant reference", () => {
    const invalid = structuredClone(VALID);
    invalid.tierWeights.hostile = 0.2;
    invalid.agendas[0]!.successCondition.kinds = ["missing.kind"];
    invalid.agendas[0]!.actions[0]!.labelTemplate = "missing.template";
    invalid.agendas[0]!.actions[0]!.target!.kinds = ["jump.plotted"];
    invalid.agendas[0]!.actions[0]!.proposals[0]!.kind = "missing.proposal";
    invalid.agendas[0]!.actions[0]!.proposals[0]!.payload = { missingField: 1 };
    invalid.agendas[0]!.actions[0]!.implies = [{ kind: "missing.implication" }];

    const errors = agendaReferentialErrors(invalid, [{ id: "frame:test", claimant: { agendaActionId: "missing.action" } }], "fixture");
    expect(errors.join("\n")).toMatch(/tier weights.*sum to 1/i);
    expect(errors.join("\n")).toMatch(/missing\.kind/);
    expect(errors.join("\n")).toMatch(/missing\.template/);
    expect(errors.join("\n")).toMatch(/target field.*lotId/i);
    expect(errors.join("\n")).toMatch(/missing\.proposal/);
    expect(errors.join("\n")).toMatch(/payload field.*missingField/i);
    expect(errors.join("\n")).toMatch(/missing\.implication/);
    expect(errors.join("\n")).toMatch(/missing\.action/);
  });
});
