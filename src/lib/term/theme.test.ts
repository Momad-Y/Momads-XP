import { describe, it, expect } from 'vitest';
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
    it('is wide enough for the ≤72-column formatters not to wrap', () => {
        // The command formatters emit lines up to 72 columns. At 14px in a
        // monospace face a column is ~8px, so 72 columns needs ~576px plus
        // chrome — anything less and every `skills` listing wraps raggedly.
        expect(TERMINAL_MIN_WIDTH).toBeGreaterThanOrEqual(600);
        expect(TERMINAL_FONT_SIZE).toBeGreaterThan(0);
    });

    it('is tall enough to show a usable number of rows', () => {
        expect(TERMINAL_MIN_HEIGHT).toBeGreaterThanOrEqual(300);
    });
});
