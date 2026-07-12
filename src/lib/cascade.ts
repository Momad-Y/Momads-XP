/**
 * Window-cascade spawn positions (§4.1 "Cascade"; design decision 12 — BUILD
 * work, the base has none: rect-less windows opened dead-center and
 * Window.svelte's calc_nudges only offsets same-app duplicates with a saved
 * rect).
 *
 * Windows without a saved rect open at the centered base + n·(24,24),
 * wrapping back to the base before the window would cross the workspace's
 * bottom or right edge (the workspace already excludes the taskbar).
 * Saved-rect behavior is unchanged.
 */

export const CASCADE_STEP = 24;

export interface CascadeDims {
    win_width: number;
    win_height: number;
    workspace_width: number;
    workspace_height: number;
}

export interface WindowPosition {
    top: number;
    left: number;
}

export function cascade_position(
    spawn_index: number,
    dims: CascadeDims,
): WindowPosition {
    const base_top = Math.max(0, (dims.workspace_height - dims.win_height) / 2);
    const base_left = Math.max(0, (dims.workspace_width - dims.win_width) / 2);
    const max_down = Math.floor(
        (dims.workspace_height - dims.win_height - base_top) / CASCADE_STEP,
    );
    const max_right = Math.floor(
        (dims.workspace_width - dims.win_width - base_left) / CASCADE_STEP,
    );
    const slots = Math.max(1, Math.min(max_down, max_right) + 1);
    const step = spawn_index % slots;
    return {
        top: base_top + step * CASCADE_STEP,
        left: base_left + step * CASCADE_STEP,
    };
}

let spawn_index = 0;

/** Module-level spawn cursor: one increment per rect-less window mount. */
export function next_cascade_position(dims: CascadeDims): WindowPosition {
    const position = cascade_position(spawn_index, dims);
    spawn_index += 1;
    return position;
}

/** Test-only reset for the module-level cursor. */
export function reset_cascade(): void {
    spawn_index = 0;
}
