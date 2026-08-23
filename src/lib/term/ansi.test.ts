import { describe, it, expect } from 'vitest';
import {
    CLEAR_LINE_RIGHT,
    CLEAR_SCREEN,
    colour,
    CRLF,
    CSI,
    FG_BRIGHT_GREEN,
    FG_RED,
    RESET,
    strip_ansi,
    visible_length,
} from './ansi';

describe('sequence constants', () => {
    it('builds CSI from ESC, so a typo cannot diverge per-constant', () => {
        expect(CSI).toBe('\x1b[');
        expect(FG_RED.startsWith(CSI)).toBe(true);
        expect(RESET).toBe('\x1b[0m');
    });

    it('uses CRLF, not a bare newline', () => {
        // xterm does not translate: a bare \n moves the cursor DOWN without
        // returning it to column 0, so every subsequent line renders as a
        // staircase. This is the single most common way terminal output looks
        // broken.
        expect(CRLF).toBe('\r\n');
    });

    it('clears the screen AND homes the cursor', () => {
        // 2J alone wipes the screen but leaves the cursor where it was, so the
        // `clear` command would scroll the prompt to the middle of the window.
        expect(CLEAR_SCREEN).toContain('2J');
        expect(CLEAR_SCREEN.endsWith(`${CSI}H`)).toBe(true);
    });

    it('erases only to the right when redrawing input', () => {
        expect(CLEAR_LINE_RIGHT).toBe('\x1b[0K');
    });
});

describe('colour', () => {
    it('wraps and always resets', () => {
        // An unreset colour bleeds into everything printed afterwards,
        // including the next prompt.
        const out = colour('hi', FG_BRIGHT_GREEN);
        expect(out).toBe(`${FG_BRIGHT_GREEN}hi${RESET}`);
        expect(out.endsWith(RESET)).toBe(true);
    });

    it('round-trips through strip_ansi', () => {
        expect(strip_ansi(colour('momad', FG_BRIGHT_GREEN))).toBe('momad');
    });
});

describe('strip_ansi', () => {
    it('removes SGR sequences and leaves text intact', () => {
        expect(strip_ansi('\x1b[31mred\x1b[0m text')).toBe('red text');
    });

    it('removes several sequences in one string', () => {
        expect(
            strip_ansi(`${FG_RED}a${RESET}${FG_BRIGHT_GREEN}b${RESET}`),
        ).toBe('ab');
    });

    it('leaves plain text untouched', () => {
        expect(strip_ansi('no escapes here')).toBe('no escapes here');
    });
});

describe('visible_length', () => {
    it('counts printable columns, not bytes', () => {
        // Used for width decisions. Counting escape bytes as columns wraps
        // coloured lines early and ragged.
        expect(visible_length(colour('12345', FG_RED))).toBe(5);
    });

    it('agrees with String.length when there is no colour', () => {
        expect(visible_length('plain')).toBe('plain'.length);
    });

    it('is zero for a string that is only escapes', () => {
        expect(visible_length(`${FG_RED}${RESET}`)).toBe(0);
    });
});
