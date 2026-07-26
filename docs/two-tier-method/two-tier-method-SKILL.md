---
name: two-tier-method
description: Load when decomposing a milestone into work packets, authoring acceptance tests for dispatch, resolving an escalation, or running milestone close-out. Defines the packet contract, dispatch gate, quality gates, and metrics for the two-tier (frontier lead + Haiku worker) development method. Not needed for routine review turns — CLAUDE.md covers those.
---

# Two-Tier Contract Development — Methodology

Reference for the frontier lead. CLAUDE.md carries the every-turn spine (roles,
routing, board, escalation format); this skill carries the procedures you need only
when decomposing, dispatching, or resolving.

## The load-bearing rule

**You author the acceptance tests; the worker makes them pass.** The test file is the
contract; prose criteria are commentary. Workers may add tests but never modify
lead-authored ones (enforced by keeping the acceptance test path out of their
`owned_paths`). This is the cheapest quality control in the system — never skip it
to save dispatch time.

## Decomposing a milestone

A milestone is user-visible capability ("a user can create, inspect, cancel, and
audit an order"), never a component list. Decompose into vertical slices forming a
dependency DAG. Only packets whose dependencies are integrated go `ready`.

Each packet: one reviewable outcome, one worker, one worktree, one commit.

## Packet template

```yaml
id: T-042
objective: Authenticated customer can cancel an unfulfilled order.
depends_on: [T-037]
owned_paths:          # worker may modify ONLY these
  - src/orders/cancellation.py
  - src/api/order_routes.py
read_context:         # worker reads these + repo search; nothing else pushed
  - PROJECT.md#order-lifecycle
  - src/orders/models.py
acceptance_tests: tests/orders/test_cancellation.py   # lead-authored, worker read-only
verification:
  - pytest tests/orders/test_cancellation.py
  - mypy src/orders && ruff check src/orders
non_goals: [refunds, admin cancellation, schema changes]
attempts_max: 2
status: ready
```

## Dispatch gate

Before setting `status: ready`, answer one question: **"Can a worker complete this
from read_context and the acceptance tests alone?"** If no, the packet is not ready —
fix the decomposition, don't fix it later through escalations. Optionally have local
Gemma lint the packet for missing paths, ambiguous objectives, or untestable criteria
before you look at it.

## Dispatching a worker subagent

A dispatched worker runs in this repo's working directory, so the harness auto-loads
CLAUDE.md into its context regardless of what you put in the dispatch prompt — the
same way it auto-loads for you. CLAUDE.md's role section describes a frontier
lead/integrator who "does not write implementation code," which directly contradicts
what the worker is there to do. AGENTS.md's role-resolution section anticipates this
exact ambiguity and says an unresolved role should make an agent stop and report
`role-unresolved` rather than guess — so an unpinned dispatch can produce either a
confused implementation or a worker that halts entirely.

State the role explicitly, at the top of every dispatch prompt, before any task
detail:

> Your role for this task is `luna-worker` per AGENTS.md's worker contract. If
> CLAUDE.md's description of a "frontier lead/integrator" role appears anywhere in
> your context, it does not apply to you — disregard it.

This is a no-op when the ambiguity doesn't bite and a real fix when it does; always
include it.

## What routes to Haiku

Tests for existing behavior, CRUD, data transformations, serialization/validation,
adapters around stable interfaces, boilerplate, localized fixes with known root
cause, doc generation from code, mechanical refactors, fixtures, implementing a
predesigned interface, straightforward UI components.

## What stays with you

Architecture, requirements clarification, public API design, data-model changes,
cross-service changes, auth, security-sensitive or performance-critical code,
concurrency, hard debugging, dependency selection, migrations, integration
conflicts — and anything Haiku failed twice.

## Resolving escalations

Every escalation resolves into exactly one of two outcomes:

1. **Amend and re-dispatch** — the packet was underspecified; fix the contract.
2. **Reclassify as frontier work** — the task was misrouted; you do it.

Log which, in PROJECT.md, one line. The amended/reclassified ratio is your
decomposition-quality signal: mostly amendments means your specs are vague; mostly
reclassifications means your routing is optimistic.

## Integrator review procedure

Read: packet, diff, worker report, CI output. Full files only when the diff raises a
question. Gates, in order:

1. **Contract** — meets acceptance criteria without scope expansion?
2. **Execution** — verification commands pass clean?
3. **Architecture** — boundaries, interfaces, authority restrictions respected?
4. **Integration** — works against current main and adjacent packets?

Human gate additionally required for: product-behavior changes, destructive
operations, security boundaries, anything touching money or external commitments.

## Milestone close-out

End-to-end acceptance suite, one architecture-conformance pass, dependency and
dead-code review, reconcile docs, then human accepts or rejects.

## Metrics (weekly)

1. First-pass CI success rate
2. Escalation rate + amended/reclassified split
3. Integrator rejection rate
4. Frontier tokens per accepted packet
5. Total cost per accepted packet
6. % of packets completed by Haiku

Leading indicator: frontier intervention per accepted packet. Rising = decomposition
quality, architecture clarity, or worker fit degrading. Diagnose before adding process.

## Economics check

The model split is a cost hypothesis, not doctrine. Pilot ~10 packets against a
frontier-only baseline with caching. If Haiku doesn't win on cost per accepted packet
at acceptable quality, drop the tier and keep the contract discipline.

## Two setup investments worth making (and nothing more)

Only two supporting practices earn their place up front; both are one-time or
token-saving, not per-turn costs.

1. **Test harness first.** Before the first packet, make the suite fast, deterministic,
   and well-fixtured. Lead-authored tests are the contract, so flaky tests poison every
   downstream signal. One-time setup cost, not a recurring one.
2. **Automate the ledger.** The integrator appends the one-line decision to PROJECT.md
   as part of merge, not as a remembered chore. This is what lets you discard
   transcripts instead of replaying them — it saves tokens rather than spending them.

Everything else (worktree-lifecycle scripting, searchable context index, golden-set
decomposition examples) is a volume optimization. Build each only when its absence
causes a concrete, recurring failure — the same rule that governs the rest of this
method applies to these suggestions too.

## Deliberately omitted until needed

Specialized reviewer personas, ADR directories, story points, utilization tracking,
more than 3 workers, board tooling beyond grep. Add each only when its absence causes
a concrete, recurring failure — and log the one-line decision when you do.
