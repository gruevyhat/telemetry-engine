import { derive, type Projection } from "../ledger/derive.js";
import { generateCommittedWeeklyTicks, type GenerateCommittedWeeklyTicksInput } from "../economy/market.js";
import { fireFrame, type IncidentFrame } from "../generate/frame.js";
import type { AppendInput, Ledger } from "../ledger/ledger.js";
import type { ActorRef, Fact } from "../ledger/types.js";
import { ask } from "../oracle/oracle.js";
import { degradeReportedProposal, runDegradeLadder, type DegradeOutcome } from "../degrade/index.js";
import {
  createCampaignSeedCommitment,
  createRecordedSecretDrawCommitment,
  type CampaignSeedPreimage,
  type Rng,
  type RngStream,
  type SecretDrawPreimage,
} from "../rng/index.js";
import type { GameTime } from "../time/index.js";
import type { LoadedPhaseScript } from "./load.js";
import type { PhaseStep, StepRef } from "./types.js";

export interface StepInput {
  checkTotal?: number;
  branchKey?: string;
}

export interface AdvanceResult {
  fromStep: StepRef;
  toStep: StepRef;
  committed: readonly Fact[];
  /** [M1-05, INV-12] Present only when this step fired an incident frame: a stub rendering of
   * its surface descriptor. Presentation only, never a fact — the real renderer is M1-09's. */
  rendered?: string;
}

/** [M1-05] What a "generate" step needs that a phase script alone doesn't carry. Optional on
 * createPhaseInterpreter so existing call sites (no generate steps) are unaffected. */
export interface PhaseInterpreterDeps {
  rng: Rng;
  deck: readonly IncidentFrame[];
  commitReveal?: {
    readonly campaignSeed: string;
    readonly campaignSalt: string;
  };
}

interface RecordedDraw {
  readonly streamId: string;
  readonly drawIndex: number;
  readonly result: number;
}

function recordingRng(base: Rng): { rng: Rng; drain: () => readonly RecordedDraw[] } {
  const records: RecordedDraw[] = [];
  const streams = new Map<string, RngStream>();

  function shouldCommit(streamId: string): boolean {
    return streamId.includes(":twin:");
  }

  return {
    rng: {
      derive(streamId) {
        let wrapped = streams.get(streamId);
        if (wrapped) return wrapped;
        const stream = base.derive(streamId);
        const draw = (): number => {
          const drawIndex = stream.drawCount;
          const result = stream.next();
          if (shouldCommit(streamId)) records.push({ streamId, drawIndex, result });
          return result;
        };
        wrapped = {
          name: stream.name,
          get drawCount() {
            return stream.drawCount;
          },
          next: draw,
          nextInt(maxExclusive) {
            return Math.floor(draw() * maxExclusive);
          },
        };
        streams.set(streamId, wrapped);
        return wrapped;
      },
    },
    drain() {
      return records.splice(0, records.length);
    },
  };
}

/** [INV-12] Stands in for M1-09's real MAGGIE-voice renderer: a plain key:value join of the
 * surface descriptor's fields, never parsed back into facts. */
function renderSurfaceStub(fields: Readonly<Record<string, string | number | boolean>>): string {
  return Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join(", ");
}

/** [Spec §17] Every degradation logs `degrade.reported`; rung 1/2 also carry the actual content
 * that fired (the twin's cause facts, or the oracle's own answer) so the ledger reflects what
 * really happened, not just that a degradation occurred. */
function degradeOutcomeProposals(t: GameTime, actor: ActorRef, outcome: DegradeOutcome): AppendInput[] {
  const proposals: AppendInput[] = [degradeReportedProposal(t, actor, outcome)];
  if (outcome.rung === "1") {
    proposals.push(...outcome.incident.causeProposals);
  }
  if (outcome.rung === "2") {
    proposals.push({
      t,
      kind: "oracle.answered",
      actor,
      payload: { question: outcome.oracle.question, likelihood: outcome.oracle.likelihood, answer: outcome.oracle.answer, texture: outcome.oracle.texture },
    });
  }
  return proposals;
}

/** Rung 4 has no line to speak (Spec §17: "pause, autosave, surface a recover/export screen" --
 * a UI concern, not voice) so it deliberately leaves AdvanceResult.rendered unset rather than
 * fabricating one. */
function degradeOutcomeRendered(outcome: DegradeOutcome): string | undefined {
  switch (outcome.rung) {
    case "1":
      return renderSurfaceStub(outcome.incident.surface.fields);
    case "2":
      return `${outcome.oracle.answer} (${outcome.oracle.texture})`;
    case "3":
      return outcome.line;
    case "4":
      return undefined;
  }
}

