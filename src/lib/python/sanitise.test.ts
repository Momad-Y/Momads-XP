import { describe, expect, it } from 'vitest';
import { sanitise_runtime_text } from './sanitise';

const ESC = '\x1b';

describe('sanitise_runtime_text', () => {
    it('leaves ordinary text alone', () => {
        expect(sanitise_runtime_text('hello world\n')).toBe('hello world\n');
        expect(sanitise_runtime_text('tabs\there\r\nlines\n')).toBe(
            'tabs\there\r\nlines\n',
        );
    });

    it('KEEPS colour, because Pyodide tracebacks are ANSI-coloured', () => {
        // theme.ts records the 16-colour palette as load-bearing for exactly
        // this. Stripping everything would fix the hardening issue by
        // deleting a real feature.
        expect(sanitise_runtime_text(`${ESC}[31mred${ESC}[0m`)).toBe(
            `${ESC}[31mred${ESC}[0m`,
        );
        expect(sanitise_runtime_text(`${ESC}[1;38;5;204mfancy${ESC}[m`)).toBe(
            `${ESC}[1;38;5;204mfancy${ESC}[m`,
        );
    });

    it('strips the screen clear that wiped the scrollback', () => {
        // Measured against the live REPL: print("\\x1b[2J\\x1b[H...") removed
        // everything above it from the buffer.
        expect(sanitise_runtime_text(`${ESC}[2J${ESC}[Hgone`)).toBe('gone');
    });

    it('strips cursor movement, so output cannot climb out of its line', () => {
        for (const final of [
            'A',
            'B',
            'C',
            'D',
            'H',
            'f',
            'J',
            'K',
            'S',
            'T',
        ]) {
            expect(sanitise_runtime_text(`${ESC}[12${final}x`), final).toBe(
                'x',
            );
        }
    });

    it('strips a scroll region, which outlives the statement that set it', () => {
        expect(sanitise_runtime_text(`${ESC}[1;3rx`)).toBe('x');
    });

    it('strips private-mode sets even though they end in a letter', () => {
        // `\x1b[?25l` hides the cursor and `?1049h` swaps to the alt screen —
        // both would survive a naive "ends with a letter is fine" rule.
        expect(sanitise_runtime_text(`${ESC}[?25lx`)).toBe('x');
        expect(sanitise_runtime_text(`${ESC}[?1049hx`)).toBe('x');
        // `?…m` is not a real SGR and must not sneak through the colour gate.
        expect(sanitise_runtime_text(`${ESC}[?31mx`)).toBe('x');
    });

    it('strips OSC whole, payload included', () => {
        // Window title, and OSC 52 clipboard. Leaving the payload as text
        // would be its own bug.
        expect(sanitise_runtime_text(`${ESC}]0;pwned\x07after`)).toBe('after');
        expect(sanitise_runtime_text(`${ESC}]52;c;YQ==${ESC}\\after`)).toBe(
            'after',
        );
        // Unterminated: drop the rest rather than print the payload.
        expect(sanitise_runtime_text(`${ESC}]0;no terminator`)).toBe('');
    });

    it('strips DCS, APC, PM and SOS', () => {
        for (const intro of ['P', '_', '^', 'X']) {
            expect(
                sanitise_runtime_text(`${ESC}${intro}payload${ESC}\\after`),
                intro,
            ).toBe('after');
        }
    });

    it('strips single-character escapes like full reset and save-cursor', () => {
        expect(sanitise_runtime_text(`${ESC}cx`)).toBe('x');
        expect(sanitise_runtime_text(`${ESC}7x${ESC}8`)).toBe('x');
        expect(sanitise_runtime_text(`${ESC}(0x`)).toBe('x');
    });

    it('strips a lone escape at the end', () => {
        expect(sanitise_runtime_text(`text${ESC}`)).toBe('text');
        expect(sanitise_runtime_text(`text${ESC}[`)).toBe('text');
    });

    it('strips 8-bit C1 introducers, not just the ESC form', () => {
        // \x9b IS a CSI. A filter that only knows \x1b[ lets it straight
        // through.
        expect(sanitise_runtime_text('\x9b2Jx')).toBe('x');
        expect(sanitise_runtime_text('\x9d0;t\x07x')).toBe('x');
    });

    it('strips other control characters but keeps tab, newline and return', () => {
        expect(sanitise_runtime_text('a\x07b\x08c\x0bd\x0ce')).toBe('abcde');
        expect(sanitise_runtime_text('a\tb\nc\rd')).toBe('a\tb\nc\rd');
    });

    it('handles a traceback with colour and a clear mixed together', () => {
        const input = `${ESC}[0;31mTraceback${ESC}[0m${ESC}[2J\n  line 1\n`;
        expect(sanitise_runtime_text(input)).toBe(
            `${ESC}[0;31mTraceback${ESC}[0m\n  line 1\n`,
        );
    });

    it('is a no-op on empty input', () => {
        expect(sanitise_runtime_text('')).toBe('');
    });
});
