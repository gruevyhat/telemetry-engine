import { describe, expect, it } from "vitest";
import type { IncidentFrame } from "../generate/frame.js";
import { createKindRegistry } from "../ledger/registry.js";
import { KINDS_V0 } from "../ledger/kinds-v0.js";
import { createLedger } from "../ledger/ledger.js";
import { createRng, verifySecretDrawCommitment } from "../rng/index.js";
import type { PhaseScript } from "./types.js";
import { loadPhaseScript } from "./load.js";
import { createPhaseInterpreter } from "./interpreter.js";

const T = { day: 7, slot: "DOCKSIDE" as const };
const REFEREE = { kind: "referee", id: "referee" } as const;
const entry = (id: string, factFields: Record<string, string> = {}) => ({ id, factFields, surfaceFields: {} });
const tables = {
  actor: [entry("npc:kessler"), entry("npc:reyes")],
  motive: [entry("profit"), entry("revenge")],
  method: [entry("override", { codeClass: "CAPT-OVR", door: "aft-bay", time: "0340" }), entry("copied-code", { codeClass: "CREW", door: "aft-bay", time: "0410" })],
  location: [entry("aft-bay"), entry("cargo-locker")],
  trace: [entry("camera"), entry("log-gap")],
};

const FRAME: IncidentFrame = {
  id: "fixture:committed-cause",
  pillar: "trade",
  surfaceTables: tables,
  innocentTwin: [{ kind: "lock.cycled", tables }],
  evidenceTrail: [{ id: "log", description: "log", access: { kind: "aboard" } }],
  cooldownWeeks: 1,
};

const SCRIPT: PhaseScript = {
  frame: "commit-fixture",
  start: "incident",
  steps: [{ id: "incident", kind: "generate", gen: { frameId: FRAME.id }, next: "incident" }],
};

function committedInterpreter(ledger = createLedger(createKindRegistry(KINDS_V0))) {
  const campaignSeed = "m2-02-seed";
  const campaignSalt = "m2-02-salt";
  return {
    ledger,
    interpreter: createPhaseInterpreter(ledger, loadPhaseScript(SCRIPT), {
      rng: createRng(campaignSeed),
      deck: [FRAME],
      commitReveal: { campaignSeed, campaignSalt },
    }),
  };
}

describe("phase interpreter secret-draw retrofit [M2-02, INV-3/6/8]", () => {
  it("commits one campaign seed before exactly one companion per referee-only RNG draw", async () => {
    const { ledger, interpreter } = committedInterpreter();

    const result = await interpreter.advanceCommitted(T, REFEREE);
    const facts = ledger.all();
    const seedFacts = facts.filter((fact) => fact.kind === "campaign.seedCommitted");
    const commitments = facts.filter((fact) => fact.kind === "secretRoll.committed");

    expect(seedFacts).toHaveLength(1);
    expect(facts.indexOf(seedFacts[0]!)).toBeLessThan(facts.indexOf(commitments[0]!));
    // compose() draws one private innocent-twin entry on each of its five axes.
    expect(commitments).toHaveLength(5);
    expect(result.commitmentPreimages.draws).toHaveLength(5);
    for (let index = 0; index < commitments.length; index += 1) {
      expect(await verifySecretDrawCommitment(commitments[index]!.payload.hash as string, result.commitmentPreimages.draws[index]!)).toBe(true);
    }

    await interpreter.advanceCommitted(T, REFEREE);
    expect(ledger.all().filter((fact) => fact.kind === "campaign.seedCommitted")).toHaveLength(1);
    expect(ledger.all().filter((fact) => fact.kind === "secretRoll.committed")).toHaveLength(10);
  });

  it("kill/recreate after a draw matches uninterrupted result facts, hashes, and preimages", async () => {
    const uninterrupted = committedInterpreter();
    const uninterruptedResults = [
      await uninterrupted.interpreter.advanceCommitted(T, REFEREE),
      await uninterrupted.interpreter.advanceCommitted(T, REFEREE),
      await uninterrupted.interpreter.advanceCommitted(T, REFEREE),
    ];

    const resumed = committedInterpreter();
    const resumedResults = [await resumed.interpreter.advanceCommitted(T, REFEREE), await resumed.interpreter.advanceCommitted(T, REFEREE)];
    const recreated = committedInterpreter(resumed.ledger);
    resumedResults.push(await recreated.interpreter.advanceCommitted(T, REFEREE));

    const stableFacts = (facts: readonly { kind: string; payload: Record<string, unknown> }[]) =>
      facts.map(({ kind, payload }) => ({ kind, payload: kind === "secretRoll.committed" ? { ...payload, seedCommitmentFactId: "<seed>" } : payload }));
    expect(stableFacts(resumed.ledger.all())).toEqual(stableFacts(uninterrupted.ledger.all()));
    expect(resumedResults.flatMap((result) => result.commitmentPreimages.draws)).toEqual(
      uninterruptedResults.flatMap((result) => result.commitmentPreimages.draws),
    );
  });

  it("does not create secret commitments for the table-scoped oracle path", async () => {
    const oracleScript: PhaseScript = {
      frame: "oracle-public-fixture",
      start: "oracle",
      steps: [{ id: "oracle", kind: "oracle", oracle: { question: "Is the door watched?", likelihood: "even" }, next: "oracle" }],
    };
    const ledger = createLedger(createKindRegistry(KINDS_V0));
    const interpreter = createPhaseInterpreter(ledger, loadPhaseScript(oracleScript), {
      rng: createRng("oracle-seed"),
      deck: [],
      commitReveal: { campaignSeed: "oracle-seed", campaignSalt: "oracle-salt" },
    });

    const result = await interpreter.advanceCommitted(T, REFEREE);

    expect(ledger.all().filter((fact) => fact.kind === "oracle.answered")).toHaveLength(1);
    expect(ledger.all().filter((fact) => fact.kind === "secretRoll.committed")).toHaveLength(0);
    expect(result.commitmentPreimages.draws).toHaveLength(0);
  });

  it("commits market/world referee draws through the interpreter with one companion per tick", async () => {
    const { ledger, interpreter } = committedInterpreter();

    const result = await interpreter.commitMarketTicks({
      t: T,
      activeHexes: ["Regina"],
      goods: [
        { id: "ore", basePrice: 100 },
        { id: "parts", basePrice: 200 },
      ],
      priorPrices: {},
    });

    expect(result.committed.filter((fact) => fact.kind === "market.tick")).toHaveLength(2);
    expect(result.committed.filter((fact) => fact.kind === "secretRoll.committed")).toHaveLength(2);
    expect(result.commitmentPreimages.draws).toHaveLength(2);
    expect(ledger.all().filter((fact) => fact.kind === "campaign.seedCommitted")).toHaveLength(1);
  });
});
