import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createKindRegistry } from "../ledger/registry.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import { createLedger } from "../ledger/ledger.js";
import { createRng, verifySecretDrawCommitment } from "../rng/index.js";
import type { PhaseScript } from "../phases/types.js";
import { loadPhaseScript } from "../phases/load.js";
import { createPhaseInterpreter } from "../phases/interpreter.js";
import { loadAgendaDeck, type AgendaDeck } from "./index.js";

const T = { day: 0, slot: "DOCKSIDE" as const };
const SCRIPT: PhaseScript = {
  frame: "agenda-setup",
  start: "setup",
  steps: [{ id: "setup", kind: "announce", next: "setup" }],
};

const RAW_DECK = {
  id: "fixture:agenda-deck",
  odds: 0.4,
  tierWeights: { orthogonal: 0.25, parasitic: 0.5, hostile: 0.25 },
  routineObjective: {
    id: "routine:keep-flying",
    successCondition: { kinds: ["jump.plotted"], rankBy: "probative", threshold: 1 },
  },
  templates: {
    "agenda.divert.label": "Divert one listed cargo lot.",
  },
  agendas: [
    {
      id: "agenda:quartermaster",
      faction: "fixture-faction",
      tier: "orthogonal",
      successCondition: { kinds: ["cargo.diverted"], rankBy: "probative", threshold: 1 },
      exposureCost: { clockId: "heat", delta: 1 },
      actions: [
        {
          id: "agenda:divert",
          labelTemplate: "agenda.divert.label",
          access: { kind: "aboard" },
          target: { kinds: ["cargo.loaded"], where: { location: "cargo-hold" } },
          proposals: [
            {
              kind: "cargo.diverted",
              actor: { ref: "self" },
              payload: { lotId: { ref: "target", field: "lotId" }, qty: 1, channel: "private" },
            },
          ],
          implies: [{ kind: "presence.declared" }],
          payout: 1200,
          exposure: { clockId: "heat", delta: 1 },
        },
      ],
    },
    {
      id: "agenda:broker",
      faction: "fixture-faction",
      tier: "parasitic",
      successCondition: { kinds: ["market.trade"], rankBy: "probative", threshold: 1 },
      exposureCost: { clockId: "heat", delta: 1 },
      actions: [],
    },
    {
      id: "agenda:saboteur",
      faction: "fixture-faction",
      tier: "hostile",
      successCondition: { kinds: ["system.tampered"], rankBy: "probative", threshold: 1 },
      exposureCost: { clockId: "heat", delta: 2 },
      actions: [],
    },
  ],
} as const;

function setup(odds: number) {
  const deck: AgendaDeck = loadAgendaDeck({ ...RAW_DECK, odds });
  const campaignSeed = "agenda-1";
  const campaignSalt = "agenda-deal-salt";
  const ledger = createLedger(createKindRegistry(KINDS_V0));
  const interpreter = createPhaseInterpreter(ledger, loadPhaseScript(SCRIPT), {
    rng: createRng(campaignSeed),
    deck: [],
    commitReveal: { campaignSeed, campaignSalt },
  });
  return { deck, ledger, interpreter };
}

describe("independent agenda setup deal [M2-03, INV-6/8]", () => {
  it("makes one independent Bernoulli draw per player, with odds zero dealing none and odds one dealing all", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), { minLength: 1, maxLength: 8 }), async (players) => {
        for (const odds of [0, 1]) {
          const { deck, ledger, interpreter } = setup(odds);
          const result = await interpreter.dealAgendas({ t: T, players, deck });
          const deals = ledger.all().filter((fact) => fact.kind === "agenda.dealt");
          const commitments = ledger.all().filter((fact) => fact.kind === "secretRoll.committed");

          expect(deals).toHaveLength(players.length);
          expect(commitments).toHaveLength(players.length);
          expect(result.commitmentPreimages.draws).toHaveLength(players.length);
          expect(deals.map((fact) => fact.payload.result)).toEqual(players.map(() => odds === 1));
        }
      }),
      { numRuns: 25 },
    );
  });

  it("commits positive and negative deals with verifying companions linked to the sole prior seed", async () => {
    const { deck, ledger, interpreter } = setup(0.5);
    const result = await interpreter.dealAgendas({ t: T, players: ["negative", "positive"], deck });
    const seed = ledger.all().filter((fact) => fact.kind === "campaign.seedCommitted");
    const deals = ledger.all().filter((fact) => fact.kind === "agenda.dealt");
    const commitments = ledger.all().filter((fact) => fact.kind === "secretRoll.committed");

    expect(seed).toHaveLength(1);
    expect(ledger.all().indexOf(seed[0]!)).toBeLessThan(ledger.all().indexOf(deals[0]!));
    expect(new Set(deals.map((fact) => fact.payload.result))).toEqual(new Set([false, true]));
    expect(commitments.map((fact) => fact.payload.seedCommitmentFactId)).toEqual([seed[0]!.id, seed[0]!.id]);
    for (let index = 0; index < commitments.length; index += 1) {
      expect(await verifySecretDrawCommitment(commitments[index]!.payload.hash as string, result.commitmentPreimages.draws[index]!)).toBe(true);
    }
  });

  it("gives every player a private objective fact without leaking deal contents to public/table views", async () => {
    const { deck, ledger, interpreter } = setup(0);
    await interpreter.dealAgendas({ t: T, players: ["zhan", "deuce"], deck });
    const objectives = ledger.all().filter((fact) => fact.kind === "objective.assigned");

    expect(objectives).toHaveLength(2);
    expect(objectives.map((fact) => fact.visibility)).toEqual([
      { level: "private", playerIds: ["zhan"] },
      { level: "private", playerIds: ["deuce"] },
    ]);
    expect(ledger.visibleTo({ scope: "table" }).some((fact) => fact.kind === "agenda.dealt" || fact.kind === "objective.assigned")).toBe(false);
    expect(ledger.visibleTo({ scope: "public" }).some((fact) => fact.kind === "agenda.dealt" || fact.kind === "objective.assigned")).toBe(false);
  });
});
