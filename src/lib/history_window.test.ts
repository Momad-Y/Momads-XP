import { describe, it, expect } from 'vitest';
import { GO_TO_CAP, visible_trail } from './history_window';
import type { HistoryEntry } from './types';

function trail(n: number): HistoryEntry[] {
    return Array.from({ length: n }, (_, i) => ({
        label: `stop ${String(i)}`,
        idx: i,
        icon: '',
    }));
}

describe('visible_trail', () => {
    it('returns everything when the trail fits', () => {
        expect(visible_trail(trail(5), 0)).toHaveLength(5);
        expect(visible_trail(trail(GO_TO_CAP), 0)).toHaveLength(GO_TO_CAP);
    });

    it('caps a longer trail', () => {
        expect(visible_trail(trail(20), 19)).toHaveLength(GO_TO_CAP);
    });

    // the defect: slice(-8) kept the NEWEST stops, so walking Back past the
    // window left the current folder — and its ✓ — off the menu entirely
    it('always contains the current stop, however far back it is', () => {
        const entries = trail(20);
        for (let current = 0; current < entries.length; current++) {
            const shown = visible_trail(entries, current);
            expect(shown.map((e) => e.idx)).toContain(current);
        }
    });

    it('keeps absolute idx values so picking one still navigates correctly', () => {
        const shown = visible_trail(trail(20), 15);
        expect(shown[0]?.idx).toBe(11);
        expect(shown.at(-1)?.idx).toBe(18);
        expect(shown.map((e) => e.idx)).toEqual([
            11, 12, 13, 14, 15, 16, 17, 18,
        ]);
    });

    it('clamps at both ends rather than running off the trail', () => {
        expect(visible_trail(trail(20), 0).map((e) => e.idx)).toEqual([
            0, 1, 2, 3, 4, 5, 6, 7,
        ]);
        expect(visible_trail(trail(20), 19).map((e) => e.idx)).toEqual([
            12, 13, 14, 15, 16, 17, 18, 19,
        ]);
    });

    it('boundary: the cap+1st hop is where the old slice lost the tick', () => {
        const entries = trail(GO_TO_CAP + 1);
        // at exactly the cap everything was fine; one more hop, then Back to 0
        expect(visible_trail(entries, 0).map((e) => e.idx)).toContain(0);
        expect(entries.slice(-GO_TO_CAP).map((e) => e.idx)).not.toContain(0);
    });

    it('is immutable and handles a zero cap', () => {
        const entries = trail(3);
        expect(visible_trail(entries, 0)).not.toBe(entries);
        expect(visible_trail(entries, 0, 0)).toEqual([]);
    });
});
