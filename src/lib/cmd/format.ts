/**
 * Shared line formatters for the CMD commands.
 *
 * Pure `string[]` in, `string[]` out. xterm reflows on its own, so these emit
 * short lines (≤72 columns, the width TERMINAL_MIN_WIDTH is sized around)
 * rather than trying to be a layout engine.
 */
import {
    colour,
    FG_BRIGHT_GREEN,
    FG_CYAN,
    FG_GREY,
    FG_YELLOW,
} from '../term/ansi';

/** Longest line the formatters aim for; see theme.TERMINAL_MIN_WIDTH. */
export const MAX_COLS = 72;

export function heading(text: string): string {
    return colour(text, FG_BRIGHT_GREEN);
}

export function label(text: string): string {
    return colour(text, FG_CYAN);
}

export function dim(text: string): string {
    return colour(text, FG_GREY);
}

export function warn(text: string): string {
    return colour(text, FG_YELLOW);
}

/**
 * Hard-wrap on word boundaries.
 *
 * A word longer than `width` (a URL, say) is emitted on its own over-long line
 * rather than being cut mid-token — breaking a URL makes it unclickable and
 * unreadable, which is worse than one ragged line.
 */
export function wrap(text: string, width = MAX_COLS): string[] {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    if (words.length === 0) return [''];
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
        if (line.length === 0) {
            line = word;
        } else if (line.length + 1 + word.length <= width) {
            line += ` ${word}`;
        } else {
            lines.push(line);
            line = word;
        }
    }
    if (line.length > 0) lines.push(line);
    return lines;
}

/**
 * Pack comma-separated ITEMS onto lines without ever splitting one.
 *
 * `wrap` breaks on whitespace, so a multi-word entry — "Computer Vision",
 * "Prompt Engineering" — gets torn across two lines and reads as two different
 * skills. This keeps each item whole and only breaks between them.
 */
export function wrap_items(
    items: readonly string[],
    width = MAX_COLS,
    separator = ', ',
): string[] {
    if (items.length === 0) return [];
    const lines: string[] = [];
    let line = '';
    for (const item of items) {
        const candidate =
            line.length === 0 ? item : `${line}${separator}${item}`;
        if (line.length > 0 && candidate.length > width) {
            lines.push(`${line}${separator.trimEnd()}`);
            line = item;
        } else {
            line = candidate;
        }
    }
    if (line.length > 0) lines.push(line);
    return lines;
}

/** Indent every line by two spaces — the list style used throughout. */
export function indent(lines: string[]): string[] {
    return lines.map((l) => `  ${l}`);
}

/**
 * A two-column table with the left column padded to the widest key.
 *
 * Padding is computed from the RAW key, never a coloured one: an ANSI escape
 * is bytes with no width, so measuring the coloured string pads short and the
 * whole column goes ragged.
 */
export function columns(
    rows: readonly (readonly [string, string])[],
    gap = 2,
): string[] {
    if (rows.length === 0) return [];
    const width = Math.max(...rows.map(([k]) => k.length));
    return rows.map(
        ([k, v]) => `${label(k.padEnd(width))}${' '.repeat(gap)}${v}`,
    );
}

/** A blank line. Named so intent is visible at the call sites. */
export const BLANK = '';
