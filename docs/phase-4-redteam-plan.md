# Phase 4 — red team of the plan (gate 4)

Fresh-context subagent, find-problems framing, run against `docs/phase-4-plan.md`
at commit `8d4962d`. It read the plan, the spec, the gate-2 record, `CLAUDE.md`
and sixteen source files, and traced the ESLint rule into
`node_modules/@typescript-eslint` to confirm what it reports.

**Five findings, all verified against the code, all accepted. Two tasks were
graded Wrong and three Weak.** Every fix is applied in the task text itself
rather than in an appendix — a plan whose code is wrong in the task and right in
a footnote gets implemented from the task.

| Task | Grade | Fixed by |
| --- | --- | --- |
| T1 Registry passthrough | Weak | Reuse the file's own `app()` helper; add `npm run lint` to its gates |
| T4 Minesweeper window | **Wrong** | `default_size` on the registry row; exact-width E2E; `.xp-menu-dropdown` hook |
| T5 Solitaire rules | Weak | Build tuples positionally instead of casting |
| T12 Vendor js-dos/DOOM | Weak | `existsSync` imported in T9, where the file is created |
| T14 DOOM window | **Wrong** | Real start-menu selectors; arrow keys instead of Escape |
| T15 (new) | — | Bundle budget, which the plan never verified |

Tasks 2, 3, 7, 8, 9, 10, 13 graded Strong and are unchanged.

## Finding B — the one that would have shipped

**Minesweeper's registry row omitted `default_size`, so the window would have
had no size at all.**

Verified: `work_space.svelte:536-551` mounts every registered app with an
explicit `options: to_window_options(app, instance_id)`, and the comment there
states that registry components "deliberately do not declare their own `options`
default" because Svelte replaces a passed prop wholesale rather than merging it.
`to_window_options()` writes width/height only `if (app.default_size != null)`.
The row had no `default_size`, so:

1. the component's own `export let options = { ...window_size(...) }` never runs;
2. `Window.svelte:98-109` skips its clamp, because both dimensions are null;
3. `Window.svelte:435` renders `style:width="undefinedpx"` — invalid CSS, dropped
   silently, leaving the window to shrink-wrap its grid.

This is the D21 mechanism failing at precisely the point D21 was created to fix.
I had reasoned "the component sizes itself dynamically" without carrying through
that the component's default is discarded on the registry path — the same
substitution error as gate 2's invalidated spike, one level down.

**Worse, the E2E would probably not have caught it.** The test asserted only
`after.width > before.width` after switching to Expert; a shrink-wrapped
`before` is smaller than a correct `after`, so it passes by coincidence while
the wiring is broken. The reviewer flagged this explicitly and it is the reason
the test now asserts exact pixel widths (`9*16+20`, `30*16+20`) rather than a
comparison. Accepted in full.

## Finding A — lint rules apply to test files

`eslint.config.js:28-34` applies `no-unsafe-type-assertion: 'error'` to
`src/**/*.ts`, with no test exclusion; the reviewer confirmed enforcement by
finding three shipped tests that carry explicit disable comments for it. The
plan's `null as never` (T1, twice) and `as Game['tableau']` / `as
Game['foundations']` (T5) are all downcasts and would all be reported.

The sharpest part of the finding: `app_registry.test.ts:10-17` **already has**
an `app()` helper using `component: () => Promise.reject(...)`, which needs no
cast at all. The plan invented an unsafe pattern in the very file that already
contained the safe one. T1 also referenced `required()`, which that file does
not import.

Accepted. T1 now uses the existing helper, and `npm run lint` is in T1's gate
list — the reviewer correctly noted that T1's original gates ran `vitest` and
`check` but not `lint`, so an ESLint-only failure would have surfaced several
commits later and been attributed to the wrong task.

## Findings C, D, E — selectors and imports that do not exist

- **C:** T4 selected the in-window menu with `.context-menu, .menu`.
  `.context-menu` is the unrelated right-click menu (`ContextMenu.svelte:111`);
  `.menu` exists nowhere. `Menu.svelte:82-86` gives its dropdown panel **no
  class at all**, so there was nothing selectable. Fixed by adding an
  `xp-menu-dropdown` hook to the shared component — additive, and it makes every
  future in-window menu testable.
- **D:** T12 used `existsSync` three times in a file whose imports were fixed by
  T9. `npm run check` would fail with `Cannot find name`. The import now lands
  in T9, where the file is created.
- **E:** T14 used `#start-button` and `.start-menu`. The real hooks are
  `#start-menu-btn` (`task_bar.svelte:29`) and the **id** `#start-menu`
  (`start_menu.svelte:184`), as `e2e/start_menu.spec.ts` already uses. Under a
  180s timeout this would have burned three minutes in the serial `heavy`
  project before failing. Fixed, and the test now presses arrow keys rather than
  Escape: clicking the canvas closes the Start menu by click-outside, so the
  original assertion would have proved nothing about key leakage.

## Missing work, accepted

- **Bundle budget** — spec §6 requires proving no game code or WASM runtime
  reaches the entry chunk, and nothing verified it. Now **Task 15**, built on
  `scripts/verify-build.mjs`, which CI already runs and which already greps for
  Rollup's "dynamically imported … also statically imported" warning. Its step 2
  deliberately proves the check can fail, per that script's own header warning
  about greps that pass vacuously.
- **Deploy-probe checklist** — the three new `netlify.toml` blocks are invisible
  to every local gate. The closing task's guide now carries the exact probe,
  including re-confirming the `/` and python-sandbox CSPs survived, since
  last-rule-wins means a new block can silently replace an existing policy.
- **`placeholder_entry` liveness** — all four call sites are removed this phase.
  The closing task now checks whether it and `placeholder.svelte` are dead.

## Not accepted as a change

Nothing was rejected. Two observations from the review needed no action: T7's
`workers: 1` is valid per-project in Playwright 1.61 and the two sequential CI
invocations starting `webServer` twice is wall-clock cost rather than a bug; and
T3's dense-board first-click test reaching `status: 'won'` in one move is
consistent with its assertions rather than a defect.
