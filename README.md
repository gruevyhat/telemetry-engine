# Telemetry Engine

Telemetry Engine is a GM-less, event-sourced tabletop game referee. It runs entirely
in the browser — TypeScript, static-hosted, no backend — and uses a Traveller-setting
plugin as its first content pack.

The load-bearing idea is the **Fact Ledger**: an append-only, visibility-scoped log of
facts that everything else in the system reads from, proposes to, or scopes a view
over. Verisimilitude is implemented as referential integrity against that ledger;
deduction gameplay is visibility scoping over it; the "black box" (MAGGIE, the in-fiction
referee voice) is a formatting pass over the full ledger.

Full authoritative documentation lives in `docs/`:

- **[the Spec](docs/telemetry-engine-spec.md)** — what to build. Every load-bearing
  module has a contract, numbered invariants (`[INV-1]`–`[INV-14]`), a *Why*, and a
  worked example.
- **[the Plan](docs/telemetry-engine-dev-plan.md)** — how the project works: roles,
  branching, the TDD loop, the PR gate.
- **[the rulebook](docs/telemetry-engine-rulebook.md)** — the player-facing experience.
- **`docs/design/`** — the fact-kind catalog, sim-bot policies, and the MAGGIE voice
  guide for any player-visible text.
- **`docs/tasks/`** — one card per unit of work, milestone-numbered (`M0-*`, `M1-*`, ...).

If you are an implementing session (human or LLM) working in this repo, start with
`CLAUDE.md` at the repo root — it's the distilled session protocol.

## Repository layout

```
telemetry-engine/
├── packages/
│   ├── engine/            # 100% owned IP. Zero setting content, zero Traveller terms.
│   │   ├── ledger/  phases/  clocks/  rng/  time/  oracle/
│   │   ├── economy/  generate/  validate/  render/  evidence/
│   │   ├── agenda/  legends/  npc/  engagement/  degrade/
│   │   └── plugin-api/
│   ├── plugin-traveller/  # Fair Use Policy layer over Mongoose Publishing's Traveller
│   ├── ui-shared/  ui-phone/
│   ├── content-lint/      # lints player-visible content against the MAGGIE voice guide
│   └── sim/               # headless campaign simulation for balance testing
├── content/               # frames, incident decks, agenda decks, slot tables, phase scripts
└── LICENSE.engine / LICENSE.content / NOTICE.traveller
```

`packages/engine` is the owned IP: it must build and pass its full test suite with
`plugin-traveller` deleted (`[INV-1]`), which is enforced in CI. It never imports from
`plugin-traveller/` or `content/`.

## Getting started

```
pnpm install
pnpm test              # unit + property + snapshot suite
pnpm test:integration   # phase-script fixtures
pnpm test:e2e           # Playwright smoke against a built Pages bundle
pnpm lint               # eslint, including engine-specific invariant rules
pnpm lint:content       # lints content/ against the MAGGIE voice guide
pnpm sim:smoke          # 50-campaign headless simulation
pnpm build:stub         # builds engine + a stub plugin (INV-1 check)
pnpm build:pages        # builds the shared-screen GitHub Pages artifact
pnpm demo:m0            # serves that built artifact for the M0 walkthrough
```

Requires Node >=20 and pnpm. See `docs/telemetry-engine-dev-plan.md` §3 for the full
command reference.

## License

This repository separates licensing along the same line as its IP boundary:

- **Engine code** (`packages/engine`, `packages/ui-shared`, `packages/ui-phone`,
  `packages/content-lint`, `packages/sim`) is licensed under the **MIT License** — see
  [`LICENSE.engine`](LICENSE.engine).
- **Game content** (`content/`: frames, incident decks, agenda decks, phase scripts)
  is licensed under **CC BY-NC-SA 4.0** (attribution, non-commercial, share-alike) —
  see [`LICENSE.content`](LICENSE.content).
- **`packages/plugin-traveller`** is a Fair Use Policy compatibility layer over
  Mongoose Publishing's Traveller game. It carries its own disclaimer
  (`NOTICE.traveller`, also pending M0-00) and must not be distributed until that
  notice lands. Telemetry Engine is a non-commercial fan work; the Traveller game in
  all forms is owned by Mongoose Publishing.
