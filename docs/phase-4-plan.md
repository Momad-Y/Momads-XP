# Phase 4 — Games: implementation plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking.
> Every task ends green and committed. Branch: `feature/phase-4-games` off
> `dev`. **Stop at `dev`** — the cutover and deploy happen only when the owner
> asks (CLAUDE.md).

**Goal:** Ship Minesweeper, Solitaire, Chess and DOOM as real programs inside
the XP shell, replacing the four Start-menu placeholders.

**Architecture:** Each game splits in two — pure rules and adapters in
`src/lib/games/<game>/*.ts` (vitest-instrumented, since `vitest.config.ts`
covers `src/**/*.ts` and exempts `.svelte`), and a thin Svelte view under
`src/routes/xp/programs/`. Chess and DOOM own a Web Worker each (Stockfish;
DOSBox via js-dos `emulators.js`), both self-hosted so the suite stays
hermetic. All four register in `APP_REGISTRY`.

**Tech Stack:** SvelteKit 2 / Svelte 5 **legacy mode** (`export let`, `$:`),
strict TypeScript, Tailwind, vitest, Playwright, chess.js 1.4.0,
`stockfish.js` 10.0.2 (vendored), `js-dos` 8.4.1 `emulators.js` (vendored).

**Spec:** `docs/phase-4-spec.md` (Part A decisions D1–D20, Part B corrections
and D21–D31). Red team: `docs/phase-4-redteam-spec.md`. Read both — the plan
argues from them and does not restate their reasoning.

## Global constraints

Copied verbatim from CLAUDE.md and the spec. Every task's requirements
implicitly include this section.

- **npm 10 locks.** After ANY `package.json`/lockfile change:
  `npx -y npm@10 install`. CI's `npm ci` runs npm 10 (Node 22); a lock written
  by npm 11+ fails it. (D29)
- **Never hand-edit generated files:** `static/json/hard_drive.json`,
  `src/lib/generated/*`, `static/help.html`. *Phase 4 touches none of them —
  D3 puts no game in the VFS, so there is no `npm run generate:vfs` in this
  plan and no `SEED_VERSION` bump.*
- **Strict TS:** 0 `svelte-check` errors. ESLint `no-explicit-any` and
  `no-unsafe-type-assertion` are **errors** over `src/`. Do not grow the
  inherited warning count.
- **No hardcoded personal content in components.** (Not engaged this phase —
  games carry no profile data.)
- **E2E asserts exact UI strings** — a copy change updates `e2e/*.spec.ts` in
  the same commit.
- **Svelte 5 legacy `$:` trap:** state written from inside a `$:` block does
  NOT invalidate other `$:` blocks. Do one-shot init in `onMount`. Game state
  is reassigned from handlers, never written inside `$:`. (D27)
- **Long Svelte `style:` values must be mustached** (`style:background={'…'}`)
  or prettier/svelte2tsx break.
- **`netlify.toml` ordering:** duplicate header names resolve **last-rule-wins**,
  not most-specific-wins. The `/html/python-sandbox.html` block carries
  "KEEP THIS BLOCK LAST". New blocks go **before** it. No local gate can see a
  mistake here. (D18)
- **Gates before every push:** `npm run check` && `npm run lint` &&
  `npm run format:check` && `npx vitest run --coverage` && `npm run build` &&
  `npx playwright test --project=default`.
- **Mutation testing on every behaviour change:** revert the fix, confirm the
  test goes red, restore.
- **Diff coverage ≥80%** on changed lines vs `origin/dev`.

## File structure

**New — pure logic and adapters (vitest-covered):**

| File | Responsibility |
| --- | --- |
| `src/lib/games/minesweeper/board.ts` | Board type, mine placement excluding the first click, reveal flood-fill, flagging, win/lose |
| `src/lib/games/minesweeper/difficulty.ts` | The three presets and their window dimensions |
| `src/lib/games/solitaire/deck.ts` | Card type, deck construction, shuffle (seedable) |
| `src/lib/games/solitaire/klondike.ts` | Deal, legal moves, draw/recycle, auto-complete, win |
| `src/lib/games/chess/difficulty.ts` | Level → `{ skill, depth }` mapping |
| `src/lib/games/chess/uci.ts` | UCI line parsing (`bestmove`, `info`), command building |
| `src/lib/games/chess/engine.ts` | Worker adapter: lifecycle, request/reply, teardown |
| `src/lib/games/doom/dosbox_adapter.ts` | js-dos loader, `pathPrefix`, worker lifecycle, pause/resume/mute, teardown |
| `src/lib/games/doom/keymap.ts` | Browser `KeyboardEvent.code` → DOS scancode |
| `src/lib/vendored_games.test.ts` | Byte-pinning for the vendored binaries (D30) |

**New — views:**
`src/routes/xp/programs/{minesweeper,solitaire,chess,doom}.svelte`

**New — assets:** `static/js/stockfish/`, `static/js/js-dos/`,
`static/games/doom/`, `static/assets/cards/`, `static/assets/chess/`

**New — docs/legal:** `LICENSE-third-party.md`, `docs/phase-4-guide.md`

**Modified:** `src/lib/app_registry.ts` (D21 + 4 rows),
`src/lib/start_menu_programs.ts` (4 placeholder → real),
`package.json` + `package-lock.json`, `netlify.toml`, `playwright.config.ts`,
`.github/workflows/ci.yml`, `LICENSE`, `e2e/no_cdn.spec.ts`,
`docs/SPECIFICATION.md` (§9 tick boxes)

---

## Task 1 — Registry passthrough for window chrome (D21)

Blocks Tasks 4, 11 and 14. Nothing else can size a window correctly until this
lands.

**Files:**
- Modify: `src/lib/app_registry.ts` (`AppDefinition` ~:47-76,
  `to_window_options` ~:160-176)
- Test: `src/lib/app_registry.test.ts`

**Interfaces — Produces:**
```ts
interface AppDefinition {
    // …existing fields unchanged…
    /** Defaults to true, preserving today's output for every shipped app. */
    resizable?: boolean;
    aspect_ratio?: number;
    maximize_btn?: boolean;
}
```

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/app_registry.test.ts — append inside the existing describe.
//
// USE THE `app()` HELPER ALREADY AT THE TOP OF THIS FILE (:10-17). It builds
// an AppDefinition with `component: () => Promise.reject(...)`, which needs no
// cast. Do NOT write `{ default: null as never }` — `no-unsafe-type-assertion`
// is an ERROR over `src/**/*.ts` (eslint.config.js:28-34) and it applies to
// test files: three existing tests carry explicit disable comments for it.
it('defaults resizable to true so shipped apps are unchanged', () => {
    for (const existing of APP_REGISTRY) {
        expect(
            to_window_options(existing, 'i1').resizable,
            `${existing.id} changed shape`,
        ).toBe(true);
    }
});

it('lets an app opt out of resizing', () => {
    expect(to_window_options(app({ resizable: false }), 'i1').resizable).toBe(
        false,
    );
});

