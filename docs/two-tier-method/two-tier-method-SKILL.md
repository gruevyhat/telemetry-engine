---
name: two-tier-method
description: Load when decomposing a milestone into work packets, authoring acceptance tests for dispatch, resolving an escalation, or running milestone close-out. Defines the packet contract, dispatch gate, quality gates, and metrics for the two-tier (frontier lead + worker) development method. Not needed for routine review turns — your operating-contract file covers those.
---

# Two-Tier Contract Development — Methodology

Reference for the frontier lead. Your operating-contract file carries the every-turn
spine (roles, routing, board, escalation format); this skill carries the procedures
you need only when decomposing, dispatching, or resolving. Written to work the same
way regardless of which concrete lead/worker pair your session runs under — it never
needs to name one.

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
fix the decomposition, don't fix it later through escalations. Optionally have a local
pre-flight model lint the packet for missing paths, ambiguous objectives, or
untestable criteria before you look at it.

## Dispatching a worker subagent

A dispatched worker runs in this repo's working directory, so the harness auto-loads
your session's operating-contract file into the worker's context too, regardless of
what the dispatch prompt says — the same way it auto-loaded for you as lead. That
file's lead/integrator role description says that role "does not write implementation
code," which directly contradicts what a worker is dispatched to do — and its
role-resolution fallback resolves an unstated role to the *lead* side, so an unpinned
worker doesn't just risk confusion, it is contractually pointed away from the very
implementation it was dispatched for. The worker role exists only where the dispatch
prompt explicitly assigns it.

State the role explicitly, at the top of every dispatch prompt, before any task
detail — and if your operating-contract file defines named role tokens, use its
exact worker token, because a resolution rule that demands "exactly one of those
roles" is not satisfied by the bare word "worker":

> Your role for this task is <the worker-role token your operating-contract file
> names; otherwise "the worker">, not the lead or integrator described elsewhere in
> your operating-contract file. Disregard any text there that says you do not write
> implementation code — for this dispatch, you do.

This is a no-op when the ambiguity doesn't bite and a real fix when it does; always
include it. You know the concrete token at dispatch time even though this skill
does not; never substitute a worker identity from a different lead/worker pairing
than the one this session actually runs under.

## What routes to the worker

Tests for existing behavior, CRUD, data transformations, serialization/validation,
adapters around stable interfaces, boilerplate, localized fixes with known root
cause, doc generation from code, mechanical refactors, fixtures, implementing a
predesigned interface, straightforward UI components.

## What stays with you

Architecture, requirements clarification, public API design, data-model changes,
cross-service changes, auth, security-sensitive or performance-critical code,
concurrency, hard debugging, dependency selection, migrations, integration
conflicts — and anything the worker failed twice.

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
6. % of packets completed by the worker

Leading indicator: frontier intervention per accepted packet. Rising = decomposition
quality, architecture clarity, or worker fit degrading. Diagnose before adding process.

## Economics check

The model split is a cost hypothesis, not doctrine. Pilot ~10 packets against a
frontier-only baseline with caching. If the worker tier doesn't win on cost per
accepted packet at acceptable quality, drop the tier and keep the contract discipline.

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
