# M0 demo handoff — 2026-07-13

## Why this handoff exists

The owner is switching to another model while the new milestone-demo policy is being turned into the concrete M0 walkthrough. This file is the complete continuation point. Do not restart M0 implementation work and do not touch the generated artwork variants listed below.

## Branch and pushed baseline

- Branch: `milestone/M0`.
- `HEAD` and `origin/milestone/M0` are both `e12555f` (`docs: require a demo at every milestone`).
- The CI run for that pushed baseline, `29198183553`, passed both the main and content gates; deploy correctly skipped on the milestone branch.
- M0-01 through M0-10 are already committed and pushed. The next work is milestone demo/acceptance evidence, not another M0 implementation card.

## Uncommitted work in progress

These files belong to the M0 demo follow-up and are intentionally uncommitted:

- `docs/demos/M0.md` — new clean-checkout commands, five-minute walkthrough, pass criteria, and a pending run record.
- `package.json` — adds the approved wrapper `pnpm demo:m0`, which serves the already-built Pages artifact at `http://127.0.0.1:4173/telemetry-engine/`.
- `docs/telemetry-engine-dev-plan.md`, `AGENTS.md`, `CLAUDE.md`, `README.md` — add/synchronize the `pnpm demo:m0` command reference.
- `scripts/pages-smoke.mjs` — unverified follow-up patch that expands the built-bundle smoke from boot-only to the full M0 walkthrough and fixes preview-process cleanup. Details below.

Unrelated owner/generated assets remain untracked under `docs/img/` and must stay untouched. They include the timestamped raster variants, `art-01-cover.png`, `te-confrontation.svg`, `te-turn-flow.svg`, `te-wireframe-phone.svg`, and `te-wireframe-shared.svg`.

## Work completed this session

The draft `docs/demos/M0.md` now documents:

1. Clean-checkout install and gate commands.
2. `pnpm build:pages` followed by `pnpm demo:m0` for the interactive launch.
3. Zhan's hotseat handoff and private `agenda.actionTaken` check.
4. DOCKSIDE → COMMS → TRANSIT → ARRIVAL → DOCKSIDE advancement.
5. Public ticker checks for `cargo.loaded`, `jump.plotted`, and `sale.settled`.
6. Final `Cr169200` funds projection.
7. A run-record table that is still deliberately marked Pending.

The documented automated preflight was run successfully before the latest smoke-harness patch:

- `CI=true pnpm install --frozen-lockfile` — pass, lockfile already current.
- `pnpm test` — pass, 23 files / 69 tests.
- `pnpm test:integration` — pass, one full demo-turn integration test.
- `pnpm lint` — pass.
- `pnpm lint:content` — pass, one phase script and four announce templates valid.
- `pnpm build:stub` — pass.
- `pnpm build:pages` — pass.
- `pnpm test:e2e` — pass with the committed boot-only smoke: `pages smoke: built shared-screen demo booted under /telemetry-engine/`.

## Defect discovered during the interactive launch

Immediately after the passing `pnpm test:e2e`, `pnpm demo:m0` failed because port 4173 was still occupied. The committed smoke script killed its pnpm parent but left the Vite child process running.

- Orphan listener: PID `30352`, Node/Vite on `127.0.0.1:4173`.
- It was stopped explicitly with `kill 30352`.
- `lsof -nP -iTCP:4173 -sTCP:LISTEN` returned no listener at handoff time.

The working-tree patch to `scripts/pages-smoke.mjs` now:

- starts the preview in its own process group;
- terminates that group with SIGTERM, waits up to two seconds, then uses SIGKILL if necessary;
- clicks **I am Zhan** and verifies the private agenda fact is absent from the public ticker;
- advances through all four beats and checks the three public domain facts;
- verifies the final funds projection is `Cr169200`;
- fails on browser console/page errors;
- optionally writes `m0-dockside.png` and `m0-complete.png` when `PAGES_SMOKE_SCREENSHOT_DIR` is set.

This patch has **not been linted or run yet**. Do not mark the walkthrough passed until it is verified.

## Browser-tool status

The browser skill was read and attempted. The in-app browser connection failed before navigation with missing session sandbox metadata (`sandboxPolicy`). The user-facing fallback was stated explicitly. Use the repository's standalone `playwright-core`/Chrome path unless the in-app connection works in the next model's environment.

## Process/TDD caution

The orphaned-preview behavior is a defect in already-committed M0-10 code. The cleanup fix is currently only a working-tree patch; no genuine failing regression commit exists for it yet. Preserve honest tests-first history before committing the fix. A practical regression is to prove two consecutive smoke runs can bind the same port, which fails against `8bba453` because the first run leaves Vite alive and passes with the process-group cleanup. Do not describe a red commit that was not actually observed and committed.

## Exact next actions

1. Inspect `git diff` and preserve the current `scripts/pages-smoke.mjs` patch before arranging the regression test/Red commit for the orphaned-preview defect.
2. Add and run a regression that executes the smoke twice on the same port, confirm the second run fails for `EADDRINUSE`/port-in-use against the committed implementation, and commit that failing test separately.
3. Restore/apply the existing process-group cleanup and full-walkthrough patch.
4. Run `pnpm lint`, `pnpm build:pages`, then run `PAGES_SMOKE_SCREENSHOT_DIR=/private/tmp/telemetry-m0-demo pnpm test:e2e` with localhost/Chrome permission.
5. Immediately verify `lsof -nP -iTCP:4173 -sTCP:LISTEN` has no listener. Run `pnpm test:e2e` a second time to prove port reuse.
6. Run `pnpm demo:m0`; confirm it starts at `http://127.0.0.1:4173/telemetry-engine/`. If the in-app browser remains unavailable, the strengthened Playwright smoke is the interactive-equivalent evidence. Stop the preview cleanly afterward.
7. Review the two optional screenshots and browser-console result. Update `docs/demos/M0.md` Run record with the date, tested commit/working state, automated preflight pass, implementer walkthrough pass, browser console result, and observations. Leave **Owner milestone signoff** as Pending until the owner personally accepts it.
8. Run the full local gate after the final commit(s): `pnpm test`, `pnpm test:integration`, `pnpm lint`, `pnpm lint:content`, `pnpm build:stub`, `pnpm build:pages`, and `pnpm test:e2e`.
9. Stage only the M0 demo/harness/docs files plus this handoff. Do not stage `docs/img/` variants. Commit with honest Red/Green separation for the defect, push `milestone/M0`, and verify CI.

## Remaining M0 milestone blockers after this work

- Owner runs/accepts `docs/demos/M0.md`; implementer automation is evidence, not owner signoff.
- Spec §21.3's “scripted demo turn replays identically on two machines” still needs explicit second-environment evidence or an owner decision that the existing fresh-machine/property coverage satisfies it.
- The M0 retro must be written by the owner.
- Only after the demo, remaining acceptance evidence, and retro pass should the single `milestone/M0 → main` PR open.
