/**
 * The three XP difficulty presets and the window geometry they imply.
 *
 * Geometry lives here rather than in the component because `app_registry.ts`
 * needs it too: a registered app's `default_size` is the ONLY thing that sizes
 * its window. `work_space.svelte` mounts registry apps with an explicit
 * `options` prop, and Svelte replaces a component's own default wholesale
 * rather than merging into it, so `minesweeper.svelte`'s `options` default
 * never runs on that path. One source of truth avoids the two drifting.
 */
export type Level = 'beginner' | 'intermediate' | 'expert';

export interface Preset {
    cols: number;
    rows: number;
    mines: number;
    label: string;
}

/** SPECIFICATION.md §3.3. */
export const PRESETS: Record<Level, Preset> = {
    beginner: { cols: 9, rows: 9, mines: 10, label: 'Beginner' },
    intermediate: { cols: 16, rows: 16, mines: 40, label: 'Intermediate' },
    expert: { cols: 30, rows: 16, mines: 99, label: 'Expert' },
};

export const LEVELS: Level[] = ['beginner', 'intermediate', 'expert'];

/** Cell edge in CSS px — XP's sprite grid. */
export const CELL_PX = 16;

/*
 * THE CHROME AROUND THE GRID, term by term.
 *
 * These were flat guesses (20 and 62) and both were far too small, so the
 * board overflowed its own window on every difficulty: the bottom three rows
 * of a Beginner game rendered below the window frame, a scrollbar appeared,
 * and the scrollbar then clipped the right-hand column. Written out as a sum
 * so the next person can check it against the markup instead of trusting a
 * number, because the two tests that looked like they covered this could not:
 * `minesweeper.spec.ts` derived its expected width from FRAME_W itself, and
 * the unit tests only compared presets to each other.
 *
 * Every term is read off `minesweeper.svelte`'s own classes.
 */
/** `Window.svelte`'s titlebar — `h-7`. */
const TITLEBAR_H = 28;
/** The `Game` menu bar. */
const MENUBAR_H = 25;
/** `div.grow p-[6px]` around the sunken panel. */
const OUTER_PAD = 6;
/** `p-[6px]` inside the sunken panel. */
const INNER_PAD = 6;
/** `border-2`, on the sunken panel and again on the grid. */
const BEVEL = 2;
/** The counter / smiley / timer row: 26px face + `py-[3px]` + its bevel. */
const HEADER_H = 35;
/** `mb-[6px]` under that row. */
const HEADER_GAP = 6;

/** Left+right chrome: outer padding, panel bevel, inner padding, grid bevel. */
export const FRAME_W = 2 * (OUTER_PAD + BEVEL + INNER_PAD + BEVEL);
/** Everything above and below the grid, titlebar and menu bar included. */
export const FRAME_H =
    TITLEBAR_H +
    MENUBAR_H +
    2 * (OUTER_PAD + BEVEL + INNER_PAD) +
    HEADER_H +
    HEADER_GAP +
    2 * BEVEL;

export function window_size(preset: Preset): { width: number; height: number } {
    return {
        width: preset.cols * CELL_PX + FRAME_W,
        height: preset.rows * CELL_PX + FRAME_H,
    };
}
