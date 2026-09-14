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
/** Left+right border around the grid. */
export const FRAME_W = 20;
/** Top border + the counter/smiley header + bottom border. */
export const FRAME_H = 62;

export function window_size(preset: Preset): { width: number; height: number } {
    return {
        width: preset.cols * CELL_PX + FRAME_W,
        height: preset.rows * CELL_PX + FRAME_H,
    };
}
