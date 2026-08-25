import { describe, it, expect } from 'vitest';
import { MAX_COLS } from '../cmd/format';
import {
    TERMINAL_FONT_FAMILY,
    TERMINAL_FONT_SIZE,
    TERMINAL_MIN_HEIGHT,
    TERMINAL_MIN_WIDTH,
    XP_CONSOLE_THEME,
} from './theme';

describe('TERMINAL_FONT_FAMILY', () => {
    it('leads with the font SPECIFICATION.md §10 assigns', () => {
        expect(TERMINAL_FONT_FAMILY.startsWith("'Lucida Console'")).toBe(true);
    });

    it('carries non-Windows fallbacks and ends at a generic', () => {
        // Lucida Console does not exist on Linux or Android, and xterm's own
        // default (courier-new) is metrically wrong for XP. Without a real
        // fallback the terminal renders in whatever the browser picks.
        expect(TERMINAL_FONT_FAMILY).toContain('DejaVu Sans Mono');
        expect(TERMINAL_FONT_FAMILY.trim().endsWith('monospace')).toBe(true);
    });
});

describe('XP_CONSOLE_THEME', () => {
    it('is a black background with XP console grey-white text', () => {
        // §3.2 says "white/green". Body text is #c0c0c0 rather than pure
        // white — pure white is brighter than the real console ever was — and
        // the green lives on the prompt.
        expect(XP_CONSOLE_THEME.background).toBe('#000000');
        expect(XP_CONSOLE_THEME.foreground).toBe('#c0c0c0');
        expect(XP_CONSOLE_THEME.brightGreen).toBe('#00ff00');
    });

    it('defines the full 16-colour ANSI palette', () => {
        // Not decoration: Pyodide's tracebacks are ANSI-coloured, so a missing
        // entry renders an error message in the wrong colour or not at all.
        const names = [
            'black',
            'red',
            'green',
            'yellow',
            'blue',
            'magenta',
            'cyan',
            'white',
            'brightBlack',
            'brightRed',
            'brightGreen',
            'brightYellow',
            'brightBlue',
            'brightMagenta',
            'brightCyan',
            'brightWhite',
        ] as const;
        for (const name of names) {
            expect(XP_CONSOLE_THEME[name]).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    it('every value is a 6-digit lowercase hex colour', () => {
        // xterm silently ignores a malformed colour and falls back to its own
        // default, so a typo here is invisible until someone compares
        // screenshots.
        for (const value of Object.values(XP_CONSOLE_THEME)) {
            expect(value).toMatch(/^#[0-9a-f]{6}$/);
        }
    });

    it('keeps the cursor visible against the background', () => {
        expect(XP_CONSOLE_THEME.cursor).not.toBe(XP_CONSOLE_THEME.background);
    });
});

describe('window sizing', () => {
    /**
     * Monospace advance width is ~0.6 em for the faces in the stack, so a
     * column at `size` px is ~0.6 * size wide. Deriving it is the point: the
     * old test asserted TERMINAL_MIN_WIDTH >= 600 and
     * TERMINAL_FONT_SIZE > 0 — two constants against two literals, with no
     * relationship computed. Raising the font to 40px left it green while
     * 72 columns no longer came close to fitting.
     */
    const column_px = (size: number) => size * 0.6;
    /** Window chrome: borders, padding and the scrollbar gutter. */
    const CHROME_PX = 24;

    it('fits MAX_COLS columns at the configured font size', () => {
        const needed = column_px(TERMINAL_FONT_SIZE) * MAX_COLS + CHROME_PX;
        expect(TERMINAL_MIN_WIDTH).toBeGreaterThanOrEqual(needed);
    });

    it('fits at least 20 rows at the configured font size', () => {
        // Line height is ~1.2 em.
        const needed = TERMINAL_FONT_SIZE * 1.2 * 20;
        expect(TERMINAL_MIN_HEIGHT).toBeGreaterThanOrEqual(needed);
    });
});
