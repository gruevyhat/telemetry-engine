import type { AccessPrecondition } from "../evidence/evidence.js";
import type { AppendInput } from "../ledger/ledger.js";
import type { ActorRef, Fact } from "../ledger/types.js";
import type { Rng } from "../rng/index.js";
import type { GameTime } from "../time/index.js";
import type { ImpliesRule } from "../validate/closure.js";
import { consistentActors } from "../validate/closure.js";
import type { ValidationFailure } from "../validate/validate.js";
import { compose, type SlotTables, type SurfaceDescriptor } from "./compose.js";

/**
 * [Spec §8.2, §19 balance lint: "every evidence trail entry has an access precondition"; M1-11a]
 * `access` reuses evidence.ts's own AccessPrecondition rather than a separate frame-content type,
 * since it's the exact same "can this actor even look" gate §10.1's evidence queries already
 * evaluate -- an evidence trail entry that skipped it would describe evidence a scene could
 * surface with no access check at all, which is the thing §10.1 exists to prevent.
 */
export interface EvidenceTrailEntry {
  readonly id: string;
  readonly description: string;
  readonly access: AccessPrecondition;
}

/** One referee-scoped cause fact the innocent twin produces. `tables` must include an "actor"
 * axis; its chosen entry id becomes the fact's actor (see actorRefFromId). */
export interface CauseFactSpec {
  readonly kind: string;
  readonly tables: SlotTables;
}

export interface IncidentFrame {
  readonly id: string;
  readonly pillar: string;
  readonly surfaceTables: SlotTables;
  /** [M1-11a, Spec §10.2] Forward-looking: which agenda action, if any, would claim this frame
   * instead of the innocent twin instantiating. No Agenda/AgendaAction type exists yet (§10.2's
   * machinery is M2) and nothing reads this field today -- it exists so content authored now
   * doesn't need reshaping once claiming lands, per this task's own "claimant field" Done-when.
   * There is still deliberately no traitorAction field: unlike claimant (a reference content can
   * carry inertly), a real traitor-action *effect* needs the M2 machinery to mean anything. */
  readonly claimant?: { readonly agendaActionId: string };
  readonly innocentTwin: readonly CauseFactSpec[];
  readonly evidenceTrail: readonly EvidenceTrailEntry[];
  readonly confrontationScene?: string;
  readonly clockEffect?: { readonly clockId: string; readonly delta: number };
  readonly cooldownWeeks: number;
}

export interface FiredIncident {
  readonly frameId: string;
  readonly surface: SurfaceDescriptor;
  readonly causeProposals: readonly AppendInput[];
}

function actorRefFromId(id: string): ActorRef {
  const prefix = id.split(":")[0];
  if (prefix === "pc" || prefix === "npc" || prefix === "world" || prefix === "referee") {
    return { kind: prefix, id };
  }
  return { kind: "npc", id };
}

/**
 * [Spec §8.2] "When a frame fires, the engine resolves cause... Identical surface descriptor
 * either way; only referee-scoped cause facts differ." RNG streams are named from committed
 * context (frame id + day/slot), never from interpreter-lifetime state, so firing replays
 * byte-identical regardless of how many other frames fired first or whether the interpreter
 * was recreated mid-script (Spec §6, INV-2/3).
 */
export function fireFrame(frame: IncidentFrame, t: GameTime, rng: Rng): FiredIncident {
  const surface = compose(frame.surfaceTables, rng.derive(`compose:${frame.id}:surface:${t.day}:${t.slot}`)).surface;

  const causeProposals: AppendInput[] = frame.innocentTwin.map((spec, index) => {
    const stream = rng.derive(`compose:${frame.id}:twin:${index}:${t.day}:${t.slot}`);
    const composed = compose(spec.tables, stream);
    return { t, kind: spec.kind, actor: actorRefFromId(composed.chosen.actor), payload: composed.factBundle.fields };
  });

  return { frameId: frame.id, surface, causeProposals };
}

/**
 * [Spec §9 pass 5, INV-10] The ambiguity gate M1-04 explicitly left unwired: a cause fact must
 * not uniquely implicate one actor once its implies closure is run over the visible set. The
 * cause fact's own actor is always trivially consistent, so a healthy incident has >=2 -- a
 * count of exactly 1 is the violation this gate exists to catch; 0 would mean the closure
 * engine and the fixture disagree about the ground truth, which should also never happen for a
 * well-formed twin, so this gate only distinguishes "ambiguous" (>=2) from "not" (<2).
 */
export function checkIncidentAmbiguity(causeFact: Fact, rule: ImpliesRule, visibleFacts: readonly Fact[]): ValidationFailure | undefined {
  const actors = consistentActors(rule, causeFact, visibleFacts);
  if (actors.size < 2) {
    return {
      pass: "ambiguity",
      message: `cause fact "${causeFact.kind}" has ${actors.size} consistent actor(s) (${[...actors].join(", ")}) -- INV-10 requires at least 2`,
    };
  }
  return undefined;
}

/** [Spec §8.3] Per-frame cooldowns and a recurrence counter (§21.4's balance telemetry). */
export interface CooldownState {
  readonly readyAtWeek: Readonly<Record<string, number>>;
  readonly fireCount: Readonly<Record<string, number>>;
}

export const initialCooldownState: CooldownState = { readyAtWeek: {}, fireCount: {} };

export function isOnCooldown(state: CooldownState, frameId: string, currentWeek: number): boolean {
  return (state.readyAtWeek[frameId] ?? 0) > currentWeek;
}

export function recordFired(state: CooldownState, frame: IncidentFrame, currentWeek: number): CooldownState {
  return {
    readyAtWeek: { ...state.readyAtWeek, [frame.id]: currentWeek + frame.cooldownWeeks },
    fireCount: { ...state.fireCount, [frame.id]: (state.fireCount[frame.id] ?? 0) + 1 },
  };
}

export interface WeightedFrame {
  readonly frame: IncidentFrame;
  readonly weight: number;
}

/**
 * [Spec §8.3] "Composer filters, then weight-decays if the pool thins." Frames off cooldown are
 * filtered in at full weight; if that leaves fewer than minPoolSize, cooling frames re-enter at
 * a reduced weight rather than the pool running dry.
 */
export function eligibleFrames(frames: readonly IncidentFrame[], state: CooldownState, currentWeek: number, minPoolSize = 1): readonly WeightedFrame[] {
  const ready = frames.filter((f) => !isOnCooldown(state, f.id, currentWeek)).map((f) => ({ frame: f, weight: 1 }));
  if (ready.length >= minPoolSize) {
    return ready;
  }
  const cooling = frames.filter((f) => isOnCooldown(state, f.id, currentWeek)).map((f) => ({ frame: f, weight: 0.25 }));
  return [...ready, ...cooling];
}
