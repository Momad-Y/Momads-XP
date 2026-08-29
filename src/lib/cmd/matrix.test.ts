import { describe, it, expect } from 'vitest';
import {
    advance,
    init_columns,
    MATRIX_FRAME_MS,
    MATRIX_GLYPHS,
    MATRIX_INTRO,
    render_frame,
    type MatrixColumn,
} from './matrix';
import { DIM, FG_BRIGHT_GREEN, strip_ansi } from '../term/ansi';

/**
 * A seeded LCG, so every assertion below is deterministic.
 *
 * `Math.random` would make the coverage and glyph tests probabilistic, and a
 * test that is merely very likely to pass is the kind that fails once a month
 * and gets re-run rather than read.
 */
function seeded(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state * 1664525 + 1013904223) % 4294967296;
        return state / 4294967296;
    };
}

describe('init_columns', () => {
    it('makes one column per terminal column', () => {
        expect(init_columns(80, 24, seeded(1))).toHaveLength(80);
        expect(init_columns(0, 24, seeded(1))).toHaveLength(0);
    });

    it('starts every drop ON screen, so the rain is full immediately', () => {
        // The reported problem with the original: it rained into an empty
        // terminal and filled upward from the bottom over several seconds.
        for (const column of init_columns(80, 24, seeded(7))) {
            expect(column.head).toBeGreaterThanOrEqual(0);
            expect(column.head).toBeLessThan(24);
            expect(column.trail).toBeGreaterThan(0);
            expect(column.speed).toBeGreaterThan(0);
        }
    });

    it('never gives a drop a trail longer than the screen', () => {
        for (const column of init_columns(40, 3, seeded(9))) {
            expect(column.trail).toBeLessThanOrEqual(3);
        }
    });
});

describe('render_frame', () => {
    it('paints the WHOLE grid — every row, every column', () => {
        const columns = init_columns(80, 24, seeded(3));
        const frame = render_frame(columns, 24, seeded(4));
        expect(frame).toHaveLength(24);
        for (const row of frame) {
            expect(strip_ansi(row)).toHaveLength(80);
        }
    });

    it('actually fills the screen rather than sprinkling it', () => {
        const columns = init_columns(80, 24, seeded(5));
        const frame = render_frame(columns, 24, seeded(6));
        const lit = frame.reduce(
            (n, row) => n + strip_ansi(row).replace(/ /g, '').length,
            0,
        );
        // ~80 drops of average trail 10 over an 80x24 grid.
        expect(lit / (80 * 24)).toBeGreaterThan(0.2);
        // And no row is left empty, which is what "full screen" means here.
        for (const row of frame) {
            expect(strip_ansi(row).trim().length).toBeGreaterThan(0);
        }
    });

    it('draws the head bright and the trail DIM, both on the accent slot', () => {
        // Both codes resolve through `\x1b[92m`, the one palette entry `color`
        // rewrites — which is what makes the whole rain follow the accent. Two
        // different ANSI greens would look similar and stop following it.
        const column: MatrixColumn = { head: 5, trail: 3, speed: 0, offset: 0 };
        const frame = render_frame([column], 10, seeded(11));

        expect(frame[5]).toContain(FG_BRIGHT_GREEN);
        expect(frame[5]).not.toContain(DIM);

        for (const row of [3, 4]) {
            expect(frame[row], `row ${String(row)}`).toContain(DIM);
            expect(frame[row], `row ${String(row)}`).toContain(FG_BRIGHT_GREEN);
        }
    });

    it('leaves blank cells as bare spaces', () => {
        // Wrapping spaces in escapes triples the bytes per frame for cells that
        // render identically either way.
        const column: MatrixColumn = { head: 1, trail: 1, speed: 0, offset: 0 };
        const frame = render_frame([column], 4, seeded(13));
        expect(frame[0]).toBe(' ');
        expect(frame[3]).toBe(' ');
    });

    it('only ever draws glyphs from the katakana set', () => {
        const columns = init_columns(30, 12, seeded(17));
        const frame = render_frame(columns, 12, seeded(19));
        const drawn = strip_ansi(frame.join('')).replace(/ /g, '');
        expect(drawn.length).toBeGreaterThan(0);
        for (const glyph of drawn) {
            expect(MATRIX_GLYPHS, `unexpected glyph ${glyph}`).toContain(glyph);
        }
    });

    it('handles a zero-width terminal without throwing', () => {
        expect(render_frame([], 3, seeded(23))).toEqual(['', '', '']);
    });
});

describe('advance', () => {
    it('moves drops DOWN the screen', () => {
        const column: MatrixColumn = { head: 2, trail: 4, speed: 1, offset: 0 };
        expect(advance([column], 24, seeded(29))[0]?.head).toBe(3);
    });

    it('carries a fractional speed across frames instead of dropping it', () => {
        // Without the accumulator, Math.floor(0.5) is 0 every frame and half
        // the columns would never move at all.
        let columns: MatrixColumn[] = [
            { head: 0, trail: 4, speed: 0.5, offset: 0 },
        ];
        columns = advance(columns, 24, seeded(31));
        expect(columns[0]?.head).toBe(0);
        columns = advance(columns, 24, seeded(31));
        expect(columns[0]?.head).toBe(1);
    });

    it('respawns only once the whole TRAIL has left the screen', () => {
        const rows = 10;
        // Head below the last row, but the trail is still visible.
        const visible: MatrixColumn = {
            head: 11,
            trail: 4,
            speed: 1,
            offset: 0,
        };
        expect(advance([visible], rows, seeded(37))[0]?.head).toBe(12);

        // One more step and the last lit row clears the bottom.
        const leaving: MatrixColumn = {
            head: 12,
            trail: 4,
            speed: 1,
            offset: 0,
        };
        const respawned = advance([leaving], rows, seeded(41))[0];
        expect(respawned?.head).toBeLessThan(0);
    });

    it('does not mutate the columns it is given', () => {
        const columns: readonly MatrixColumn[] = Object.freeze([
            Object.freeze({ head: 2, trail: 4, speed: 1, offset: 0 }),
        ]);
        const next = advance(columns, 24, seeded(43));
        expect(columns[0]?.head).toBe(2);
        expect(next[0]).not.toBe(columns[0]);
    });

    it('keeps raining forever — no state runs out', () => {
        // The egg is infinite now, so the simulation has to survive far more
        // frames than the 60 the original stopped at.
        let columns = init_columns(40, 20, seeded(47));
        const random = seeded(53);
        for (let i = 0; i < 5_000; i++) columns = advance(columns, 20, random);
        expect(columns).toHaveLength(40);
        for (const column of columns) {
            expect(Number.isFinite(column.head)).toBe(true);
            expect(column.head).toBeLessThan(20 + column.trail + 1);
        }
    });
});

describe('the intro', () => {
    it('names Ctrl+C, which is the only way out', () => {
        // Load-bearing, not decoration: the egg deliberately swallows every
        // other key, so this is the sole documentation of the exit.
        const text = MATRIX_INTRO.map((l) => l.text).join('\n');
        expect(text).toContain('Ctrl+C');
    });

    it('marks exactly the parenthetical as an aside', () => {
        const asides = MATRIX_INTRO.filter((l) => l.aside);
        expect(asides).toHaveLength(1);
        expect(asides[0]?.text.startsWith('(')).toBe(true);
    });
});

describe('frame timing', () => {
    it('runs fast enough to read as falling', () => {
        expect(MATRIX_FRAME_MS).toBeGreaterThan(20);
        expect(MATRIX_FRAME_MS).toBeLessThan(100);
    });
});
