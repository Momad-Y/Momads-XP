import { describe, expect, it } from 'vitest';
import { CLEAR_SCREEN_DOWN, render_line } from './render';
import { colour, CR, CSI, FG_BRIGHT_GREEN } from './ansi';

const PROMPT = 'momad@xp:~$ '; // 12 columns

function render(over: Partial<Parameters<typeof render_line>[0]> = {}) {
    return render_line({
        prompt: PROMPT,
        buffer: '',
        cursor: 0,
        cols: 80,
        prev_cursor_row: 0,
        ...over,
    });
}

describe('render_line', () => {
    it('draws a short line on one row and reports no climb for next time', () => {
        const { text, cursor_row } = render({ buffer: 'help', cursor: 4 });
        expect(text).toBe(
            `${CR}${CLEAR_SCREEN_DOWN}${PROMPT}help${CR}${CSI}16C`,
        );
        expect(cursor_row).toBe(0);
    });

    it('clears to the end of the SCREEN, never just the line', () => {
        // The whole bug: `\x1b[0K` leaves every wrapped row above the cursor
        // on screen. Asserted by absence so a revert to CLEAR_LINE_RIGHT fails
        // here rather than only in the browser.
        expect(render({ buffer: 'x' }).text).toContain(CLEAR_SCREEN_DOWN);
        expect(render({ buffer: 'x' }).text).not.toContain(`${CSI}0K`);
    });

    it('climbs to the first row of a line that wrapped', () => {
        // 12 + 30 = 42 columns over a 20-column terminal -> rows 0, 1, 2.
        const { text, cursor_row } = render({
            buffer: 'x'.repeat(30),
            cursor: 30,
            cols: 20,
            prev_cursor_row: 2,
        });
        expect(text.startsWith(`${CSI}2A${CR}${CLEAR_SCREEN_DOWN}`)).toBe(true);
        expect(cursor_row).toBe(2);
    });

    it('places the cursor by row and column, not by moving left', () => {
        // Cursor at buffer offset 4 -> absolute column 16 -> row 0, col 16.
        // The end of the text is on row 2, so it has to climb 2 rows first.
        // `\x1b[{n}D` could not do this: CUB stops at column 0.
        const { text } = render({
            buffer: 'x'.repeat(30),
            cursor: 4,
            cols: 20,
        });
        expect(text.endsWith(`${CSI}2A${CR}${CSI}16C`)).toBe(true);
    });

    it('forces the newline when the text ends exactly on the margin', () => {
        // 12 + 8 = 20 on a 20-column terminal. Without the forced wrap xterm
        // leaves the cursor pending on row 0 and every later climb is one row
        // short.
        const { text, cursor_row } = render({
            buffer: 'x'.repeat(8),
            cursor: 8,
            cols: 20,
        });
        expect(text).toContain('\r\n');
        expect(cursor_row).toBe(1);
    });

    it('measures the prompt without its colour codes', () => {
        // A coloured prompt is ~10 bytes wider than it looks; counting those
        // as columns would wrap the arithmetic early. Same hazard `columns()`
        // documents in cmd/format.ts.
        const plain = render({ buffer: 'abc', cursor: 3, cols: 20 });
        const painted = render({
            prompt: colour('momad@xp:~$ ', FG_BRIGHT_GREEN),
            buffer: 'abc',
            cursor: 3,
            cols: 20,
        });
        expect(painted.cursor_row).toBe(plain.cursor_row);
        expect(painted.text.endsWith(`${CR}${CSI}15C`)).toBe(true);
    });

    it('never divides by an unlaid-out terminal reporting zero columns', () => {
        expect(() => render({ buffer: 'abc', cols: 0 })).not.toThrow();
        expect(render({ buffer: 'abc', cursor: 3, cols: 0 }).cursor_row).toBe(
            15,
        );
    });

    it('clamps a cursor outside the buffer', () => {
        expect(render({ buffer: 'ab', cursor: 99 }).text).toBe(
            render({ buffer: 'ab', cursor: 2 }).text,
        );
    });
});