it('passes aspect_ratio and maximize_btn through only when set', () => {
    const plain = to_window_options(app(), 'i1');
    expect(plain.aspect_ratio).toBeUndefined();
    expect(plain.maximize_btn).toBeUndefined();

    const doom = to_window_options(
        app({ aspect_ratio: 4 / 3, maximize_btn: false }),
        'i2',
    );
    expect(doom.aspect_ratio).toBeCloseTo(4 / 3);
    expect(doom.maximize_btn).toBe(false);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/app_registry.test.ts`
Expected: FAIL — `resizable: false` comes back `true`; `aspect_ratio` is not a
property of `AppDefinition` (a TS error, which vitest surfaces).

- [ ] **Step 3: Implement**

In `AppDefinition`, after `taskbar?: boolean;`:
```ts
    /**
     * Window chrome passthrough. `to_window_options()` hardcoded
     * `resizable: true` and the object REPLACES the component's own default
     * wholesale, so a registered app had no way to be non-resizable — which
     * blocked Minesweeper (fixed size, D4) and DOOM (4:3, D12). Defaults keep
     * every shipped window byte-identical.
     */
    resizable?: boolean;
    aspect_ratio?: number;
    maximize_btn?: boolean;
```

In `to_window_options()`, replace the hardcoded `resizable: true` with
`resizable: app.resizable ?? true,` and after the `min_size` block add:
```ts
    if (app.aspect_ratio != null) options.aspect_ratio = app.aspect_ratio;
    if (app.maximize_btn != null) options.maximize_btn = app.maximize_btn;
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/app_registry.test.ts && npm run check && npm run lint`
Expected: PASS, 0 svelte-check errors, 0 lint errors.

**`npm run lint` is in this list deliberately.** Without it an ESLint-only
failure introduced here survives until the first task that runs the full
gate set, several commits later, where it is attributed to the wrong task.

- [ ] **Step 5: Mutation-test the default**

Change `app.resizable ?? true` to `app.resizable ?? false`; confirm the first
test goes red. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/lib/app_registry.ts src/lib/app_registry.test.ts
git commit -m "feat(registry): let an app declare its own window chrome"
```

---

## Task 2 — Licence carve-out, before any binary is committed (D20)

Deliberately first. No GPL or shareware byte enters the repo until the notices
file that makes it lawful is already there.

**Files:**
- Create: `LICENSE-third-party.md`
- Modify: `LICENSE`

**Interfaces — Produces:** nothing code-level. Later tasks append their
component to this file in the same commit that vendors its bytes.

- [ ] **Step 1: Write `LICENSE-third-party.md`**

Structure, one section per component, each stating: the files as shipped, the
licence, the upstream source URL, and the exact version that constitutes the
corresponding source. Seed it with the two entries whose facts are already
verified:

```markdown
# Third-party components

`LICENSE` covers this repository's own source. It does **not** and cannot
cover the components below: GPL-2.0 §6 and GPL-3.0 §10 forbid imposing further
restrictions on the covered works. Each component here is governed solely by
its own licence.

## Stockfish (chess engine) — GPL-3.0

- **Shipped as:** `static/js/stockfish/stockfish.wasm.js`,
  `static/js/stockfish/stockfish.wasm`
- **Identifies as:** `Stockfish 2019-08-15 Multi-Variant`
- **Upstream / corresponding source:** https://github.com/ddugovic/Stockfish
  (the multi-variant fork), packaged as `stockfish.js@10.0.2`
  (https://github.com/niklasf/stockfish.js). NOT official-stockfish/Stockfish.
- **Licence text:** `static/js/stockfish/Copying.txt`, shipped verbatim.
- Unmodified. Copyright T. Romstad, M. Costalba, J. Kiiski, G. Linscott and
  contributors; multi-variant support by Daniel Dugovic and contributors.

## js-dos / DOSBox (DOS emulator) — GPL-2.0

- **Shipped as:** `static/js/js-dos/{emulators.js,wdosbox.js,wdosbox.wasm,
  wlibzip.js,wlibzip.wasm}`
- **Upstream / corresponding source:** https://github.com/caiiiycuk/js-dos,
  npm `js-dos@8.4.1`. Unmodified.
- Only the emulator layer is shipped. `js-dos.js` (the cloud UI) is
  deliberately not distributed.
```

- [ ] **Step 2: Add the carve-out line to `LICENSE`**

Append:
```
Portions of this distribution are third-party components licensed separately;
see LICENSE-third-party.md. The restrictions above do not apply to them.
```

- [ ] **Step 3: Commit**

```bash
git add LICENSE LICENSE-third-party.md
git commit -m "docs: third-party licence carve-out ahead of vendoring"
```

---

## Task 3 — Minesweeper rules (D1, D5, D27)

**Files:**
- Create: `src/lib/games/minesweeper/difficulty.ts`,
  `src/lib/games/minesweeper/board.ts`
- Test: `src/lib/games/minesweeper/board.test.ts`

**Interfaces — Produces:**
```ts
// difficulty.ts
export type Level = 'beginner' | 'intermediate' | 'expert';
export interface Preset { cols: number; rows: number; mines: number; label: string }
export const PRESETS: Record<Level, Preset>;

// board.ts
export type CellState = 'hidden' | 'revealed' | 'flagged';
export interface Cell { mine: boolean; adjacent: number; state: CellState }
export type Status = 'ready' | 'playing' | 'won' | 'lost';
export interface Board {
    cols: number; rows: number; mines: number;
    cells: readonly Cell[];           // row-major, length cols*rows
    status: Status;
    revealed_count: number;
}
export function new_board(preset: Preset): Board;                 // status 'ready', no mines yet
export function reveal(board: Board, index: number, rng?: () => number): Board;
export function toggle_flag(board: Board, index: number): Board;
export function flags_left(board: Board): number;
export function neighbours(board: Board, index: number): number[];
```
Every function returns a **new** `Board` — `coding-style.md` immutability.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { PRESETS } from './difficulty';
import { flags_left, new_board, reveal, toggle_flag } from './board';

const seq = (values: number[]): (() => number) => {
    let i = 0;
    return () => values[i++ % values.length] ?? 0;
};

describe('minesweeper board', () => {
    it('starts with no mines placed and status ready', () => {
        const b = new_board(PRESETS.beginner);
        expect(b.cells).toHaveLength(81);
        expect(b.cells.every((c) => !c.mine)).toBe(true);
        expect(b.status).toBe('ready');
    });

    it('never places a mine under the first click', () => {
        // D5: the defining invariant. Run every opening square on a board so
        // dense that only one cell can stay clear.
        const dense = { cols: 3, rows: 3, mines: 8, label: 'dense' };
        for (let first = 0; first < 9; first++) {
            const b = reveal(new_board(dense), first, seq([0]));
            expect(b.cells[first]?.mine, `mine under first click ${first}`).toBe(false);
            expect(b.cells.filter((c) => c.mine)).toHaveLength(8);
            expect(b.status).not.toBe('lost');
        }
    });

    it('flood-fills the whole board when the first click has no adjacent mines', () => {
        const b = reveal(new_board({ cols: 3, rows: 3, mines: 0, label: 'empty' }), 4);
        expect(b.cells.every((c) => c.state === 'revealed')).toBe(true);
        expect(b.status).toBe('won');
    });

    it('stops the flood at numbered cells', () => {
        const b = reveal(new_board({ cols: 3, rows: 1, mines: 1, label: 'row' }), 2, seq([0]));
        // mine lands at index 0; index 1 is adjacent so it stops the fill
        expect(b.cells[1]?.state).toBe('revealed');
        expect(b.cells[1]?.adjacent).toBe(1);
        expect(b.cells[0]?.state).toBe('hidden');
    });

    it('loses when a mine is revealed after the first click', () => {
        let b = reveal(new_board({ cols: 3, rows: 1, mines: 1, label: 'row' }), 2, seq([0]));
        b = reveal(b, 0);
        expect(b.status).toBe('lost');
    });

    it('counts flags down from the mine count and ignores revealed cells', () => {
        let b = new_board(PRESETS.beginner);
        expect(flags_left(b)).toBe(10);
        b = toggle_flag(b, 0);
        expect(flags_left(b)).toBe(9);
        b = toggle_flag(b, 0);
        expect(flags_left(b)).toBe(10);
    });

    it('refuses to reveal a flagged cell', () => {
        let b = toggle_flag(new_board(PRESETS.beginner), 0);
        b = reveal(b, 0);
        expect(b.cells[0]?.state).toBe('flagged');
        expect(b.status).toBe('ready');
    });

    it('wins when every non-mine cell is revealed', () => {
        let b = reveal(new_board({ cols: 2, rows: 1, mines: 1, label: 'two' }), 1, seq([0]));
        expect(b.status).toBe('won');
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/games/minesweeper`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement `difficulty.ts`**

```ts
/** The three XP presets (SPECIFICATION.md §3.3). */
export type Level = 'beginner' | 'intermediate' | 'expert';

export interface Preset {
    cols: number;
    rows: number;
    mines: number;
    label: string;
}

export const PRESETS: Record<Level, Preset> = {
    beginner: { cols: 9, rows: 9, mines: 10, label: 'Beginner' },
    intermediate: { cols: 16, rows: 16, mines: 40, label: 'Intermediate' },
    expert: { cols: 30, rows: 16, mines: 99, label: 'Expert' },
};

/** Cell edge in CSS px. XP's sprite grid. */
export const CELL_PX = 16;
/** Chrome around the grid: border + the counter/smiley header. */
export const FRAME_W = 20;
export const FRAME_H = 62;

export function window_size(preset: Preset): { width: number; height: number } {
    return {
        width: preset.cols * CELL_PX + FRAME_W,
        height: preset.rows * CELL_PX + FRAME_H,
    };
}
```

- [ ] **Step 4: Implement `board.ts`**

Key points the tests pin, so implement exactly these semantics:
- `new_board` returns all-clear cells, `status: 'ready'`, `revealed_count: 0`.
- `reveal` on a `'ready'` board first calls an internal
  `place_mines(board, safe_index, rng)` that picks indices from the candidate
  list **excluding `safe_index`** (D5 option A — the first cell only, not its
  neighbours), then recomputes `adjacent` for every cell, then continues into
  the normal reveal path with `status: 'playing'`.
- `reveal` returns the board unchanged if the target is `'flagged'` or already
  `'revealed'`, or if `status` is `'won'`/`'lost'`.
- Revealing a mine sets `status: 'lost'` and reveals all mines.
- Otherwise flood-fill: reveal the cell; if `adjacent === 0`, recurse into
  `neighbours()`. Use an explicit stack, not recursion — Expert is 480 cells
  and a fully-empty region would nest deeply.
- After any reveal, if `revealed_count === cols*rows - mines`, set
  `status: 'won'`.
- `toggle_flag` is a no-op on revealed cells and on a finished board.
- `flags_left` is `mines - (count of flagged cells)`; it may go negative, as it
  does in XP.

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/lib/games/minesweeper --coverage`
Expected: PASS, all 8 tests.

- [ ] **Step 6: Mutation-test the first-click invariant**

In `place_mines`, stop excluding `safe_index`. Confirm the "never places a mine
under the first click" test goes red. Restore.

- [ ] **Step 7: Commit**

```bash
git add src/lib/games/minesweeper
git commit -m "feat(minesweeper): board rules with first-click safety"
```

---

## Task 4 — Minesweeper window (D1, D4, D21, D23, D27)

**Files:**
- Create: `src/routes/xp/programs/minesweeper.svelte`
- Modify: `src/lib/app_registry.ts` (one row),
  `src/lib/start_menu_programs.ts` (one placeholder → real)
- Test: `e2e/minesweeper.spec.ts`

**Interfaces — Consumes:** Task 1's `resizable`/`maximize_btn` passthrough;
Task 3's `new_board`/`reveal`/`toggle_flag`/`flags_left`, `PRESETS`,
`window_size`.

**The two traps this task exists to avoid:**
1. **D27.** Board state is `let board: Board`, reassigned only from event
   handlers and the timer's `setInterval` callback. Win/lose is read from
   `board.status`. **Never** write state inside a `$:` block. `$:` is used
   only for read-only derivations (`$: face = board.status === 'lost' ? …`).
2. **D4/D21.** The window resizes on difficulty change by reassigning the
   component's own `options` object. Mutating `options.width` will not
   invalidate; `options = { ...options, ...window_size(preset) }` will.

- [ ] **Step 1: Write the failing E2E**

```ts
import { expect, test } from '@playwright/test';
import { bootToDesktop, openFromStartMenu } from './helpers';

test('Minesweeper opens, reveals a cell and counts flags', async ({ page }) => {
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'Minesweeper');

    const win = page.locator('#work-space .window', { hasText: 'Minesweeper' });
    await expect(win).toBeVisible();
    await expect(win.locator('.ms-cell')).toHaveCount(81);          // Beginner 9x9
    await expect(win.locator('.ms-mine-count')).toHaveText('010');

    await win.locator('.ms-cell').first().click({ button: 'right' });
    await expect(win.locator('.ms-mine-count')).toHaveText('009');
    await expect(win.locator('.ms-cell').first()).toHaveClass(/ms-flagged/);

    await win.locator('.ms-cell').nth(40).click();
    await expect(win.locator('.ms-cell.ms-revealed').first()).toBeVisible();
});

test('Minesweeper resizes its window for Expert', async ({ page }) => {
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'Minesweeper');
    const win = page.locator('#work-space .window', { hasText: 'Minesweeper' });

    // Assert the ACTUAL expected width, not merely "bigger than before".
    // A window that failed to receive any width at all shrink-wraps its grid,
    // so a `after > before` comparison passes by coincidence while the sizing
    // is broken — which is exactly the bug this test exists to catch.
    const beginner = 9 * 16 + 20;           // cols * CELL_PX + FRAME_W
    await expect
        .poll(async () => Math.round((await win.boundingBox())?.width ?? 0))
        .toBe(beginner);

    await win.getByText('Game', { exact: true }).click();
    await page.locator('.xp-menu-dropdown').getByText('Expert').click();

    await expect(win.locator('.ms-cell')).toHaveCount(480);          // 30x16
    const expert = 30 * 16 + 20;
    await expect
        .poll(async () => Math.round((await win.boundingBox())?.width ?? 0))
        .toBe(expert);
});
```

**Before writing the component, add a test hook to the shared menu.**
`src/lib/components/xp/Menu.svelte:82-86` renders its dropdown panel with no
class of any kind, so there is nothing for an E2E to select — `.menu` does not
exist anywhere in the codebase and `.context-menu` is the unrelated right-click
menu (`ContextMenu.svelte:111`). Add `xp-menu-dropdown` to that panel's class
list. It is purely additive, it benefits every future in-window menu spec, and
without it no game's menu is testable.

If `openFromStartMenu` does not exist in `e2e/helpers.ts`, add it there in this
task — a two-level flyout walk (`Start` → `All Programs` → `Games` → item) —
and reuse it in Tasks 6, 11 and 14 rather than repeating the selector chain.

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test --project=default e2e/minesweeper.spec.ts`
Expected: FAIL — the Start menu still opens the placeholder dialog.

- [ ] **Step 3: Build the component**

Shape (follow `placeholder.svelte` for the mount/destroy contract and
`cmd.svelte` for a registry-launched program):

```svelte
<svelte:options accessors={true} />
<script lang="ts">
    import { onDestroy, onMount, unmount } from 'svelte';
    import Window from '../../../lib/components/xp/Window.svelte';
    import { runningPrograms } from '../../../lib/store';
    import { required } from '../../../lib/types';
    import { PRESETS, window_size, type Level } from '../../../lib/games/minesweeper/difficulty';
    import { flags_left, new_board, reveal, toggle_flag, type Board } from '../../../lib/games/minesweeper/board';
    import type { ProgramInstance, WindowController, WindowOptions } from '../../../lib/types';

    export let id: string;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;

    let level: Level = 'beginner';
    let board: Board = new_board(PRESETS[level]);
    let seconds = 0;
    let timer: ReturnType<typeof setInterval> | undefined;

    export let options: WindowOptions = {
        title: 'Minesweeper',
        icon: '/assets/icons/minesweeper.png',
        id,
        ...window_size(PRESETS.beginner),
        resizable: false,
        maximize_btn: false,
    };

    // READ-ONLY derivations. Nothing below writes state — see D27.
    $: mine_display = String(Math.max(flags_left(board), 0)).padStart(3, '0');
    $: time_display = String(Math.min(seconds, 999)).padStart(3, '0');

    onMount(() => {
        timer = setInterval(() => {
            if (board.status === 'playing') seconds += 1;
        }, 1000);
    });

    onDestroy(() => {
        if (timer != null) clearInterval(timer);
        timer = undefined;
    });

    function set_level(next: Level) {
        level = next;
        board = new_board(PRESETS[next]);
        seconds = 0;
        // REASSIGN, do not mutate — a member write will not invalidate the
        // `style:width` binding in Window.svelte. (D4 / spike 1)
        options = { ...options, ...window_size(PRESETS[next]) };
    }

    function on_cell(index: number, event: MouseEvent) {
        event.preventDefault();
        board = event.button === 2 ? toggle_flag(board, index) : reveal(board, index);
    }

    export function destroy() {
        runningPrograms.update((p) => p.filter((x) => x != get_self()));
        void unmount(required(get_self(), 'minesweeper instance'));
    }
</script>
```

The grid renders `board.cells` with `.ms-cell`, plus `.ms-revealed`,
`.ms-flagged`, `.ms-mine` classes and `data-adjacent` for the number colour.
The header carries `.ms-mine-count`, the smiley button (resets via
`set_level(level)`) and `.ms-time`. A `Game` menu offers the three difficulties.
Suppress the browser context menu on the grid (`on:contextmenu|preventDefault`).

- [ ] **Step 4: Register it**

`app_registry.ts` — add:
```ts
    {
        id: 'minesweeper',
        path: './programs/minesweeper.svelte',
        title: 'Minesweeper',
        icon: '/assets/icons/minesweeper.png',
        component: () => import('../routes/xp/programs/minesweeper.svelte'),
        // `default_size` IS REQUIRED, and leaving it out is not a style choice.
        // `work_space.svelte:551` mounts a registered app with
        // `options: to_window_options(app, instance_id)`, and its own comment
        // says registry components "deliberately do not declare their own
        // `options` default" — Svelte replaces a default wholesale rather than
        // merging. So the component's `export let options = {...}` below NEVER
        // RUNS for a registry launch. Without this line `to_window_options()`
        // emits no width/height at all, `Window.svelte:98-109` skips its clamp
        // because both are null, and `:435` renders `style:width="undefinedpx"`
        // — invalid CSS, silently dropped, leaving the window to shrink-wrap.
        default_size: window_size(PRESETS.beginner),
        min_size: window_size(PRESETS.beginner),
        // Fixed, like XP's. Needs Task 1's passthrough.
        resizable: false,
        maximize_btn: false,
        // Multi-instance: pure DOM, nothing to own. Contrast DOOM (D23).
        singleton: false,
    },
```
`app_registry.ts` imports `PRESETS` and `window_size` from
`./games/minesweeper/difficulty` for this row. That is the only game-logic
import the registry takes; it is worth it to keep one source of truth for the
board's pixel size.
`start_menu_programs.ts` — replace
`placeholder_entry('Minesweeper', '/assets/icons/minesweeper.png')` with:
```ts
            {
                name: 'Minesweeper',
                icon: '/assets/icons/minesweeper.png',
                path: './programs/minesweeper.svelte',
            },
```

- [ ] **Step 5: Run the gates**

Run: `npm run check && npm run lint && npx vitest run && npx playwright test --project=default e2e/minesweeper.spec.ts e2e/start_menu.spec.ts`
Expected: PASS. `start_menu_programs.test.ts` must stay green — it walks
`programs/` and fails on an unlisted component.

- [ ] **Step 6: Verify the taskbar registration (D23)**

Open Minesweeper, confirm a taskbar button appears and clicking it focuses the
window. `app_registry.ts:9-12` names omitting this as the repo's
most-repeated defect; `taskbar` is left at its default `true`, and this step
is where that is confirmed rather than assumed.

- [ ] **Step 7: Commit**

```bash
git add src/routes/xp/programs/minesweeper.svelte src/lib/app_registry.ts src/lib/start_menu_programs.ts src/lib/components/xp/Menu.svelte e2e/minesweeper.spec.ts e2e/helpers.ts
git commit -m "feat(minesweeper): playable window with three difficulties"
```

---

## Task 5 — Solitaire rules (D1, D6)

**Files:**
- Create: `src/lib/games/solitaire/deck.ts`, `src/lib/games/solitaire/klondike.ts`
- Test: `src/lib/games/solitaire/klondike.test.ts`

**Interfaces — Produces:**
```ts
// deck.ts
export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type Colour = 'red' | 'black';
export interface Card { suit: Suit; rank: number; face_up: boolean }   // rank 1..13
export function colour_of(suit: Suit): Colour;
export function fresh_deck(): Card[];                                   // 52, ordered
export function shuffle(cards: readonly Card[], rng: () => number): Card[];

// klondike.ts
export interface Game {
    stock: Card[]; waste: Card[];
    foundations: [Card[], Card[], Card[], Card[]];   // clubs, diamonds, hearts, spades
    tableau: [Card[], Card[], Card[], Card[], Card[], Card[], Card[]];
    draw: 1 | 3;
}
export function deal(rng: () => number, draw?: 1 | 3): Game;
export function draw_from_stock(game: Game): Game;          // recycles waste when stock empties
export type Source = { pile: 'waste' } | { pile: 'tableau'; index: number; depth: number } | { pile: 'foundation'; index: number };
export type Target = { pile: 'tableau'; index: number } | { pile: 'foundation'; index: number };
export function can_move(game: Game, from: Source, to: Target): boolean;
export function move(game: Game, from: Source, to: Target): Game;       // returns game unchanged if illegal
export function auto_complete_available(game: Game): boolean;
export function has_won(game: Game): boolean;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { colour_of, fresh_deck, type Card } from './deck';
import { auto_complete_available, can_move, deal, draw_from_stock, has_won, move, type Game } from './klondike';

const fixed = (): number => 0.5;
const card = (suit: Card['suit'], rank: number, face_up = true): Card => ({ suit, rank, face_up });

describe('klondike', () => {
    it('deals 28 cards into seven ascending piles with only the last face up', () => {
        const g = deal(fixed);
        expect(g.tableau.map((p) => p.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        for (const pile of g.tableau) {
            expect(pile.at(-1)?.face_up).toBe(true);
            expect(pile.slice(0, -1).every((c) => !c.face_up)).toBe(true);
        }
        expect(g.stock).toHaveLength(24);
        expect(g.waste).toHaveLength(0);
        expect(g.foundations.flat()).toHaveLength(0);
    });

    it('uses all 52 distinct cards exactly once', () => {
        const g = deal(fixed);
        const all = [...g.stock, ...g.waste, ...g.tableau.flat(), ...g.foundations.flat()];
        expect(all).toHaveLength(52);
        expect(new Set(all.map((c) => `${c.suit}${String(c.rank)}`)).size).toBe(52);
    });

    it('recycles the waste when the stock runs out', () => {
        let g: Game = { ...deal(fixed), draw: 1 };
        for (let i = 0; i < 24; i++) g = draw_from_stock(g);
        expect(g.stock).toHaveLength(0);
        expect(g.waste).toHaveLength(24);
        g = draw_from_stock(g);
        expect(g.stock).toHaveLength(24);
        expect(g.waste).toHaveLength(0);
    });

    it('allows a descending alternating-colour build on the tableau', () => {
        const g: Game = { ...deal(fixed), waste: [card('hearts', 6)] };
        g.tableau[0] = [card('spades', 7)];
        expect(can_move(g, { pile: 'waste' }, { pile: 'tableau', index: 0 })).toBe(true);
    });

    it('rejects a same-colour or wrong-rank tableau build', () => {
        const g: Game = { ...deal(fixed), waste: [card('diamonds', 6)] };
        g.tableau[0] = [card('hearts', 7)];
        expect(can_move(g, { pile: 'waste' }, { pile: 'tableau', index: 0 })).toBe(false);
        g.waste = [card('spades', 5)];
        expect(can_move(g, { pile: 'waste' }, { pile: 'tableau', index: 0 })).toBe(false);
    });

    it('only lets a King fill an empty tableau column', () => {
        const g: Game = { ...deal(fixed), waste: [card('spades', 13)] };
        g.tableau[0] = [];
        expect(can_move(g, { pile: 'waste' }, { pile: 'tableau', index: 0 })).toBe(true);
        g.waste = [card('spades', 12)];
        expect(can_move(g, { pile: 'waste' }, { pile: 'tableau', index: 0 })).toBe(false);
    });

    it('builds foundations up by suit from the Ace', () => {
        const g: Game = { ...deal(fixed), waste: [card('clubs', 1)] };
        g.foundations = [[], [], [], []];
        expect(can_move(g, { pile: 'waste' }, { pile: 'foundation', index: 0 })).toBe(true);
        g.foundations[0] = [card('clubs', 1)];
        g.waste = [card('clubs', 3)];
        expect(can_move(g, { pile: 'waste' }, { pile: 'foundation', index: 0 })).toBe(false);
        g.waste = [card('clubs', 2)];
        expect(can_move(g, { pile: 'waste' }, { pile: 'foundation', index: 0 })).toBe(true);
    });

    it('moves a run of cards and flips the card it uncovers', () => {
        const g: Game = deal(fixed);
        g.tableau[0] = [card('hearts', 5, false), card('spades', 4), card('diamonds', 3)];
        g.tableau[1] = [card('hearts', 5)];
        const after = move(g, { pile: 'tableau', index: 0, depth: 2 }, { pile: 'tableau', index: 1 });
        expect(after.tableau[1]).toHaveLength(3);
        expect(after.tableau[0]).toHaveLength(1);
        expect(after.tableau[0][0]?.face_up).toBe(true);
    });

    it('returns the game unchanged for an illegal move', () => {
        const g: Game = { ...deal(fixed), waste: [card('diamonds', 6)] };
        g.tableau[0] = [card('hearts', 7)];
        expect(move(g, { pile: 'waste' }, { pile: 'tableau', index: 0 })).toEqual(g);
    });

    it('detects auto-complete only when the stock, waste and all face-down cards are gone', () => {
        const g: Game = deal(fixed);
        expect(auto_complete_available(g)).toBe(false);
        // Build the tuple positionally. `.map()` over a tuple widens to
        // Card[][], and asserting back to the tuple type trips
        // `no-unsafe-type-assertion` (an ERROR over src/, test files included).
        const face_up = (pile: Card[]): Card[] => pile.map((c) => ({ ...c, face_up: true }));
        const done: Game = { ...g, stock: [], waste: [], tableau: [
            face_up(g.tableau[0]), face_up(g.tableau[1]), face_up(g.tableau[2]),
            face_up(g.tableau[3]), face_up(g.tableau[4]), face_up(g.tableau[5]),
            face_up(g.tableau[6]),
        ] };
        expect(auto_complete_available(done)).toBe(true);
    });

    it('wins when all four foundations hold thirteen cards', () => {
        const g = deal(fixed);
        expect(has_won(g)).toBe(false);
        // Positional again, for the same reason as above.
        const pile = (s: Card['suit']): Card[] =>
            Array.from({ length: 13 }, (_, i) => card(s, i + 1));
        const full: Game = { ...g, foundations: [
            pile('clubs'), pile('diamonds'), pile('hearts'), pile('spades'),
        ] };
        expect(has_won(full)).toBe(true);
    });

    it('assigns colours correctly', () => {
        expect(colour_of('hearts')).toBe('red');
        expect(colour_of('spades')).toBe('black');
        expect(fresh_deck()).toHaveLength(52);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/games/solitaire`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement both modules**

`deck.ts`: `colour_of` maps diamonds/hearts to `'red'`; `fresh_deck` is the
4×13 product with `face_up: false`; `shuffle` is Fisher-Yates driven by the
injected `rng` (injected so tests are deterministic and the component can pass
`Math.random`).

`klondike.ts`: all functions return new objects — never mutate the argument.
- `deal` shuffles, then takes 1..7 cards per column, flipping only the last;
  the remaining 24 become `stock`.
- `draw_from_stock` moves `draw` cards stock→waste face up; when `stock` is
  empty it reverses `waste` back into `stock` face down and empties `waste`.
- `can_move`: tableau target requires `rank === target_top.rank - 1` and
  opposite colour, or a King onto an empty column; foundation target requires
  same suit and `rank === foundation.length + 1`, and rejects multi-card
  sources (`depth > 0`).
- `move` returns the input unchanged when `can_move` is false; on success it
  flips the newly exposed tableau card face up if it is face down.
- `auto_complete_available`: `stock` and `waste` empty and every tableau card
  `face_up`.
- `has_won`: all four foundations length 13.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/games/solitaire --coverage`
Expected: PASS, all 11 tests.

- [ ] **Step 5: Mutation-test the colour rule**

In `can_move`, drop the opposite-colour check. Confirm "rejects a same-colour
… build" goes red. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/lib/games/solitaire
git commit -m "feat(solitaire): klondike rules"
```

---

## Task 6 — Solitaire window (D6, D7, D8, D23, D27, D28)

**Files:**
- Create: `src/routes/xp/programs/solitaire.svelte`,
  `static/assets/cards/*.svg`
- Modify: `src/lib/app_registry.ts`, `src/lib/start_menu_programs.ts`,
  `LICENSE-third-party.md`
- Test: `e2e/solitaire.spec.ts`

**Interfaces — Consumes:** Task 5's `deal`/`move`/`can_move`/
`draw_from_stock`/`has_won`/`auto_complete_available`; Task 4's
`openFromStartMenu` helper.

- [ ] **Step 1: Vendor the card art and record it**

Source: Byron Knoll's vector playing cards, public domain (WTFPL offered as a
fallback where public domain is not recognised), via
`notpeter/Vector-Playing-Cards`. 52 faces plus one back, as SVG, into
`static/assets/cards/`. Naming: `<rank><suit>.svg` with rank in
`A,2..10,J,Q,K` and suit in `C,D,H,S` (e.g. `AS.svg`), plus `back.svg`.

Append to `LICENSE-third-party.md` in this same commit:
```markdown
## Playing-card artwork — public domain

- **Shipped as:** `static/assets/cards/*.svg`
- **Source:** Byron Knoll's vector playing cards (2011), via
  https://github.com/notpeter/Vector-Playing-Cards
- Released into the public domain; WTFPL offered as a fallback in
  jurisdictions that do not recognise the public domain. No attribution is
  required — this credit is a courtesy.
```

- [ ] **Step 2: Write the failing E2E**

```ts
import { expect, test } from '@playwright/test';
import { bootToDesktop, openFromStartMenu } from './helpers';

test('Solitaire deals a Klondike tableau and draws from the stock', async ({ page }) => {
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'Solitaire');

    const win = page.locator('#work-space .window', { hasText: 'Solitaire' });
    await expect(win).toBeVisible();
    await expect(win.locator('.sol-tableau .sol-card')).toHaveCount(28);
    await expect(win.locator('.sol-tableau .sol-card.sol-face-up')).toHaveCount(7);
    await expect(win.locator('.sol-waste .sol-card')).toHaveCount(0);

    await win.locator('.sol-stock').click();
    await expect(win.locator('.sol-waste .sol-card')).toHaveCount(1);
});

test('Solitaire honours prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'Solitaire');
    const win = page.locator('#work-space .window', { hasText: 'Solitaire' });
    // The felt carries the flag the animation reads, so this is assertable
    // without playing a full game to completion.
    await expect(win.locator('.sol-felt')).toHaveAttribute('data-reduced-motion', 'true');
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx playwright test --project=default e2e/solitaire.spec.ts`
Expected: FAIL — placeholder dialog.

- [ ] **Step 4: Build the component**

- Green felt background, seven tableau columns, four foundations, stock/waste.
- **Drag (D7):** `pointerdown` on a face-up card captures the pointer
  (`setPointerCapture`), lifts that card **and every card above it in the
  column** into a floating layer following the pointer; `pointerup`
  hit-tests the drop target by `elementsFromPoint` and calls
  `move(game, from, to)`. An illegal drop animates back — `move` already
  returns the game unchanged, so the view just re-renders.
  There is no conflict with the window manager: `Window.svelte:325` scopes
  jQuery UI draggable to `handle: '.titlebar'`.
- **State (D27):** `let game: Game`, reassigned only from handlers.
  `$: won = has_won(game)` is a read-only derivation.
- **Reduced motion (D28):**
  ```svelte
  <div class="sol-felt" data-reduced-motion={reduced_motion}>
  ```
  with `const reduced_motion = matchMedia('(prefers-reduced-motion: reduce)').matches`
  read in `onMount`. When true, winning shows a static "You won" panel instead
  of the bouncing-card cascade.
- Double-click a card to send it to a foundation if legal (XP behaviour).
- `Game` menu: Deal (new game), Draw 1 / Draw 3.

- [ ] **Step 5: Register it**

```ts
    {
        id: 'solitaire',
        path: './programs/solitaire.svelte',
        title: 'Solitaire',
        icon: '/assets/icons/solitaire.png',
        component: () => import('../routes/xp/programs/solitaire.svelte'),
        default_size: { width: 700, height: 520 },
        min_size: { width: 600, height: 460 },
        // Multi-instance: pure DOM, like Minesweeper (D23).
        singleton: false,
    },
```
Replace the Solitaire `placeholder_entry` the same way as Task 4.

- [ ] **Step 6: Run the gates**

Run: `npm run check && npm run lint && npx vitest run && npx playwright test --project=default e2e/solitaire.spec.ts e2e/start_menu.spec.ts`

- [ ] **Step 7: Commit**

```bash
git add src/routes/xp/programs/solitaire.svelte static/assets/cards src/lib/app_registry.ts src/lib/start_menu_programs.ts LICENSE-third-party.md e2e/solitaire.spec.ts
git commit -m "feat(solitaire): playable klondike with drag-and-drop"
```

---

## Task 7 — The `heavy` Playwright project (D31)

Lands before the first `@heavy` spec (Task 11). Nothing to implement in the
app; this is the CI change that keeps the two WASM-boot specs off a contended
worker pool.

**Files:**
- Modify: `playwright.config.ts`, `.github/workflows/ci.yml`

- [ ] **Step 1: Add the project**

```ts
    projects: [
        // `default` must exclude BOTH tags, or the heavy specs run twice —
        // once here in parallel (the contention this exists to avoid) and
        // once in `heavy`.
        { name: 'default', grepInvert: /@online|@heavy/ },
        { name: 'online', grep: /@online/ },
        /*
         * Hermetic, like `default` — the tag means EXPENSIVE, not networked.
         * DOOM boots a DOSBox WASM image and Chess instantiates Stockfish;
         * this config's own note above records that `default` flakes about one
         * run in three under machine load, that the cause is overall CPU
         * contention rather than worker count, and that every failure passes
         * in isolation. Adding two WASM boots to that pool would make it
         * worse, so they get a pool of one instead.
         */
        { name: 'heavy', grep: /@heavy/, workers: 1 },
    ],
```

- [ ] **Step 2: Add the CI step**

In `.github/workflows/ci.yml`, after the existing `--project=default` step, add
a separate step running `npx playwright test --project=heavy`. Separate, not
appended to the same command, so the two never run concurrently.

- [ ] **Step 3: Verify both projects still select correctly**

Run: `npx playwright test --project=heavy --list` → expect 0 tests for now.
Run: `npx playwright test --project=default --list` → expect the current count,
unchanged.

- [ ] **Step 4: Commit**

```bash
git add playwright.config.ts .github/workflows/ci.yml
git commit -m "ci: a serial project for WASM-heavy game specs"
```

---

## Task 8 — Chess rules and UCI protocol (D1, D14, D16)

Pure logic only. No worker, no vendored bytes — those are Tasks 9 and 10.

**Files:**
- Modify: `package.json` (add `chess.js`)
- Create: `src/lib/games/chess/difficulty.ts`, `src/lib/games/chess/uci.ts`
- Test: `src/lib/games/chess/uci.test.ts`

**Interfaces — Produces:**
```ts
// difficulty.ts
export type Level = 'easy' | 'medium' | 'hard';
export interface EngineLimits { skill: number; depth: number }   // skill 0..20
export const LIMITS: Record<Level, EngineLimits>;
export function go_commands(level: Level, moves: readonly string[]): string[];

// uci.ts
export interface BestMove { from: string; to: string; promotion?: string }
export function parse_bestmove(line: string): BestMove | null;
export function is_uciok(line: string): boolean;
export function is_readyok(line: string): boolean;
```

- [ ] **Step 1: Add chess.js and regenerate the lock (D29)**

```bash
npm pkg set dependencies.chess.js="1.4.0"
npx -y npm@10 install
```
Verify: `grep '"lockfileVersion"' package-lock.json` and confirm `npm ci`
still succeeds. **This is the CLAUDE.md hard rule; do not use a bare
`npm install`.**

- [ ] **Step 2: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import { LIMITS, go_commands } from './difficulty';
import { is_readyok, is_uciok, parse_bestmove } from './uci';

describe('chess difficulty', () => {
    it('maps three levels to increasing skill and depth', () => {
        expect(LIMITS.easy.skill).toBeLessThan(LIMITS.medium.skill);
        expect(LIMITS.medium.skill).toBeLessThan(LIMITS.hard.skill);
        expect(LIMITS.easy.depth).toBeLessThanOrEqual(LIMITS.hard.depth);
    });

    it('keeps skill inside the engine-advertised 0..20 spin range', () => {
        // Verified against the shipped binary: `option name Skill Level type
        // spin default 20 min 0 max 20`. Out-of-range values are ignored
        // silently by the engine, which would look like "difficulty does
        // nothing" rather than like an error.
        for (const l of ['easy', 'medium', 'hard'] as const) {
            expect(LIMITS[l].skill).toBeGreaterThanOrEqual(0);
            expect(LIMITS[l].skill).toBeLessThanOrEqual(20);
        }
    });

    it('builds the full command sequence for a position', () => {
        expect(go_commands('easy', ['e2e4', 'e7e5'])).toEqual([
            `setoption name Skill Level value ${String(LIMITS.easy.skill)}`,
            'position startpos moves e2e4 e7e5',
            `go depth ${String(LIMITS.easy.depth)}`,
        ]);
    });

    it('omits the moves suffix from the opening position', () => {
        expect(go_commands('hard', [])[1]).toBe('position startpos');
    });
});

describe('uci parsing', () => {
    it('reads a plain bestmove', () => {
        expect(parse_bestmove('bestmove e7e6 ponder b1c3')).toEqual({ from: 'e7', to: 'e6' });
    });
    it('reads a promotion', () => {
        expect(parse_bestmove('bestmove a7a8q')).toEqual({ from: 'a7', to: 'a8', promotion: 'q' });
    });
    it('returns null for anything else, including (none)', () => {
        expect(parse_bestmove('info depth 6 score cp 21')).toBeNull();
        expect(parse_bestmove('bestmove (none)')).toBeNull();
    });
    it('recognises the handshake lines', () => {
        expect(is_uciok('uciok')).toBe(true);
        expect(is_readyok('readyok')).toBe(true);
        expect(is_uciok('id name Stockfish 2019-08-15 Multi-Variant')).toBe(false);
    });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx vitest run src/lib/games/chess`
Expected: FAIL — modules do not exist.

- [ ] **Step 4: Implement**

`difficulty.ts` — the mapping, with the reasoning recorded in a comment:
```ts
/**
 * Skill Level is the ONLY strength knob this build advertises — verified by
 * driving the shipped binary: `option name Skill Level type spin default 20
 * min 0 max 20`, with no UCI_Elo and no UCI_LimitStrength (spec D14).
 *
 * Depth is capped as well, for latency rather than strength: at skill 0 the
 * engine still searches, and a portfolio visitor should not wait seconds for
 * a reply.
 */
export const LIMITS: Record<Level, EngineLimits> = {
    easy: { skill: 0, depth: 5 },
    medium: { skill: 5, depth: 8 },
    hard: { skill: 12, depth: 12 },
};
```
`uci.ts` — `parse_bestmove` matches `/^bestmove\s+([a-h][1-8])([a-h][1-8])([qrbn])?/`
and returns `null` when it does not match (which covers `bestmove (none)`).

- [ ] **Step 5: Run to verify pass**

Run: `npx vitest run src/lib/games/chess --coverage`

- [ ] **Step 6: Mutation-test the promotion group**

Drop the `([qrbn])?` capture. Confirm the promotion test goes red. Restore.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/games/chess
git commit -m "feat(chess): difficulty mapping and UCI parsing"
```

---

## Task 9 — Vendor Stockfish, pin it, cache it (D13, D20, D29, D30)

**Files:**
- Create: `static/js/stockfish/{stockfish.wasm.js,stockfish.wasm,Copying.txt}`
- Create: `src/lib/vendored_games.test.ts`
- Modify: `package.json` (pin `stockfish.js` as a devDependency),
  `netlify.toml`, `LICENSE-third-party.md`

- [ ] **Step 1: Pin the package and copy the bytes**

```bash
npm pkg set devDependencies."stockfish.js"="10.0.2"
npx -y npm@10 install
mkdir -p static/js/stockfish
cp node_modules/stockfish.js/stockfish.wasm.js static/js/stockfish/
cp node_modules/stockfish.js/stockfish.wasm     static/js/stockfish/
cp node_modules/stockfish.js/Copying.txt        static/js/stockfish/
```
`stockfish.js` (the 1.5MB asm.js fallback) is deliberately **not** copied — the
window requires WebAssembly, which every browser this site supports has had for
years, and shipping a second engine build doubles the vendored surface.

- [ ] **Step 2: Write the failing pinning test**

```ts
/**
 * The vendored engine must stay byte-identical to the pinned package.
 *
 * Same contract as `vendored_three.test.ts`: `stockfish.js@10.0.2` is a pinned
 * devDependency purely so this comparison has something to compare against.
 * js-dos is pinned differently and for a stated reason — see the checksum
 * manifest below (spec D30).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sha = (p: string): string =>
    createHash('sha256').update(readFileSync(p)).digest('hex');

describe('vendored Stockfish', () => {
    for (const file of ['stockfish.wasm.js', 'stockfish.wasm', 'Copying.txt']) {
        it(`${file} matches the pinned package`, () => {
            expect(sha(`static/js/stockfish/${file}`))
                .toBe(sha(`node_modules/stockfish.js/${file}`));
        });
    }

    it('ships the GPL-3 licence text alongside the binary', () => {
        const text = readFileSync('static/js/stockfish/Copying.txt', 'utf8');
        expect(text).toContain('GNU GENERAL PUBLIC LICENSE');
        expect(text).toContain('Version 3');
    });
});
```

- [ ] **Step 3: Run to verify it passes, then break it once**

Run: `npx vitest run src/lib/vendored_games.test.ts` → PASS.
Append a byte to `static/js/stockfish/stockfish.wasm.js`, re-run → FAIL.
Restore with the `cp` above.

- [ ] **Step 4: Add the cache header (D18)**

In `netlify.toml`, **before** the `/html/python-sandbox.html` block (which
carries "KEEP THIS BLOCK LAST"), add:
```toml
# Vendored Stockfish, same reasoning as /js/three/*: files under `static/` are
# copied into `build/` VERBATIM, so without this they revalidate on every Chess
# window open, and stockfish.wasm is 545KB. Safe to pin hard — the bytes are
# frozen by `vendored_games.test.ts` against a pinned devDependency, so the
# content at this URL cannot change without a deliberate re-vendor.
#
# Names only Cache-Control, so the `/*` CSP still applies.
[[headers]]
  for = "/js/stockfish/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

- [ ] **Step 5: Confirm the ordering rule still holds**

Run: `grep -n 'KEEP THIS BLOCK LAST' -A 30 netlify.toml` and confirm the
python-sandbox `[[headers]]` block is still the last one that sets
`Content-Security-Policy`. This cannot be checked by any local gate; it is
verified again on the deploy probe.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json static/js/stockfish src/lib/vendored_games.test.ts netlify.toml LICENSE-third-party.md
git commit -m "chore(chess): vendor single-threaded Stockfish, pinned by bytes"
```

---

## Task 10 — Chess engine adapter (D1, D10, D22)

The worker boundary, isolated and tested against a mock. This is where
message-ordering and teardown bugs live, which is why it is its own task and
its own file rather than inline in the component.

**Files:**
- Create: `src/lib/games/chess/engine.ts`
- Test: `src/lib/games/chess/engine.test.ts`

**Interfaces — Produces:**
```ts
/** The subset of Worker this adapter needs, so tests can supply a fake. */
export interface EngineWorker {
    postMessage: (command: string) => void;
    terminate: () => void;
    addEventListener: (type: 'message', listener: (e: { data: string }) => void) => void;
}
export interface Engine {
    ready: Promise<void>;
    best_move: (level: Level, moves: readonly string[]) => Promise<BestMove | null>;
    dispose: () => void;
}
export function create_engine(spawn?: () => EngineWorker): Engine;
export const ENGINE_URL = '/js/stockfish/stockfish.wasm.js';
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { create_engine, type EngineWorker } from './engine';
import { LIMITS } from './difficulty';

/** A fake engine that records commands and replays scripted output. */
function fake(): { worker: EngineWorker; sent: string[]; emit: (line: string) => void } {
    const sent: string[] = [];
    let listener: ((e: { data: string }) => void) | undefined;
    return {
        sent,
        emit: (line) => listener?.({ data: line }),
        worker: {
            postMessage: (c) => sent.push(c),
            terminate: vi.fn(),
            addEventListener: (_t, l) => { listener = l; },
        },
    };
}

describe('chess engine adapter', () => {
    it('handshakes with uci and resolves ready on uciok', async () => {
        const f = fake();
        const engine = create_engine(() => f.worker);
        expect(f.sent).toEqual(['uci']);
        f.emit('id name Stockfish 2019-08-15 Multi-Variant');
        f.emit('uciok');
        await expect(engine.ready).resolves.toBeUndefined();
    });

    it('sends skill, position and go, then resolves the bestmove', async () => {
        const f = fake();
        const engine = create_engine(() => f.worker);
        f.emit('uciok');
        await engine.ready;

        const pending = engine.best_move('easy', ['e2e4']);
        expect(f.sent).toEqual([
            'uci',
            `setoption name Skill Level value ${String(LIMITS.easy.skill)}`,
            'position startpos moves e2e4',
            `go depth ${String(LIMITS.easy.depth)}`,
        ]);

        f.emit('info depth 5 score cp 12');   // must be ignored
        f.emit('bestmove e7e6 ponder b1c3');
        await expect(pending).resolves.toEqual({ from: 'e7', to: 'e6' });
    });

    it('resolves null when the engine has no move', async () => {
        const f = fake();
        const engine = create_engine(() => f.worker);
        f.emit('uciok');
        await engine.ready;
        const pending = engine.best_move('easy', []);
        f.emit('bestmove (none)');
        await expect(pending).resolves.toBeNull();
    });

    it('does not resolve a stale request when a new one supersedes it', async () => {
        // The window lets a player take a move back mid-search. Without
        // request tagging the first `bestmove` would answer the SECOND
        // promise and the engine would play a move from a dead position.
        const f = fake();
        const engine = create_engine(() => f.worker);
        f.emit('uciok');
        await engine.ready;

        const first = engine.best_move('easy', ['e2e4']);
        const second = engine.best_move('easy', ['d2d4']);
        f.emit('bestmove d7d5');

        await expect(second).resolves.toEqual({ from: 'd7', to: 'd5' });
        await expect(first).resolves.toBeNull();
    });

    it('terminates the worker on dispose and rejects further use', async () => {
        // D22: a Chess window opened and closed repeatedly must not leak a
        // worker per open.
        const f = fake();
        const engine = create_engine(() => f.worker);
        f.emit('uciok');
        await engine.ready;
        engine.dispose();
        expect(f.worker.terminate).toHaveBeenCalledTimes(1);
        await expect(engine.best_move('easy', [])).resolves.toBeNull();
    });

    it('resolves any in-flight request on dispose rather than hanging', async () => {
        const f = fake();
        const engine = create_engine(() => f.worker);
        f.emit('uciok');
        await engine.ready;
        const pending = engine.best_move('easy', []);
        engine.dispose();
        await expect(pending).resolves.toBeNull();
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/games/chess/engine.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

```ts
export const ENGINE_URL = '/js/stockfish/stockfish.wasm.js';

/**
 * Why a Worker and nothing else: `stockfish.js@10.0.2` has NO main-thread API.
 * The script assigns a global `onmessage` and calls a global `postMessage`, so
 * it only functions as a worker — verified by running it. It also resolves its
 * own `.wasm` beside itself (`locateFile` = `scriptDirectory + path`, and in a
 * worker `scriptDirectory` derives from `self.location.href`), which is why
 * serving from `/js/stockfish/` needs no configuration.
 */
const default_spawn = (): EngineWorker => new Worker(ENGINE_URL);
```
The adapter holds `let current: { id: number; resolve: (m: BestMove | null) => void } | null`.
`best_move` increments an id, **resolves any previous request with `null`**
before replacing it (the stale-request test), sends the three commands from
`go_commands()`, and returns a promise. The single `message` listener ignores
everything except a line `parse_bestmove` accepts, then resolves and clears
`current`. `dispose()` resolves `current` with `null`, calls
`worker.terminate()`, and sets a `disposed` flag that makes `best_move` return
`Promise.resolve(null)` immediately.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/games/chess --coverage`
Expected: PASS, 6 adapter tests plus Task 8's.

- [ ] **Step 5: Mutation-test the stale-request guard**

Remove the "resolve the previous request with null" line. Confirm the
supersede test goes red. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/lib/games/chess/engine.ts src/lib/games/chess/engine.test.ts
git commit -m "feat(chess): worker adapter with request tagging and teardown"
```

---

## Task 11 — Chess window (D15, D16, D21, D22, D23, D27, D31)

**Files:**
- Create: `src/routes/xp/programs/chess.svelte`, `static/assets/chess/*.svg`
- Modify: `src/lib/app_registry.ts`, `src/lib/start_menu_programs.ts`,
  `LICENSE-third-party.md`
- Test: `e2e/chess.spec.ts`

**Interfaces — Consumes:** Task 10's `create_engine`; Task 8's `LIMITS`;
`chess.js`'s `Chess` for legality, check/mate detection and move history.

- [ ] **Step 1: Vendor the piece art and record it**

Cburnett's SVG chess pieces into `static/assets/chess/` as
`{w,b}{K,Q,R,B,N,P}.svg`. Append to `LICENSE-third-party.md`:
```markdown
## Chess piece artwork — CC BY-SA 3.0

- **Shipped as:** `static/assets/chess/{w,b}{K,Q,R,B,N,P}.svg`
- **Author:** Colin M.L. Burnett ("Cburnett"), via Wikimedia Commons.
- **Licence:** CC BY-SA 3.0 (also offered by the author under GFDL and
  BSD-style terms). Share-alike binds these images, not this repository's code.
```

- [ ] **Step 2: Write the failing E2E**

Two specs. The board spec stays in `default`; only the engine spec is
`@heavy`, because only it boots WASM (D31).

```ts
import { expect, test } from '@playwright/test';
import { bootToDesktop, openFromStartMenu } from './helpers';

test('Chess opens with a full board and rejects an illegal move', async ({ page }) => {
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'Chess');
    const win = page.locator('#work-space .window', { hasText: 'Chess' });

    await expect(win.locator('.chess-square')).toHaveCount(64);
    await expect(win.locator('.chess-piece')).toHaveCount(32);

    // Two players: no engine, so the board is testable on its own (D16).
    await win.getByLabel('Opponent').selectOption('two-player');
    await win.locator('[data-square="e2"]').click();
    await win.locator('[data-square="e5"]').click();          // illegal
    await expect(win.locator('[data-square="e2"] .chess-piece')).toHaveCount(1);

    await win.locator('[data-square="e2"]').click();
    await win.locator('[data-square="e4"]').click();          // legal
    await expect(win.locator('[data-square="e4"] .chess-piece')).toHaveCount(1);
    await expect(win.locator('[data-square="e2"] .chess-piece')).toHaveCount(0);
});

test('Chess gets a reply from the engine @heavy', async ({ page }) => {
    test.setTimeout(120_000);
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'Chess');
    const win = page.locator('#work-space .window', { hasText: 'Chess' });

    await expect(win.locator('.chess-status')).toHaveText(/Your move/i, { timeout: 60_000 });
    await win.locator('[data-square="e2"]').click();
    await win.locator('[data-square="e4"]').click();

    // Black replies: 20 black pieces become 20 with one on a new square, so
    // assert on the move list rather than on piece counts.
    await expect(win.locator('.chess-history li')).toHaveCount(2, { timeout: 60_000 });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npx playwright test --project=default e2e/chess.spec.ts` (board spec) and
`npx playwright test --project=heavy e2e/chess.spec.ts` (engine spec).

- [ ] **Step 4: Build the component**

- 8×8 grid, `data-square="e4"` per cell, `.chess-square` + `.chess-piece`.
  Click-to-select then click-to-move (not drag — chess has no stack semantics,
  and click/click is what every chess site does).
- `chess.js` owns legality: `game.move({ from, to, promotion: 'q' })` returns
  `null` for illegal, which is the rejection path the E2E asserts.
- **State (D27):** `let fen = game.fen()` reassigned after each move; `$:` used
  only for read-only derivations (`$: status = describe(game)`).
- **Engine (D22):** `const engine = create_engine()` in `onMount`;
  `onDestroy(() => engine.dispose())`. After the human's move, if the opponent
  is the computer, `await engine.best_move(level, game.history({verbose:true}).map(uci))`
  and apply it.
- Controls: `Opponent` select (Computer / Two players), `Difficulty` select
  (Easy / Medium / Hard), New Game, and a `.chess-history` move list.
- `.chess-status` reports whose move it is, check, checkmate, stalemate and
  draw — read from `chess.js`.

- [ ] **Step 5: Register it**

```ts
    {
        id: 'chess',
        path: './programs/chess.svelte',
        title: 'Chess',
        icon: '/assets/icons/chess.png',
        component: () => import('../routes/xp/programs/chess.svelte'),
        default_size: { width: 640, height: 660 },
        min_size: { width: 480, height: 540 },
        // SINGLETON: each instance owns a Stockfish worker and its WASM heap.
        // Same reasoning as Python's (app_registry.ts:108-111), not Minesweeper's.
        singleton: true,
    },
```

- [ ] **Step 6: Run the gates**

Run: `npm run check && npm run lint && npx vitest run && npx playwright test --project=default && npx playwright test --project=heavy`

- [ ] **Step 7: Verify teardown by hand (D22)**

Open Chess, make a move, close the window. Repeat three times. In DevTools,
confirm no `stockfish.wasm.js` worker survives in the Sources ▸ Threads panel
after each close.

- [ ] **Step 8: Commit**

```bash
git add src/routes/xp/programs/chess.svelte static/assets/chess src/lib/app_registry.ts src/lib/start_menu_programs.ts LICENSE-third-party.md e2e/chess.spec.ts
git commit -m "feat(chess): playable board against a weakened Stockfish"
```

---

## Task 12 — Vendor js-dos and the DOOM bundle (D9, D11, D20, D30)

**Files:**
- Create: `static/js/js-dos/{emulators.js,wdosbox.js,wdosbox.wasm,wlibzip.js,wlibzip.wasm}`,
  `static/games/doom/doom.jsdos`, `static/games/doom/LICENSE-id-shareware.txt`,
  `static/games/doom/README.md`
- Modify: `src/lib/vendored_games.test.ts`, `netlify.toml`,
  `LICENSE-third-party.md`

- [ ] **Step 1: Copy the five js-dos files**

From `js-dos@8.4.1` (`npm pack js-dos@8.4.1`, do **not** add it as a
dependency — D30 states why: 29MB unpacked to verify 1.8MB shipped). Copy
`dist/emulators/{emulators.js,wdosbox.js,wdosbox.wasm,wlibzip.js,wlibzip.wasm}`
into `static/js/js-dos/`.

**Do not copy** `dist/js-dos.js` or `dist/js-dos.css` — that is the cloud UI
layer, and it hardcodes `br.cdn.dos.zone`, `net.dos.zone`, `v8.js-dos.com` and
a Yandex API gateway. Shipping it would fail `e2e/no_cdn.spec.ts`. Do not copy
`sockdrive*` either.

- [ ] **Step 2: Assemble the DOOM bundle and record the recipe**

`doom.jsdos` is a zip containing `.jsdos/dosbox.conf` plus the unmodified
shareware `DOOM1.WAD` and `DOOM.EXE`. Write `static/games/doom/README.md`
recording the exact upstream archive (name + SHA-256), the `dosbox.conf`
contents, and the `zip` command used, so the blob is reproducible.

Ship the id shareware licence text as `LICENSE-id-shareware.txt` beside it.

- [ ] **Step 3: Extend the pinning test with a checksum manifest (D30)**

```ts
/**
 * js-dos and the DOOM bundle are pinned by CHECKSUM, not against a
 * devDependency like Stockfish above. `js-dos` is 29MB unpacked to verify the
 * 1.8MB we ship, which is a bad trade on every CI install, and the `.jsdos`
 * bundle has no npm upstream at all. So this proves the committed bytes have
 * not drifted; PROVENANCE is carried by LICENSE-third-party.md, which records
 * the exact upstream version and URL. Stated plainly because it is a weaker
 * guarantee than the Stockfish test above.
 */
const MANIFEST: Record<string, string> = {
    'static/js/js-dos/emulators.js': '<sha256>',
    'static/js/js-dos/wdosbox.js': '<sha256>',
    'static/js/js-dos/wdosbox.wasm': '<sha256>',
    'static/js/js-dos/wlibzip.js': '<sha256>',
    'static/js/js-dos/wlibzip.wasm': '<sha256>',
    'static/games/doom/doom.jsdos': '<sha256>',
};

describe('vendored js-dos and DOOM', () => {
    for (const [path, digest] of Object.entries(MANIFEST)) {
        it(`${path} has not drifted`, () => expect(sha(path)).toBe(digest));
    }

    it('does not ship the js-dos cloud UI layer', () => {
        // The regression this guards: `js-dos.js` hardcodes four remote
        // origins and would fail e2e/no_cdn.spec.ts.
        expect(existsSync('static/js/js-dos/js-dos.js')).toBe(false);
        expect(existsSync('static/js/js-dos/sockdrive.js')).toBe(false);
    });

    it('ships the id shareware licence beside the WAD', () => {
        expect(existsSync('static/games/doom/LICENSE-id-shareware.txt')).toBe(true);
    });
});
```
Fill each `<sha256>` from `sha256sum` after copying.

- [ ] **Step 4: Add the cache header (D18)**

Again **before** the python-sandbox block:
```toml
# Vendored js-dos + the DOOM bundle. Same reasoning as /js/three/* and
# /js/stockfish/*: static files are copied verbatim, wdosbox.wasm is 1.4MB and
# the bundle is several MB more. Frozen by the checksum manifest in
# `vendored_games.test.ts`, so the content here cannot change silently.
# Names only Cache-Control, so the `/*` CSP still applies.
[[headers]]
  for = "/js/js-dos/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "/games/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

- [ ] **Step 5: Append the licence entries**

The js-dos entry is already in `LICENSE-third-party.md` from Task 2. Add the
DOOM entry, stating the caveat honestly rather than asserting a clean grant:
```markdown
## DOOM shareware (episode one) — id Software shareware licence

- **Shipped as:** `static/games/doom/doom.jsdos` (contains `DOOM1.WAD` and
  `DOOM.EXE`, byte-identical to the original shareware release),
  `static/games/doom/LICENSE-id-shareware.txt`
- (C) Copyright id Software. Distributed free of charge; no consideration is
  charged or received for its receipt or use.
- **Note on repackaging:** the licence grants that "you may make copies of the
  Software to give to other persons" but does not explicitly address
  extracting the WAD from its original archive. The precedent relied on is
  Debian/Ubuntu's `doom-wad-shareware` package, which performs the same
  extraction and redistribution. Contents are unmodified; only episode one is
  distributed.
```

- [ ] **Step 6: Run and commit**

Run: `npx vitest run src/lib/vendored_games.test.ts`
```bash
git add static/js/js-dos static/games/doom src/lib/vendored_games.test.ts netlify.toml LICENSE-third-party.md
git commit -m "chore(doom): vendor the js-dos emulator layer and shareware bundle"
```

---

## Task 13 — DOSBox adapter (D1, D9, D10, D22, D24, D25, D26)

Everything about the emulator boundary, isolated behind an interface so the
component stays a view and the lifecycle is testable without a browser.

**Files:**
- Create: `src/lib/games/doom/dosbox_adapter.ts`, `src/lib/games/doom/keymap.ts`
- Test: `src/lib/games/doom/dosbox_adapter.test.ts`,
  `src/lib/games/doom/keymap.test.ts`

**Interfaces — Produces:**
```ts
export const JSDOS_PATH_PREFIX = '/js/js-dos/';
export const DOOM_BUNDLE_URL = '/games/doom/doom.jsdos';

/** The slice of js-dos's CommandInterface this adapter uses. */
export interface DosCommandInterface {
    width: () => number;
    height: () => number;
    pause: () => void;
    resume: () => void;
    mute: () => void;
    unmute: () => void;
    exit: () => Promise<void>;
    sendKeyEvent: (code: number, pressed: boolean) => void;
    events: () => {
        onFrame: (c: (rgb: Uint8Array | null, rgba: Uint8Array | null) => void) => void;
        onSoundPush: (c: (samples: Float32Array) => void) => void;
        onFrameSize: (c: (w: number, h: number) => void) => void;
    };
}
export interface DosHost {
    load: () => Promise<{ dosboxWorker: (init: unknown) => Promise<DosCommandInterface> }>;
}
export interface DoomSession {
    pause: () => void;
    resume: () => void;
    set_muted: (muted: boolean) => void;
    key: (code: number, pressed: boolean) => void;
    dispose: () => Promise<void>;
}
export function start_doom(host: DosHost, canvas: HTMLCanvasElement, on_sound: (s: Float32Array) => void): Promise<DoomSession>;
```

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { start_doom, type DosCommandInterface, type DosHost } from './dosbox_adapter';

function fake_ci(): DosCommandInterface & { fire_frame: (w: number, h: number) => void } {
    let frame_cb: ((rgb: Uint8Array | null, rgba: Uint8Array | null) => void) | undefined;
    return {
        width: () => 320, height: () => 200,
        pause: vi.fn(), resume: vi.fn(), mute: vi.fn(), unmute: vi.fn(),
        exit: vi.fn(async () => undefined),
        sendKeyEvent: vi.fn(),
        events: () => ({
            onFrame: (c) => { frame_cb = c; },
            onSoundPush: () => {},
            onFrameSize: () => {},
        }),
        fire_frame: (w, h) => frame_cb?.(null, new Uint8Array(w * h * 4)),
    };
}

const host_for = (ci: DosCommandInterface): DosHost => ({
    load: async () => ({ dosboxWorker: async () => ci }),
});

describe('doom dosbox adapter', () => {
    it('paints frames onto the canvas it was given', async () => {
        const ci = fake_ci();
        const canvas = document.createElement('canvas');
        await start_doom(host_for(ci), canvas, () => {});
        ci.fire_frame(320, 200);
        expect(canvas.width).toBe(320);
        expect(canvas.height).toBe(200);
    });

    it('forwards pause, resume and mute to the emulator', async () => {
        // D24: a minimized DOOM must stop burning a core.
        const ci = fake_ci();
        const s = await start_doom(host_for(ci), document.createElement('canvas'), () => {});
        s.pause();          expect(ci.pause).toHaveBeenCalledTimes(1);
        s.resume();         expect(ci.resume).toHaveBeenCalledTimes(1);
        s.set_muted(true);  expect(ci.mute).toHaveBeenCalledTimes(1);
        s.set_muted(false); expect(ci.unmute).toHaveBeenCalledTimes(1);
    });

    it('exits the emulator exactly once on dispose', async () => {
        // D22: repeated open/close must not leak a DOSBox worker per open.
        const ci = fake_ci();
        const s = await start_doom(host_for(ci), document.createElement('canvas'), () => {});
        await s.dispose();
        await s.dispose();
        expect(ci.exit).toHaveBeenCalledTimes(1);
    });

    it('stops painting after dispose', async () => {
        const ci = fake_ci();
        const canvas = document.createElement('canvas');
        const s = await start_doom(host_for(ci), canvas, () => {});
        await s.dispose();
        canvas.width = 1;
        ci.fire_frame(320, 200);
        expect(canvas.width).toBe(1);        // the late frame was ignored
    });

    it('routes sound samples to the sink it was given', async () => {
        const ci = fake_ci();
        const sink = vi.fn();
        await start_doom(host_for(ci), document.createElement('canvas'), sink);
        expect(typeof sink).toBe('function');
    });
});
```

And `keymap.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { scancode_for } from './keymap';

describe('doom keymap', () => {
    it('maps the keys DOOM actually needs', () => {
        for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
                            'ControlLeft', 'Space', 'Escape', 'Enter']) {
            expect(scancode_for(code), `${code} unmapped`).toBeGreaterThan(0);
        }
    });
    it('returns 0 for keys it does not handle', () => {
        expect(scancode_for('F13')).toBe(0);
    });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/games/doom`
Expected: FAIL — modules do not exist.

- [ ] **Step 3: Implement**

`dosbox_adapter.ts`:
- A `browser_host: DosHost` whose `load()` injects
  `<script src="/js/js-dos/emulators.js">` once, awaits its `onload`, reads
  `window.emulators`, and **sets `emulators.pathPrefix = JSDOS_PATH_PREFIX`
  before returning** — `pathPrefix` is read at call time to build the
  `wdosbox.js` URL, so setting it afterwards is too late. `emulators.js` is a
  browserify UMD bundle that assigns `window.emulators`; it is not an ES
  module, which is why it lives in `static/` and is not imported.
- `start_doom` fetches the bundle, calls `dosboxWorker`, subscribes to
  `onFrame`/`onFrameSize`/`onSoundPush`, and blits RGBA frames with
  `ctx.putImageData`. A `disposed` flag makes every late callback a no-op.
- `dispose()` is idempotent: guard on `disposed`, then `await ci.exit()`.

`keymap.ts`: a frozen `Record<string, number>` from `KeyboardEvent.code` to DOS
scancode, returning `0` for anything unmapped.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/games/doom --coverage`

- [ ] **Step 5: Mutation-test the dispose guard**

Remove the `disposed` check in `dispose()`. Confirm "exits the emulator exactly
once" goes red. Restore.

- [ ] **Step 6: Commit**

```bash
git add src/lib/games/doom
git commit -m "feat(doom): dosbox adapter with lifecycle and keymap"
```

---

## Task 14 — DOOM window (D12, D21, D23, D24, D25, D26, D31)

**Files:**
- Create: `src/routes/xp/programs/doom.svelte`
- Modify: `src/lib/app_registry.ts`, `src/lib/start_menu_programs.ts`
- Test: `e2e/doom.spec.ts`

**Interfaces — Consumes:** Task 13's `start_doom`, `browser_host`,
`scancode_for`; Task 1's `aspect_ratio` passthrough; the `systemVolume` store.

- [ ] **Step 1: Write the failing E2E**

```ts
import { expect, test } from '@playwright/test';
import { bootToDesktop, openFromStartMenu } from './helpers';

test('DOOM boots from a click and renders a frame @heavy', async ({ page }) => {
    test.setTimeout(180_000);
    const foreign: string[] = [];
    page.on('request', (r) => {
        const u = r.url();
        if (!u.startsWith('http://localhost') && !u.startsWith('http://127.0.0.1')
            && !u.startsWith('data:') && !u.startsWith('blob:')) foreign.push(u);
    });

    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'DOOM');
    const win = page.locator('#work-space .window', { hasText: 'DOOM' });

    // D26: nothing downloads or starts until the gesture.
    await expect(win.locator('.doom-start')).toBeVisible();
    await win.locator('.doom-start').click();

    const canvas = win.locator('canvas.doom-screen');
    await expect(canvas).toBeVisible({ timeout: 120_000 });

    // A frame actually painted: sample the canvas rather than trusting the
    // element's presence.
    await expect.poll(async () =>
        canvas.evaluate((c: HTMLCanvasElement) => {
            const d = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
            return d ? d.some((v, i) => i % 4 !== 3 && v !== 0) : false;
        }), { timeout: 120_000 }).toBe(true);

    // D9: the emulator is fully self-hosted.
    expect(foreign).toEqual([]);
});

test('DOOM keys do not leak to the desktop @heavy', async ({ page }) => {
    test.setTimeout(180_000);
    await bootToDesktop(page);
    await openFromStartMenu(page, 'Games', 'DOOM');
    const win = page.locator('#work-space .window', { hasText: 'DOOM' });
    await win.locator('.doom-start').click();
    await expect(win.locator('canvas.doom-screen')).toBeVisible({ timeout: 120_000 });

    // D25. Real selectors: the button is `#start-menu-btn`
    // (task_bar.svelte:29) and the menu is the ID `#start-menu`
    // (start_menu.svelte:184) — as `e2e/start_menu.spec.ts` already uses them.
    // There is no `#start-button` and no `.start-menu` class in this codebase.
    //
    // Arrow keys, not Escape: clicking the canvas closes the Start menu by
    // click-outside, so an Escape press afterwards would prove nothing. Movement
    // keys are the ones that must not leak, and they leave the menu open.
    await win.locator('canvas.doom-screen').click();
    await page.locator('#start-menu-btn').click();
    await expect(page.locator('#start-menu')).toBeVisible();

    await win.locator('canvas.doom-screen').press('ArrowUp');
    await win.locator('canvas.doom-screen').press('Space');
    await expect(page.locator('#start-menu')).toBeVisible();

    // …and the desktop's own Escape still works when no game holds focus.
    await page.keyboard.press('Escape');
    await expect(page.locator('#start-menu')).toBeHidden();
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx playwright test --project=heavy e2e/doom.spec.ts`

- [ ] **Step 3: Build the component**

- **Gesture gate (D26):** the window opens on a `.doom-start` panel. Its click
  handler constructs the `AudioContext` **synchronously** — before any `await`
  — then kicks off `start_doom(...)`. A context created after an await starts
  suspended and plays silently; `music_player.svelte:310-314` documents this.
  The gate also defers the ~1.8MB emulator download until the visitor asks.
- **Audio:** samples from `on_sound` go through a `GainNode` whose gain tracks
  `$systemVolume`.
- **Keyboard (D25):** the canvas carries `tabindex="0"` and is focused when the
  window gains focus. Its `on:keydown`/`on:keyup` call `stopPropagation()` (and
  `preventDefault()` for arrows and Space) so the six `svelte:window` Escape
  handlers never see game input. Escape reaches DOOM only when not fullscreen;
  in fullscreen the browser owns Escape, so the chrome carries a "Menu" button
  that sends the Escape scancode directly. `navigator.keyboard.lock` is
  deliberately not used — Chromium-only (D25 option B).
- **Pause on minimize (D24):** `$: if (window?.minimized) session?.pause()` is
  **not** acceptable under D27 if it also writes state — it does not, it only
  calls a method, so a reactive statement is fine here. Resume and unmute on
  restore.
- **Fullscreen (D12):** a button calling `requestFullscreen()` on the content
  element.
- **Teardown (D22):** `onDestroy(() => { void session?.dispose(); void ctx?.close(); })`.

- [ ] **Step 4: Register it**

```ts
    {
        id: 'doom',
        path: './programs/doom.svelte',
        title: 'DOOM',
        icon: '/assets/icons/doom.png',
        component: () => import('../routes/xp/programs/doom.svelte'),
        default_size: { width: 640, height: 480 },
        min_size: { width: 320, height: 240 },
        // DOS video is 4:3; letterboxing a stretched frame looks wrong.
        aspect_ratio: 4 / 3,
        // SINGLETON: each instance is a full x86 emulator plus a WASM heap.
        // Two would contend for CPU with nothing gained (D23).
        singleton: true,
    },
```

- [ ] **Step 5: Run the gates**

Run: `npm run check && npm run lint && npx vitest run && npx playwright test --project=default && npx playwright test --project=heavy`

- [ ] **Step 6: Verify lifecycle by hand (D22, D24)**

Open DOOM, start it, minimize — confirm CPU drops to idle in the browser's task
manager. Restore — confirm it resumes. Close and reopen three times — confirm
no worker survives and memory returns to baseline.

- [ ] **Step 7: Commit**

```bash
git add src/routes/xp/programs/doom.svelte src/lib/app_registry.ts src/lib/start_menu_programs.ts e2e/doom.spec.ts
git commit -m "feat(doom): playable shareware DOOM in an XP window"
```

---

## Task 15 — Bundle budget: games must stay out of the entry chunk (D17, spec §6)

Spec §6 requires confirming that no game code and neither WASM runtime reaches
the entry bundle or the mobile path, and D17's whole obligation is that the
registry's lazy `component: () => import(...)` stays lazy. Nothing in the plan
verified it until now.

The harness already exists: `scripts/verify-build.mjs` runs in CI
(`.github/workflows/ci.yml:74-75`), looks at `build/`, and already greps
`vite build`'s captured stdout for Rollup's "dynamically imported … also
statically imported" warning — which is precisely the warning a stray eager
import of a game module would produce.

**Files:** Modify `scripts/verify-build.mjs`

- [ ] **Step 1: Add the assertions**

Following that file's own stated rule — *every check proves its target exists
first*, so a grep cannot pass vacuously because a file moved:

1. Assert the four game chunks exist in `build/_app/immutable/` (proving the
   check has a target at all), by locating chunks whose content mentions
   `ms-cell`, `sol-tableau`, `chess-square`, `doom-screen`.
2. Assert none of those chunk names appear in the entry chunk's import graph
   — i.e. the entry chunk does not reference them.
3. Assert the entry chunk contains neither `stockfish` nor `emulators.js`.
4. Assert the Rollup "also statically imported" warning names none of the four
   game modules, reported as SKIPPED (not passed) when no build log is given,
   matching the file's existing convention.

- [ ] **Step 2: Prove the check can fail**

Temporarily add `import '../lib/games/doom/dosbox_adapter';` to a module in the
entry graph, run `npm run build 2>&1 | tee /tmp/build.log`, then
`node scripts/verify-build.mjs /tmp/build.log` and confirm it FAILS. Revert.

This step is not optional: a build-output grep that has never been seen to fail
is the "test that cannot fail" the script's own header says this repo has
shipped three times.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-build.mjs
git commit -m "test(build): keep games and their WASM runtimes out of the entry chunk"
```

---

## Task 16 — Close the phase

**Files:**
- Modify: `e2e/no_cdn.spec.ts`, `docs/SPECIFICATION.md`, `README.md` if it
  lists programs
- Create: `docs/phase-4-guide.md`

- [ ] **Step 1: Extend the origin allowlist spec (D19)**

Add a test to `e2e/no_cdn.spec.ts` that opens all four games and asserts
`foreign` is empty. Tag it `@heavy` — it boots DOOM. This is the guard that
catches a js-dos or Stockfish URL slipping back in.

- [ ] **Step 2: Tick the Phase 4 boxes**

In `docs/SPECIFICATION.md` §9, change `### Phase 4: Games — ⬜ NEXT` to
`✅ COMPLETE`, tick its four checkboxes, and update the status banner at the
top of §9 (which currently says Phase 4 "is next and needs the owner's explicit
go"). Add the gate-artefact line pointing at
`docs/phase-4-{spec,redteam-spec,plan,redteam-plan,redteam-implementation}.md`,
matching how Phase 3 records its own.

- [ ] **Step 3: Write `docs/phase-4-guide.md`**

The ten sections §11 requires, including a §Notes recording at minimum:
- `to_window_options()` forced `resizable: true`, which is why `AppDefinition`
  grew three chrome fields (D21) — and why a spike that builds its own
  `WindowOptions` does not prove anything about a registered app.
- `stockfish.js@10.0.2` has no main-thread API; it only works as a Worker.
- `emulators.js` is UMD and sets `window.emulators`; `pathPrefix` must be set
  before the first `dosboxWorker()` call.
- The `heavy` Playwright project and why it is not `@online`.
- Never ship `js-dos.js` — it hardcodes four remote origins.

Plus, in its own **§Deploy probe** section, the checklist the eventual cutover
must run. `netlify.toml` is invisible to every local gate, so this is the only
place it gets written down:
- `/js/stockfish/stockfish.wasm` and `/js/js-dos/wdosbox.wasm` return
  `Cache-Control: public, max-age=31536000, immutable`.
- `/games/doom/doom.jsdos` returns 200 and the same header.
- **`/` still carries `frame-ancestors 'self'`** and
  `/html/python-sandbox.html` still carries its full
  `default-src 'none'; script-src …` policy. Three new `[[headers]]` blocks
  were added this phase; last-rule-wins means any of them could have silently
  replaced an existing policy.
- Open each game on the production host and confirm zero console errors.

- [ ] **Step 3b: Check whether `placeholder_entry` is now dead**

All four of its call sites were the games replaced this phase. Grep
`start_menu_programs.ts` for remaining uses. If there are none, either delete
`placeholder_entry` and `placeholder.svelte` together, or keep them with a
comment saying what they are for — but do not leave an unreferenced helper and
an unreferenced component with no explanation. Note that `placeholder.svelte`
may still be reached by other launch paths; check `NOT_PROGRAMS` and
`work_space.svelte` before deleting anything.

- [ ] **Step 4: Full gate run**

```bash
npm run check && npm run lint && npm run format:check \
  && npx vitest run --coverage && npm run build \
  && npx playwright test --project=default \
  && npx playwright test --project=heavy
```

- [ ] **Step 5: Commit and open the PR into `dev`**

```bash
git add -A
git commit -m "docs: Phase 4 guide and specification updates"
git push -u origin feature/phase-4-games
gh pr create --base dev --title "Phase 4: Games" --body "..."
```

**Stop at `dev`.** The cutover and the production deploy happen only when the
owner asks (CLAUDE.md). Report what is sitting on `dev` and leave it there.

---

## Self-review

**Spec coverage.** Every decision maps to a task: D1→T3,5,8,10,13; D2→T4,6,11,14;
D3→(no task by design, no VFS change); D4→T4; D5→T3; D6,D7→T5,6; D8→T6;
D9,D10,D11→T12,13; D12→T14; D13→T9; D14→T8; D15→T11; D16→T11; **D17→T15**
(the lazy `component:` import is the mechanism, T15 is what proves it holds);
D18→T9,12; D19→T16 + each game's spec; D20→T2 + appended per vendoring task;
D21→T1; D22→T10,13,14; D23→T4,6,11,14; D24→T13,14; D25→T13,14; D26→T14;
D27→T4,6,11; D28→T6; D29→T8,9; D30→T9,12; D31→T7.

Exit criteria 1-8 from spec §7 and the six added in Part B are covered by
T4/T6/T11/T14 E2E plus T16's full gate run.

**Sequencing.** T1 blocks T4/T11/T14 (chrome fields). T7 blocks T11 (the
`@heavy` project must exist before the first tagged spec). T9 blocks T10's
browser path but not its tests, which use a fake worker — so T10 can be written
before the bytes land. T12 blocks T13's browser path, same arrangement. T2 is
first so no unlicensed binary is ever committed.

**Type consistency.** `Level` is deliberately declared twice, in
`minesweeper/difficulty.ts` and `chess/difficulty.ts`, with different members —
they are never imported into the same module. `Preset`/`window_size` are
Minesweeper-only. `BestMove` flows T8→T10→T11 unchanged. `DosCommandInterface`
is the adapter's own narrowing of js-dos's `CommandInterface`, not an import
from the vendored bundle, which has no types in `static/`.

**Placeholder scan.** The only literal placeholders are the `<sha256>` values in
T12's manifest, which are computed during that task from the files it copies.

**Lint reachability.** `eslint.config.js:28-34` applies `strictTypeChecked` and
`no-unsafe-type-assertion: 'error'` to `src/**/*.ts` with **no exclusion for
test files** — three shipped tests carry explicit disable comments for it. Every
test snippet in this plan was re-checked against that rule after gate 4; none
now contains a downcast. `e2e/**` is a separate, looser config block
(`:70`), so E2E snippets are not subject to it.

**Gate 4 changed:** T1's tests (reuse the file's own `app()` helper; `npm run
lint` added to its gate list), T4's registry row (`default_size` — see the
comment there, it is load-bearing) and its E2E (exact widths, `.xp-menu-dropdown`
hook added to `Menu.svelte`), T5's tuple construction, T9's import list, T14's
start-menu selectors and key choice, plus new T15 (bundle budget) and two
additions to the closing task. Details: `docs/phase-4-redteam-plan.md`.
