import { describe, expect, it } from 'vitest';
import { CLEAR_SCREEN_DOWN, render_line, row_of } from './render';
import { colour, CR, CSI, FG_BRIGHT_GREEN } from './ansi';

const PROMPT = 'momad@xp:~$ '; // 12 columns

function render(over: Partial<Parameters<typeof render_line>[0]> = {}) {
    return render_line({
        prompt: PROMPT,
        buffer: '',
        cursor: 0,
        cols: 80,
        prev_cursor_offset: 0,
        ...over,
    });
}

describe('render_line', () => {
    it('draws a short line on one row and reports where it is', () => {
        const { text, cursor_offset, end_offset } = render({
            buffer: 'help',
            cursor: 4,
        });
        expect(text).toBe(
            `${CR}${CLEAR_SCREEN_DOWN}${PROMPT}help${CR}${CSI}16C`,
        );
        expect(cursor_offset).toBe(16);
        expect(end_offset).toBe(16);
    });

    it('clears to the end of the SCREEN, never just the line', () => {
        // The original bug: `\x1b[0K` leaves every wrapped row above the
        // cursor on screen. Asserted by absence so a revert fails here rather
        // than only in a browser.
        expect(render({ buffer: 'x' }).text).toContain(CLEAR_SCREEN_DOWN);
        expect(render({ buffer: 'x' }).text).not.toContain(`${CSI}0K`);
    });

    it('climbs to the first row of a line that wrapped', () => {
        // 12 + 30 = 42 columns over a 20-column terminal -> rows 0, 1, 2.
        const { text, cursor_offset } = render({
            buffer: 'x'.repeat(30),
            cursor: 30,
            cols: 20,
            prev_cursor_offset: 42,
        });
        expect(text.startsWith(`${CSI}2A${CR}${CLEAR_SCREEN_DOWN}`)).toBe(true);
        expect(cursor_offset).toBe(42);
    });

    it('places the cursor by row and column, not by moving left', () => {
        // Cursor at buffer offset 4 -> absolute column 16 -> row 0, col 16,
        // while the text ends on row 2. `\x1b[{n}D` could not do this: CUB
        // stops dead at column 0.
        const { text, cursor_offset, end_offset } = render({
            buffer: 'x'.repeat(30),
            cursor: 4,
            cols: 20,
        });
        expect(text.endsWith(`${CSI}2A${CR}${CSI}16C`)).toBe(true);
        expect(cursor_offset).toBe(16);
        // The END is elsewhere, which is what the caller needs to know before
        // it writes anything of its own.
        expect(end_offset).toBe(42);
    });

    it('reports an offset, so a resize mid-edit still climbs correctly', () => {
        // xterm REFLOWS a wrapped line when the window changes width. A stored
        // ROW would be measured against a width that no longer exists; the
        // offset is re-divided by the new one.
        const narrow = render({ buffer: 'x'.repeat(30), cursor: 30, cols: 20 });
        expect(row_of(narrow.cursor_offset, 20)).toBe(2);
        // Same line, window dragged wider: one row now, so no climb at all.
        expect(row_of(narrow.cursor_offset, 80)).toBe(0);
        const wider = render({
            buffer: 'x'.repeat(30),
            cursor: 30,
            cols: 80,
            prev_cursor_offset: narrow.cursor_offset,
        });
        expect(wider.text.startsWith(`${CR}${CLEAR_SCREEN_DOWN}`)).toBe(true);
        expect(wider.text).not.toContain(`${CSI}2A`);
    });

    it('forces the newline when the text ends exactly on the margin', () => {
        // 12 + 8 = 20 on a 20-column terminal. Without the forced wrap xterm
        // leaves the cursor pending on row 0 and every later climb is one row
        // short.
        const { text, cursor_offset } = render({
            buffer: 'x'.repeat(8),
            cursor: 8,
            cols: 20,
        });
        expect(text).toContain('\r\n');
        expect(row_of(cursor_offset, 20)).toBe(1);
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
        expect(painted.cursor_offset).toBe(plain.cursor_offset);
        expect(painted.text.endsWith(`${CR}${CSI}15C`)).toBe(true);
    });

    it('never divides by an unlaid-out terminal reporting zero columns', () => {
        expect(() => render({ buffer: 'abc', cols: 0 })).not.toThrow();
        expect(
            row_of(
                render({ buffer: 'abc', cursor: 3, cols: 0 }).cursor_offset,
                0,
            ),
        ).toBe(15);
    });

    it('clamps a cursor outside the buffer', () => {
        expect(render({ buffer: 'ab', cursor: 99 }).text).toBe(
            render({ buffer: 'ab', cursor: 2 }).text,
        );
    });
});

describe('row_of', () => {
    it('divides an offset into rows, and tolerates a zero width', () => {
        expect(row_of(0, 20)).toBe(0);
        expect(row_of(19, 20)).toBe(0);
        expect(row_of(20, 20)).toBe(1);
        expect(row_of(41, 20)).toBe(2);
        expect(row_of(5, 0)).toBe(5);
    });
});
