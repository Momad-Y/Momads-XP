/**
 * Row arithmetic for redrawing an input line that may WRAP.
 *
 * Both terminals used to redraw with `CR + CLEAR_LINE_RIGHT + prompt + buffer`.
 * `\r` returns to column 0 of the row the cursor is CURRENTLY on and `\x1b[0K`
 * clears only that row, so the moment the input line grew past the window's
 * width every keystroke reprinted the prompt onto the last visual row and left
 * the earlier rows behind — a duplicated prompt and a line that never
 * recovered. It was reachable before filesystem navigation existed (`echo`
 * with a long argument) and becomes routine with it: the longest seeded
 * filename is 71 characters, which at the `momad@xp:~/Certifications$ ` prompt
 * is a 102-column line inside a ~78-column default window.
 *
 * Pure string math, deliberately outside the components: CMD and the Python
 * REPL both redraw, and this repo's scar tissue is full of one rule applied at
 * one of two call sites. `theme.ts` says the same thing about appearance.
 */
import { CR, CRLF, CSI, visible_length } from './ansi';

/** Erase from the cursor to the end of the SCREEN, not the end of the line. */
export const CLEAR_SCREEN_DOWN = `${CSI}0J`;

/**
 * Columns to assume when there is no terminal to ask.
 *
 * Matches `Terminal.svelte`'s own disposed-state fallback, so a redraw during
 * mount or teardown uses the same grid the component would have reported.
 */
export const DEFAULT_COLS = 80;

export interface LineRender {
    /** Everything to write, cursor placement included. */
    text: string;
    /**
     * Rows between the first row of the line and the row the cursor ends on.
     *
     * Feed it back as `prev_cursor_row` on the next call: it is exactly how
     * far the next redraw has to climb before it can clear downward. Reset it
     * to 0 after writing anything else (a command's output, a fresh prompt),
     * because the cursor is then back on a line of its own.
     */
    cursor_row: number;
}

export interface LineRenderOptions {
    /** May contain ANSI colour; measured with `visible_length`. */
    prompt: string;
    buffer: string;
    cursor: number;
    /** The terminal's current column count, from `TerminalHandle.size()`. */
    cols: number;
    prev_cursor_row: number;
}

export function render_line({
    prompt,
    buffer,
    cursor,
    cols,
    prev_cursor_row,
}: LineRenderOptions): LineRender {
    // A zero would divide by zero below. xterm reports 0 for a host element
    // that has not been laid out yet, which is a real state during mount.
    const width = Math.max(1, cols);
    const start = visible_length(prompt);
    const end = start + buffer.length;
    const at = start + Math.max(0, Math.min(buffer.length, cursor));

    let text = '';
    // Climb to the line's FIRST row before clearing, or the clear only reaches
    // the rows below the cursor and leaves the wrapped remainder on screen.
    if (prev_cursor_row > 0) text += `${CSI}${String(prev_cursor_row)}A`;
    text += CR + CLEAR_SCREEN_DOWN + prompt + buffer;

    // Text ending exactly on the right margin leaves the cursor in xterm's
    // "pending wrap" state — still on the old row, one column past the end —
    // and the arithmetic below would then be one row out. Forcing the newline
    // puts it somewhere both we and the terminal agree on.
    if (end > 0 && end % width === 0) text += CRLF;

    const end_row = Math.floor(end / width);
    const cursor_row = Math.floor(at / width);
    const cursor_col = at % width;

    // Absolute placement (up N, column 0, right N) rather than `\x1b[{n}D`:
    // CUB stops dead at column 0 and cannot walk back across a wrapped row,
    // which is why the old single-row form could not have been patched.
    const up = end_row - cursor_row;
    if (up > 0) text += `${CSI}${String(up)}A`;
    text += CR;
    if (cursor_col > 0) text += `${CSI}${String(cursor_col)}C`;

    return { text, cursor_row };
}