/**
 * [Spec §6, INV-2/3] Wraps an Rng so every stream name it produces is salted with committed
 * context (step id + how many times the ledger already shows this step being left), never with
 * anything tracked only in interpreter-lifetime memory. Without this, a bare stream name (e.g.
 * the oracle's fixed "oracle" stream) would resume at position 0 after a kill/recreate even
 * though the ledger already reflects N prior draws from it — diverging from an uninterrupted
 * run on the very next draw.
 */
function scopedRng(rng: Rng, salt: string): Rng {
  return { derive: (name: string) => rng.derive(`${salt}:${name}`) };
}

function priorVisitCount(ledger: Ledger, script: LoadedPhaseScript, stepId: StepRef): number {
  return ledger.all().filter((fact) => fact.kind === "phase.transition" && fact.payload.frame === script.frame && fact.payload.fromStep === stepId).length;
}

/** Where a script currently is: the toStep of its most recent phase.transition, else its start. */
export function currentStepProjection(script: LoadedPhaseScript): Projection<StepRef> {
  return {
    initial: script.start,
    apply(state, fact) {
      if (fact.kind !== "phase.transition" || fact.payload.frame !== script.frame) {
        return state;
      }
      return typeof fact.payload.toStep === "string" ? fact.payload.toStep : state;
    },
  };
}

export function currentStepOf(facts: readonly Fact[], script: LoadedPhaseScript): StepRef {
  return derive(facts, currentStepProjection(script));
}

interface ResolvedStep {
  nextStepId: StepRef;
  proposals: AppendInput[];
  rendered?: string;
}

function requirePlainNext(step: PhaseStep): StepRef {
  if (typeof step.next !== "string") {
    throw new Error(`step "${step.id}" (${step.kind}) must have a plain next step, not a branch table`);
  }
  return step.next;
}

/** Per-kind resolution. vote/confrontation UI+generation are out of scope (M0-07/M2) — steps just transition. */
function resolveStep(
  step: PhaseStep,
  t: GameTime,
  actor: ActorRef,
  input: StepInput | undefined,
  deps: PhaseInterpreterDeps | undefined,
  visitSalt: string,
): ResolvedStep {
  const literalProposals: AppendInput[] = (step.facts ?? []).map((fact) => ({ t, ...fact }));
  const resolved = (nextStepId: StepRef, proposals: AppendInput[] = [], rendered?: string): ResolvedStep => ({
    nextStepId,
    proposals: [...literalProposals, ...proposals],
    ...(rendered !== undefined ? { rendered } : {}),
  });

  switch (step.kind) {
    case "check": {
      const checkSpec = step.check;
      if (!checkSpec) {
        throw new Error(`step "${step.id}": missing check (should have been rejected at load)`);
      }
      if (input?.checkTotal === undefined) {
        throw new Error(`step "${step.id}": check requires input.checkTotal (Spec §6: the engine never rolls for a PC)`);
      }
      const nextStepId = input.checkTotal >= checkSpec.difficulty ? checkSpec.onSuccess : checkSpec.onFail;
      return resolved(nextStepId);
    }
    case "branch": {
      if (typeof step.next === "string") {
        throw new Error(`step "${step.id}": branch step must have a branch table for next`);
      }
      const branchKey = input?.branchKey;
      if (!branchKey || !(branchKey in step.next)) {
        throw new Error(`step "${step.id}": branch requires a valid input.branchKey`);
      }
      return resolved(step.next[branchKey]!);
    }
    case "tickClock": {
      const tick = step.tick;
      if (!tick) {
        throw new Error(`step "${step.id}": missing tick (should have been rejected at load)`);
      }
      return resolved(requirePlainNext(step), [
        { t, kind: "clock.tick", actor, payload: { clockId: tick.clockId, delta: tick.delta } },
      ]);
    }
    case "commsWindow":
      // batch-resolution stub — M2 fills it in (Spec §3.3's shuffled sequential resolution).
      return resolved(requirePlainNext(step));
    case "generate": {
      const gen = step.gen;
      if (!gen) {
        throw new Error(`step "${step.id}": missing gen (should have been rejected at load)`);
      }
      if (!deps) {
        throw new Error(`step "${step.id}": kind "generate" requires rng+deck (createPhaseInterpreter's deps argument)`);
      }
      const frame = deps.deck.find((candidate) => candidate.id === gen.frameId);
      if (!frame) {
        // [Spec §17, INV-14] "Composer exhaustion" for a frame-by-id generate step: the named
        // frame isn't available. Hand off to the degradation ladder instead of throwing --
        // there is no generic-family frame deck yet (M1-11b), so rung 1 always fails today too,
        // which is expected: the ladder still lands on rung 2 (the oracle, which is real) as an
        // actual playable step, rather than crashing the turn.
        const ladderRng = scopedRng(deps.rng, visitSalt);
        const outcome = runDegradeLadder({
          attemptGeneric: () => {
            // [M1-11b] Generic-family safety-net frames are content, distinguished by id
            // convention ("generic:") rather than a dedicated IncidentFrame field -- the same
            // deck a script's curated frames live in can carry them too.
            const generic = deps.deck.find((candidate) => candidate.id.startsWith("generic:"));
            if (!generic) {
              throw new Error(`no generic-family frame in the supplied deck to substitute for missing frame "${gen.frameId}"`);
            }
            return fireFrame(generic, t, scopedRng(deps.rng, `${visitSalt}:generic`));
          },
          attemptOracle: () => ask(`What happens instead of "${gen.frameId}"?`, "even", ladderRng),
        });
        return resolved(requirePlainNext(step), degradeOutcomeProposals(t, actor, outcome), degradeOutcomeRendered(outcome));
      }
      const fired = fireFrame(frame, t, scopedRng(deps.rng, visitSalt));
      return resolved(requirePlainNext(step), [...fired.causeProposals], renderSurfaceStub(fired.surface.fields));
    }
    case "oracle": {
      const oracleSpec = step.oracle;
      if (!oracleSpec) {
        throw new Error(`step "${step.id}": missing oracle (should have been rejected at load)`);
      }
      if (!deps) {
        throw new Error(`step "${step.id}": kind "oracle" requires rng (createPhaseInterpreter's deps argument)`);
      }
      const answered = ask(oracleSpec.question, oracleSpec.likelihood, scopedRng(deps.rng, visitSalt));
      return resolved(requirePlainNext(step), [
        { t, kind: "oracle.answered", actor, payload: { question: answered.question, likelihood: answered.likelihood, answer: answered.answer, texture: answered.texture } },
      ]);
    }
    case "announce":
    case "vote":
      return resolved(requirePlainNext(step));
    case "confrontation":
      throw new Error(`step "${step.id}": confrontation sub-script is not implemented until M2`);
  }
}

