/**
 * The few ANSI sequences the terminal apps emit. Named constants rather than
 * inline escapes so a typo is a compile error at one site instead of a
 * mystery glyph at several.
 */
export const ESC = '\x1b';
export const CSI = `${ESC}[`;

export const RESET = `${CSI}0m`;
export const BOLD = `${CSI}1m`;
export const DIM = `${CSI}2m`;

export const FG_BRIGHT_GREEN = `${CSI}92m`;
export const FG_CYAN = `${CSI}36m`;
export const FG_YELLOW = `${CSI}33m`;
export const FG_RED = `${CSI}31m`;
export const FG_GREY = `${CSI}90m`;

/** Clear the screen and park the cursor at the top-left (the `clear` command). */
export const CLEAR_SCREEN = `${CSI}2J${CSI}H`;

/**
 * Park the cursor at the top-left WITHOUT clearing.
 *
 * The full-screen repaint the `matrix` egg uses homes and overwrites every
 * cell; clearing first would flash the background between frames.
 */
export const CURSOR_HOME = `${CSI}H`;

/**
 * A blinking cursor wandering across a full-screen animation reads as a
 * rendering fault, so it is hidden for the duration and restored after.
 */
export const HIDE_CURSOR = `${CSI}?25l`;
export const SHOW_CURSOR = `${CSI}?25h`;

/** Erase from the cursor to the end of the line — used when redrawing input. */
export const CLEAR_LINE_RIGHT = `${CSI}0K`;

/**
 * Ctrl+C as the KEYBOARD sends it — the one input byte in this file.
 *
 * It lives here beside CR and LF, which are equally both directions, so the
 * `matrix` egg does not have to compare against a bare `'\x03'` literal while
 * deciding whether a keystroke is its documented exit.
 */
export const ETX = '\x03';

export const CR = '\r';
export const LF = '\n';
/** xterm needs BOTH: a bare \n moves down without returning to column 0. */
export const CRLF = '\r\n';

export function colour(text: string, code: string): string {
    return `${code}${text}${RESET}`;
}

/**
 * Strip ANSI SGR sequences. Used by tests and by width calculations, where
 * counting escape bytes as columns would wrap lines early.
 */
export function strip_ansi(text: string): string {
    // eslint-disable-next-line no-control-regex -- matching control codes is the point
    return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

/** Printable width of a string, ignoring colour codes. */
export function visible_length(text: string): number {
    return strip_ansi(text).length;
}
