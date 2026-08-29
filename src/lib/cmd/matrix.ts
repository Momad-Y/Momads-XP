/**
 * The `matrix` easter egg's SIMULATION, as a pure module.
 *
 * Same split as `hack.ts`: the component owns the clock and the terminal, and
 * everything decidable without a DOM is decided — and tested — here.
 *
 * The rain is painted as a FULL-SCREEN REPAINT rather than as scrolling rows.
 * The original wrote one 70-column row per frame and let xterm scroll it, which
 * has two problems once the egg runs until interrupted: it never actually fills
 * the screen (it fills upward from the bottom over a few seconds), and every
 * frame is a new line in a 2000-line scrollback, so an infinite run would erase
 * the visitor's history behind it. Repainting the same cells costs a fixed
 * amount per frame and leaves the scrollback untouched.
 *
 * COLOUR: the head of each drop is written at full bright green (`\x1b[92m`)
 * and its trail at DIM over the SAME slot. That is the one palette entry
 * `color` rewrites, so the whole rain follows the accent — head and trail
 * together. Using two different ANSI greens would give a prettier gradient and
 * would stop following `color`, since only bright green is repainted.
 */
import { colour, DIM, FG_BRIGHT_GREEN } from '../term/ansi';

/** Half-width katakana and digits — the glyph set the effect is known for. */
export const MATRIX_GLYPHS =
    'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789';

/**
 * ~18fps. Slower than the original 45ms because a full repaint carries far
 * more glyphs per frame; at 45ms the rain reads as static rather than as
 * falling.
 */
export const MATRIX_FRAME_MS = 55;

/** How long the intro sits on screen before the rain starts. */
export const MATRIX_INTRO_PAUSE_MS = 1300;

const MIN_TRAIL = 4;
const MAX_TRAIL = 16;
const MIN_SPEED = 0.35;
const MAX_SPEED = 1.1;

export interface MatrixIntroLine {
    text: string;
    /** Rendered DIM, for the parenthetical. */
    aside: boolean;
}

/**
 * The warning, which exists because the egg no longer stops on its own.
 *
 * An infinite animation that does not say how to leave is a trap, and this one
 * deliberately ignores every key except Ctrl+C — so the instruction is not
 * decoration, it is the only documentation of the exit.
 */
export const MATRIX_INTRO: readonly MatrixIntroLine[] = [
    { text: 'Wake up, Neo...', aside: false },
    {
        text: 'The rain does not stop on its own. Nothing does, in here.',
        aside: false,
    },
    { text: 'There is no exit key. There is only Ctrl+C.', aside: false },
    {
        text: '(You already knew that. You have always known that.)',
        aside: true,
    },
];

export interface MatrixColumn {
    /** Row index of the falling head. Negative while still above the screen. */
    head: number;
    /** Number of lit cells, head included. */
    trail: number;
    /** Rows per frame. Fractional, so columns fall at different rates. */
    speed: number;
    /** Carries the fractional part of `speed` between frames. */
    offset: number;
}

function spawn(
    rows: number,
    random: () => number,
    on_screen: boolean,
): MatrixColumn {
    const trail = MIN_TRAIL + Math.floor(random() * (MAX_TRAIL - MIN_TRAIL));
    return {
        // On the first frame every column starts somewhere ON the screen, so
        // the rain is full immediately rather than raining into an empty
        // terminal for the first few seconds. Respawns come from above, and
        // the varying offset is what opens gaps between drops.
        head: on_screen
            ? Math.floor(random() * rows)
            : -1 - Math.floor(random() * (rows / 2)),
        trail: Math.min(trail, Math.max(1, rows)),
        speed: MIN_SPEED + random() * (MAX_SPEED - MIN_SPEED),
        offset: 0,
    };
}

export function init_columns(
    cols: number,
    rows: number,
    random: () => number = Math.random,
): MatrixColumn[] {
    return Array.from({ length: Math.max(0, cols) }, () =>
        spawn(rows, random, true),
    );
}

/**
 * One tick. Returns a NEW array of NEW columns — the input is never touched,
 * so a frame can be rendered from the previous state without a torn read.
 */
export function advance(
    columns: readonly MatrixColumn[],
    rows: number,
    random: () => number = Math.random,
): MatrixColumn[] {
    return columns.map((column) => {
        const offset = column.offset + column.speed;
        const step = Math.floor(offset);
        const head = column.head + step;
        // Respawn once the LAST lit cell has left the bottom, not once the head
        // has: cutting at the head would clip every trail off mid-fall.
        if (head - column.trail >= rows - 1) return spawn(rows, random, false);
        return { ...column, head, offset: offset - step };
    });
}

type CellStyle = 'head' | 'trail' | null;

function cell_style(column: MatrixColumn, row: number): CellStyle {
    if (row === column.head) return 'head';
    if (row < column.head && row > column.head - column.trail) return 'trail';
    return null;
}

function paint(style: CellStyle, text: string): string {
    if (style === 'head') return colour(text, FG_BRIGHT_GREEN);
    if (style === 'trail') return colour(text, DIM + FG_BRIGHT_GREEN);
    // Blanks are left UNCOLOURED. Wrapping spaces in escapes would triple the
    // bytes per frame for cells that render identically either way.
    return text;
}

interface Run {
    style: CellStyle;
    text: string;
}

/**
 * Render the whole screen: exactly `rows` strings, each exactly `columns.length`
 * visible cells wide.
 *
 * Adjacent cells sharing a style are merged into ONE escape run. Emitting a
 * colour code per cell is correct but multiplies an 80x24 frame from ~2 KB to
 * ~20 KB, eighteen times a second, all of which xterm has to parse.
 */
export function render_frame(
    columns: readonly MatrixColumn[],
    rows: number,
    random: () => number = Math.random,
): string[] {
    const frame: string[] = [];
    for (let row = 0; row < rows; row++) {
        const runs: Run[] = [];
        for (const column of columns) {
            const style = cell_style(column, row);
            const glyph =
                style === null
                    ? ' '
                    : (MATRIX_GLYPHS[
                          Math.floor(random() * MATRIX_GLYPHS.length)
                      ] ?? '0');
            const last = runs[runs.length - 1];
            if (last != null && last.style === style) {
                runs[runs.length - 1] = { style, text: last.text + glyph };
            } else {
                runs.push({ style, text: glyph });
            }
        }
        frame.push(runs.map((run) => paint(run.style, run.text)).join(''));
    }
    return frame;
}