/** [Spec §12, M1-15] What a mid-beat check report (e.g. an interrogation's Persuade/Intimidate
 * roll) needs — the player supplies `total` (Spec §6: the engine never rolls for a PC); `effect`
 * is computed here rather than by the caller so every `check.reported` fact is consistent. */
export interface CheckReportInput {
  skill: string;
  dm: number;
  total: number;
  difficulty: number;
}

export interface PhaseInterpreter {
  currentStep(): StepRef;
  advance(t: GameTime, actor: ActorRef, input?: StepInput): AdvanceResult;
  advanceCommitted(t: GameTime, actor: ActorRef, input?: StepInput): Promise<AdvanceResult & { commitmentPreimages: CommitmentPreimages }>;
  commitMarketTicks(input: CommitMarketTicksInput): Promise<{ committed: readonly Fact[]; commitmentPreimages: CommitmentPreimages }>;
  queueCommsAction(action: Readonly<Record<string, unknown>>): void;
  /** [Spec §12, INV-6] A player-initiated action that isn't a beat transition (interrogating an
   * NPC, mid-beat) still must go through the interpreter to append a fact. Commits exactly one
   * `check.reported` fact and does not move `currentStep()`. */
  reportCheck(t: GameTime, actor: ActorRef, input: CheckReportInput): Fact;
}

export interface CommitmentPreimages {
  readonly seed?: CampaignSeedPreimage;
  readonly draws: readonly SecretDrawPreimage<number>[];
}

export type CommitMarketTicksInput = Omit<
  GenerateCommittedWeeklyTicksInput,
  "rng" | "campaignSeed" | "campaignSalt" | "seedCommitment"
>;

/**
 * [Spec §3.2, INV-6] The only ledger.append call site in the codebase. Holds no state of its
 * own beyond an in-memory, non-durable comms-action queue (Spec §3.3's real queue/shuffle is
 * M2) — currentStep() is always derived fresh from the ledger, so killing and recreating this
 * interpreter mid-script and calling advance() again produces the same facts as an
 * uninterrupted run: nothing survives a restart except what's already committed.
 */
