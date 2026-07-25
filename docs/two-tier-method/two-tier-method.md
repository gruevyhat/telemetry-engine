# Two-Tier Contract Development

A minimal methodology for running a medium software project with a frontier LLM as
technical lead and SLMs as implementation workers. Optimized for adoption and token
cost, not completeness. Everything not listed here is deliberately omitted until the
project demonstrates it needs it.

## Roles

**Human (you).** Product intent, priorities, milestone acceptance, security/compliance
policy, release authorization. You do not assign files or supervise implementation.

**Frontier lead.** Architecture, decomposition into packets, and — critically —
authoring the acceptance tests for every packet before dispatch. Produces contracts
and decisions, not implementation code.

**Frontier integrator.** A separate fresh context of the same model. Reviews diffs,
resolves escalations, merges. No agent approves work from the context that produced it.

**SLM workers (start with 2–3, not 8).** Implement one packet at a time in an isolated
worktree. May not touch anything outside the packet. Scale worker count only after
integration stops being the bottleneck — with overlapping paths it will be.

**CI.** Deterministic arbiter. Nothing reaches review without passing it.

## The one structural fix that matters

**The lead writes the acceptance tests, the worker makes them pass.**

Workers never author or modify the tests that gate their own work. The test file *is*
the contract; the prose acceptance criteria are commentary. Workers may add extra
tests, but the lead-authored suite is read-only to them (enforce via owned_paths).
This closes the grade-your-own-homework loop and is the cheapest quality control in
the whole system.

## Repository as memory

Three files plus a task directory. Conversation history is never project state.

- `PROJECT.md` — objective, current milestone, constraints, non-goals, decisions log
  (one line per decision: date, decision, why). Split out ARCHITECTURE.md or ADRs
  only when this file exceeds ~2 pages or a decision gets relitigated.
- `AGENTS.md` — build/test commands, layout, conventions, forbidden operations,
  escalation format. Keep under one page; every line here is paid on every task.
- `tasks/T-NNN.yaml` — the backlog. **The board is the task files.** Each has a
  `status` field; the "board" is `grep status tasks/*.yaml`. No external tool.

## Board states (5, not 8)

```
ready → working → review → done
              ↘ escalated → (lead resolves → re-dispatch as amended/new packet,
                             or lead absorbs the task itself)
```

Escalation is not a terminal state. The lead must resolve every escalation into one
of exactly two outcomes: amend the packet and re-dispatch, or reclassify the task as
frontier work. Track which one — it's your decomposition-quality signal.

## The work packet

One reviewable outcome, one worker, one worktree, one commit.

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
acceptance_tests: tests/orders/test_cancellation.py   # LEAD-AUTHORED, read-only to worker
verification:
  - pytest tests/orders/test_cancellation.py
  - mypy src/orders && ruff check src/orders
non_goals: [refunds, admin cancellation, schema changes]
attempts_max: 2
status: ready
```

**Dispatch gate (30 seconds, do not skip):** before setting `status: ready`, the lead
answers one question — *"Can a worker complete this from read_context and the tests
alone?"* If no, the packet is not ready. This catches most bad decompositions before
they cost worker tokens and integrator patience.

**Worker report:** task id, result, commit hash, verification output, assumptions,
risks. No narrative.

## Authority boundaries (non-negotiable)

Workers may not: change public interfaces, add dependencies, alter schemas, modify
tests in `acceptance_tests`, touch CI config, auth code, or secrets, expand packet
scope, or merge. Hitting any of these → escalate with location, reason, and 1–2
proposed options.

## Routing rule

```
Local + explicit + testable                → SLM
Cross-cutting + ambiguous + consequential  → frontier
Failed twice under an SLM                  → frontier, permanently
```

## Token discipline

- Pull context, never push. Packet + AGENTS.md + read_context + repo search. Nothing else.
- Integrator reads packet, diff, report, CI output. Full files only when the diff
  raises a question.
- Two attempts, then escalate. No open-ended repair loops.
- After any design discussion, persist the decision line in PROJECT.md; discard the
  transcript.

## Milestones

Milestones are user-visible capability ("a user can create, inspect, cancel, and
audit an order"), decomposed into vertical slices by the lead. Dependencies form a
DAG; only packets with integrated dependencies go ready. Milestone close-out: run
the end-to-end suite, integrator does one conformance pass, human accepts.

## Metrics (6, reviewed weekly)

1. First-pass CI success rate
2. Escalation rate (and resolution split: amended vs reclassified)
3. Integrator rejection rate
4. Frontier tokens per accepted packet
5. Total cost per accepted packet
6. % of packets completed by SLMs

**Leading indicator:** frontier intervention per accepted packet. Rising = decomposition,
architecture clarity, or SLM fit is degrading. Find which before adding process.

## Prove the economics before scaling

Run a two-week pilot: ~10 packets through this system vs. the same work done
frontier-only with prompt caching. Compare cost per accepted packet and defect rate.
If the two-tier split doesn't win on cost at acceptable quality, the SLM tier isn't
earning its complexity — drop it and keep the contract/review structure with one model.
The methodology is the contract discipline; the model split is a cost hypothesis to test.

## Deliberately omitted until needed

Specialized reviewer personas, ADR directories, story points, utilization tracking,
more than 3 workers, any board tooling beyond grep. Add each only when its absence
causes a concrete, recurring failure — and write the one-line decision when you do.
