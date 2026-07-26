# Session handoff — 2026-07-26 — M3 opened

**Read this if you are picking up M3.** Not a per-task handoff: the two-tier method replaced those
with PROJECT.md one-liners (see the 2026-07-25 adoption entry). This is a session-state document —
where the board stands, what was decided, and what bites next.

Everything below is already committed. Nothing is pushed.

---

## Where the board is

M3-00 through M3-03 are `done`. M3-02 is the only `ready` packet. Everything else is `blocked`
on real dependencies.

| Card | Status | Notes |
|---|---|---|
| M3-00 | done | Design doc `docs/design/travel-and-import-v1.md`, gates every other M3 packet |
| M3-01 | done | Hex parsing and parsec distance, Haiku, first attempt |
| M3-02 | **ready** | SEC parser. Haiku-routed. Next dispatch. |
| M3-03 | done | Plugin API: `TravelModel`, `Ship`, `CrewMember`, `CharacterSchema`, `EdgeDef` |
| M3-04..M3-12 | blocked | |

Backlog `ready`: BL-05, BL-06, BL-07, BL-08, BL-11, and BL-02 (device-blocked — the owner has no
iPhone; do not close it from caniuse or optimism, per the card's own guard).

Board command is unchanged: `grep -i status docs/tasks/*.md`.

---

## Commits this session

```
3e1761c feat(m3-01): Traveller hex parsing and parsec distance
1726b2e test(m3-01): acceptance tests for Traveller hex distance (red, at dispatch)
1ceb0b3 feat(m3-03): plugin API gains TravelModel, Ship, and character contracts
b94eb67 docs(process): cap test scope in CLAUDE.md
```

Gate at `3e1761c`, each command run separately with its own exit code: `pnpm test` 448/448,
`typecheck`, `lint`, `build:stub`, `lint:content` all clean.

---

## Decisions that constrain later packets

All are in PROJECT.md too; repeated here because they are the ones most likely to be
re-litigated by someone who did not make them.

**`JumpValidation` is an extrapolation.** Spec §15 names the type and never defines it. It is now a
discriminated union on `outcome` with an explicit `unknown-distance` arm, so a jump checked against
an unloaded sector answers "I cannot tell" rather than a bare `false`. M3-06 inherits this. Do not
collapse the arm — that is the same silently-plausible failure the trust-mode work exists to fix.

**`Distance` is two-state in the plugin API and stays that way.** travel-and-import-v1 §4's three
states (charted / trusted / uncounted) are a **render-layer** type. The trusted/uncounted
distinction is whether the table supplied a count, which arrives at `renderFeed` and never reaches
the plugin; a plugin with no sector data cannot tell them apart and must not be asked to. M3-05 is
amended: it defines the three-state union in `feed.ts` and re-declares `FeedDistance` as an alias
of the engine's `Distance` rather than keeping a second independent copy.

**`'unknown'` at M3-01 means "unparseable", not "absent from data".** No loaded sector data exists
until M3-02/M3-04. Sector *membership* layers on in M3-06, when the `TravelModel` is assembled and
has something to consult.

**No Traveller vocabulary in `packages/engine`.** UPP stats and named skills live behind
`CharacterSchema` as plugin-supplied descriptors. Only `parsecs` survives in engine code, and only
because Spec §15 writes it into the interface.

**`hex.ts` deliberately does not import the engine's `Distance`.** It declares `number | "unknown"`
inline. The card requires the module need nothing from the engine, and a workspace dependency would
move `plugin-traveller` in the `tsc --build` graph. Structural typing makes them compatible; M3-06
proves conformance when it assembles a `TravelModel`. The duplication is intentional — do not
"fix" it.

---

## Three traps, each of which already cost time

**1. The INV-1 guard matches comments, not just imports.** `scripts/build-stub.mjs` scans
`packages/engine/src` for the Traveller plugin's package name as a raw string. A doc comment
mentioning it fails `build:stub` with no import present. Reword the prose; do not loosen the guard
— the bluntness is what makes it hard to evade. There is a warning comment in
`plugin-api/character.ts`.

**2. `pnpm typecheck` goes red workspace-wide while a packet is out.** Committing acceptance tests
red means the test file imports a module that does not exist yet, and `typecheck` covers all eight
packages. This is what the method asks for, not a regression. Say so in the dispatch commit message
so a later reader does not misattribute it. It is also the reason M3-03 got no red commit: it had
no worker, so the red step had no purpose and would only have broken the gate for everyone else.

**3. Return types are covariant, so an implementation cannot be forced to widen.** An implementation
whose `distance` returns only `number` *is* legitimately assignable to one declared
`number | 'unknown'` — a plugin that always knows the distance is a valid plugin. The `'unknown'`
arm is enforced at the **call site**. An assertion attempting the opposite was written, caught by
`tsc` as an unused `@ts-expect-error`, and removed rather than weakened; the reasoning is left in
`plugin-api.test.ts` so it is not re-attempted.

---

## Next action

Dispatch **M3-02** (SEC sector-file parser, Haiku). The dispatch sequence that worked for M3-01:

1. Read the card and settle anything a worker would otherwise have to infer. Amend the card in
   writing — the worker reads the card and the tests, nothing else.
2. Add any dependency the packet needs **yourself**. Dependencies are forbidden to workers, so
   omitting one makes the worker's first action a forced escalation. (M3-01 needed `fast-check` in
   `packages/plugin-traveller`.)
3. Author the acceptance tests, commit them red, and **verify the failure reason is the intended
   one** — for M3-01 it was `Failed to load url ./hex.js`, not a vitest-config or tsconfig miss.
4. Dispatch with the exact public surface written out, the owned path, and the read-only files
   named explicitly.
5. On return, verify independently. The worker's report is not evidence.

Two amendments M3-02 needs before dispatch, both already implied by decisions above: its fixture
is **fictional** (no third-party map data in the repo, ever — travel-and-import-v1 §1.1), and it
should reuse `parseHex` from M3-01 rather than re-validating hexes itself.

---

## On verifying worker output

M3-01's acceptance tests were lead-authored, so they pass by construction — a worker that satisfies
them has satisfied the lead's model of the problem, which is not the same as being correct. The
check that actually carried weight was cross-checking the implementation against travellermap's
reference `Astrometrics.HexDistance` over 197,120 pairs spanning the full 32×40 sector: zero
mismatches, from a genuinely independent derivation (the worker used offset-q → cube coordinates;
the reference uses a direct offset formula).

Worth repeating wherever an external reference implementation exists. It is cheap and it is the
only step in the review that could have found an error the test author shared with the implementer.

---

## Housekeeping

- Untracked and left alone: `docs/.telemetry-engine-spec.md.swp` (a vim swap file, someone's editor
  state) and nine timestamped PNGs in `docs/img/` (rejected BL-01 generation batches, safe to
  delete — noted 2026-07-25, still there).
- Method metrics so far, one data point: 1 packet dispatched, first-pass success, zero escalations,
  zero frontier intervention after dispatch.
