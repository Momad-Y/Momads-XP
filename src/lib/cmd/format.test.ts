import { describe, it, expect } from 'vitest';
import { accent, columns, indent, MAX_COLS, wrap, wrap_items } from './format';
import { strip_ansi, visible_length } from '../term/ansi';

describe('wrap', () => {
    it('keeps every line within the target width', () => {
        const text = 'alpha bravo charlie delta echo foxtrot golf hotel india';
        for (const line of wrap(text, 20)) {
            expect(line.length).toBeLessThanOrEqual(20);
        }
    });

    it('preserves every word, in order', () => {
        const text = 'one two three four five';
        expect(wrap(text, 9).join(' ')).toBe(text);
    });

    it('never splits a word that is longer than the width', () => {
        // A cut URL is unclickable and unreadable — worse than one ragged line.
        const url =
            'https://example.com/a/very/long/path/that/exceeds/the/width';
        const lines = wrap(`see ${url} ok`, 20);
        expect(lines).toContain(url);
    });

    it('returns a single empty line for empty input', () => {
        expect(wrap('')).toEqual(['']);
        expect(wrap('   ')).toEqual(['']);
    });

    it('defaults to the documented column budget', () => {
        const long = 'word '.repeat(40);
        for (const line of wrap(long)) {
            expect(line.length).toBeLessThanOrEqual(MAX_COLS);
        }
    });
});

describe('indent', () => {
    it('prefixes two spaces without touching content', () => {
        expect(indent(['a', 'b'])).toEqual(['  a', '  b']);
    });
});

describe('columns', () => {
    it('aligns the value column across rows', () => {
        const rows = columns([
            ['email', 'a@b.c'],
            ['location', 'Dubai'],
        ]);
        const positions = rows.map((r) =>
            strip_ansi(r).indexOf('a@b.c') >= 0
                ? strip_ansi(r).indexOf('a@b.c')
                : strip_ansi(r).indexOf('Dubai'),
        );
        expect(positions[0]).toBe(positions[1]);
    });

    it('pads from the RAW key, not the coloured one', () => {
        // An ANSI escape is bytes with no printable width. Measuring the
        // coloured string pads short and the whole column goes ragged — and
        // because the escapes are invisible, the bug looks like "the alignment
        // is just wrong" with no obvious cause.
        const [row] = columns([['k', 'v']]);
        expect(visible_length(row ?? '')).toBe('k'.length + 2 + 'v'.length);
    });

    it('returns nothing for no rows', () => {
        expect(columns([])).toEqual([]);
    });
});

describe('wrap_items', () => {
    it('never splits a multi-word item across lines', () => {
        // The bug this exists for: `wrap` breaks on whitespace, so "Computer
        // Vision" became "Computer" / "Vision" and read as two skills. Caught
        // by the skills test, not by review.
        const items = ['Computer Vision', 'Prompt Engineering', 'ROS'];
        const lines = wrap_items(items, 24);
        for (const item of items) {
            expect(lines.some((l) => l.includes(item))).toBe(true);
        }
    });

    it('keeps lines within the width where the items allow it', () => {
        const items = ['aaa', 'bbb', 'ccc', 'ddd', 'eee'];
        for (const line of wrap_items(items, 12)) {
            expect(line.length).toBeLessThanOrEqual(12);
        }
    });

    it('emits an over-long line rather than cutting a single huge item', () => {
        const huge = 'x'.repeat(100);
        expect(wrap_items([huge], 20)).toEqual([huge]);
    });

    it('honours a custom separator', () => {
        expect(wrap_items(['a', 'b'], 80, ' · ')).toEqual(['a · b']);
    });

    it('returns nothing for no items', () => {
        expect(wrap_items([])).toEqual([]);
    });

    it('leaves a trailing separator on continued lines', () => {
        // So a reader can tell a wrapped list from a finished one.
        const lines = wrap_items(['aaaa', 'bbbb'], 6);
        expect(lines[0]).toBe('aaaa,');
    });
});

describe('wrap_items measures visible width', () => {
    it('packs coloured items by their printable width, not their bytes', () => {
        // Three 10-column items fit on one 40-column line. Counting the escape
        // bytes would make each look ~19 wide and break after the second.
        const items = ['aaaaaaaaaa', 'bbbbbbbbbb', 'cccccccccc'].map((i) =>
            accent(i),
        );
        const packed = wrap_items(items, 40, '  ');
        expect(packed).toHaveLength(1);
        // The CONTENT too: a length assertion alone passes for an
        // implementation that simply concatenates everything.
        expect(strip_ansi(packed[0] ?? '')).toBe(
            'aaaaaaaaaa  bbbbbbbbbb  cccccccccc',
        );
        expect(visible_length(packed[0] ?? '')).toBeLessThanOrEqual(40);
    });
});
