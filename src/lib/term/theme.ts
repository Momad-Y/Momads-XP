/**
 * XP console appearance for both terminal apps (spec D-V1, D-V2).
 *
 * Kept as data, in one place, because CMD and the Python REPL must look
 * identical — two terminals that drift apart is the "rule applied at one call
 * site" defect in its most visible form.
 */

/**
 * §10 assigns Lucida Console to "CMD terminal, monospace contexts". It does
 * not exist on Linux or Android, and xterm defaults to
 * `courier-new, courier, monospace` — which is metrically wrong for XP.
 *
 * §10 lists the font as "Web-safe", i.e. deliberately NOT bundled, so the
 * fallbacks below carry non-Windows platforms. Parity screenshots are taken on
 * one fixed platform for this reason: the rendered glyphs genuinely differ.
 */
export const TERMINAL_FONT_FAMILY =
    "'Lucida Console', 'DejaVu Sans Mono', Consolas, 'Courier New', monospace";

export const TERMINAL_FONT_SIZE = 14;

/**
 * §3.2 says "black background, white/green monospace text" without choosing.
 *
 * Body text is XP's console grey-white (#c0c0c0), not pure white — pure white
 * is brighter than the real console ever was. The prompt takes the green, so
 * "white/green" is satisfied by the pair rather than by one washed-out colour.
 *
 * The full 16-colour ANSI palette is not decoration: Pyodide's tracebacks are
 * ANSI-coloured, so these values are load-bearing for the REPL.
 */
export const XP_CONSOLE_THEME = {
    background: '#000000',
    foreground: '#c0c0c0',
    cursor: '#c0c0c0',
    cursorAccent: '#000000',
    selectionBackground: '#3399ff',
    black: '#000000',
    red: '#800000',
    green: '#008000',
    yellow: '#808000',
    blue: '#000080',
    magenta: '#800080',
    cyan: '#008080',
    white: '#c0c0c0',
    brightBlack: '#808080',
    brightRed: '#ff0000',
    brightGreen: '#00ff00',
    brightYellow: '#ffff00',
    brightBlue: '#0000ff',
    brightMagenta: '#ff00ff',
    brightCyan: '#00ffff',
    brightWhite: '#ffffff',
} as const;

/**
 * Minimum window size that keeps the ≤72-column formatters from wrapping.
 *
 * 640, not 620. The original figure was eyeballed; `theme.test.ts` now derives
 * the requirement (0.6 em advance x MAX_COLS x font size, plus chrome) and it
 * came out at ~629 — so the old value was genuinely a few pixels short and the
 * widest `skills` lines would have wrapped at the minimum size.
 */
export const TERMINAL_MIN_WIDTH = 640;
export const TERMINAL_MIN_HEIGHT = 380;

/**
 * The public surface `Terminal.svelte` exposes through `bind:this`.
 *
 * Hand-written for the same reason `WindowController` is: ESLint's type
 * service resolves a bound Svelte component instance as `any`, and
 * `no-unsafe-call` is an error over `src/`. Typing the binding as this
 * interface makes every call checked.
 */
export interface TerminalHandle {
    write: (text: string) => void;
    focus: () => void;
    is_disposed: () => boolean;
}