export function createPhaseInterpreter(ledger: Ledger, script: LoadedPhaseScript, deps?: PhaseInterpreterDeps): PhaseInterpreter {
  let commsQueue: Record<string, unknown>[] = [];
  const recorder = deps?.commitReveal ? recordingRng(deps.rng) : undefined;
  const resolvedDeps = deps ? { ...deps, rng: recorder?.rng ?? deps.rng } : undefined;

  function currentStep(): StepRef {
    return currentStepOf(ledger.all(), script);
  }

  function advanceCore(t: GameTime, actor: ActorRef, input?: StepInput): AdvanceResult {
    const fromStep = currentStep();
    const step = script.stepsById.get(fromStep);
    if (!step) {
      throw new Error(`phase script "${script.frame}": current step "${fromStep}" not found`);
    }

    const visitSalt = `step:${fromStep}:${priorVisitCount(ledger, script, fromStep)}`;
    const { nextStepId, proposals, rendered } = resolveStep(step, t, actor, input, resolvedDeps, visitSalt);

    const committed: Fact[] = [];
    for (const proposal of proposals) {
      committed.push(ledger.append(proposal));
    }
    committed.push(
      ledger.append({
        t,
        kind: "phase.transition",
        actor,
        payload: { fromStep, toStep: nextStepId, frame: script.frame },
      }),
    );

    if (step.kind === "commsWindow") {
      commsQueue = [];
    }

    return { fromStep, toStep: nextStepId, committed, ...(rendered !== undefined ? { rendered } : {}) };
  }

  function advance(t: GameTime, actor: ActorRef, input?: StepInput): AdvanceResult {
    const step = script.stepsById.get(currentStep());
    if (step?.kind === "generate" && deps?.commitReveal) {
      throw new Error("generate steps with commit/reveal configured require await advanceCommitted()");
    }
    return advanceCore(t, actor, input);
  }

  async function ensureSeedCommitment(t: GameTime): Promise<{
    fact: Fact;
    committed: readonly Fact[];
    preimage?: CampaignSeedPreimage;
  }> {
    const context = deps?.commitReveal;
    if (!context) {
      throw new Error("committed random draws require commitReveal {campaignSeed, campaignSalt}");
    }
    const expected = await createCampaignSeedCommitment({ ...context, t });
    const existing = ledger.all().find((fact) => fact.kind === "campaign.seedCommitted");
    if (existing) {
      if (existing.payload.hash !== expected.hash || existing.payload.scheme !== expected.proposal.payload.scheme) {
        throw new Error("campaign seed commitment does not match the configured campaign seed/salt");
      }
      return { fact: existing, committed: [] };
    }
    const fact = ledger.append(expected.proposal);
    return { fact, committed: [fact], preimage: expected.preimage };
  }

  async function advanceCommitted(t: GameTime, actor: ActorRef, input?: StepInput): Promise<AdvanceResult & { commitmentPreimages: CommitmentPreimages }> {
    recorder?.drain();
    const seed = await ensureSeedCommitment(t);
    const result = advanceCore(t, actor, input);
    const records = recorder?.drain() ?? [];
    const drawFacts: Fact[] = [];
    const drawPreimages: SecretDrawPreimage<number>[] = [];
    for (const record of records) {
      const committed = await createRecordedSecretDrawCommitment({
        ...deps!.commitReveal!,
        ...record,
        seedCommitment: { factId: seed.fact.id, hash: seed.fact.payload.hash as string },
        t,
      });
      drawFacts.push(ledger.append(committed.proposal));
      drawPreimages.push(committed.preimage);
    }
    return {
      ...result,
      committed: [...seed.committed, ...result.committed, ...drawFacts],
      commitmentPreimages: { ...(seed.preimage ? { seed: seed.preimage } : {}), draws: drawPreimages },
    };
  }

  async function commitMarketTicks(input: CommitMarketTicksInput): Promise<{ committed: readonly Fact[]; commitmentPreimages: CommitmentPreimages }> {
    const seed = await ensureSeedCommitment(input.t);
    const context = deps!.commitReveal!;
    const plan = await generateCommittedWeeklyTicks({
      ...input,
      ...context,
      rng: deps!.rng,
      seedCommitment: { factId: seed.fact.id, hash: seed.fact.payload.hash as string },
    });
    const committed = ledger.appendAll(plan.proposals);
    return {
      committed: [...seed.committed, ...committed],
      commitmentPreimages: { ...(seed.preimage ? { seed: seed.preimage } : {}), draws: plan.preimages },
    };
  }

  function queueCommsAction(action: Readonly<Record<string, unknown>>): void {
    commsQueue.push(action);
  }

  function reportCheck(t: GameTime, actor: ActorRef, input: CheckReportInput): Fact {
    const effect = input.total - input.difficulty;
    return ledger.append({
      t,
      kind: "check.reported",
      actor,
      payload: { actor: actor.id, skill: input.skill, dm: input.dm, total: input.total, difficulty: input.difficulty, effect },
    });
  }

  return { currentStep, advance, advanceCommitted, commitMarketTicks, queueCommsAction, reportCheck };
}
