import { describe, expect, it } from 'vitest';
import { PRESETS, type Preset } from './difficulty';
import { flags_left, new_board, reveal, toggle_flag } from './board';

/**
 * A deterministic stand-in for `Math.random`. Mine placement takes an rng so
 * these tests can pin exactly where mines land; the component passes
 * `Math.random`.
 */
const seq = (values: number[]): (() => number) => {
    let i = 0;
    return () => values[i++ % values.length] ?? 0;
};

const preset = (cols: number, rows: number, mines: number): Preset => ({
    cols,
    rows,
    mines,
    label: 'test',
});

describe('minesweeper board', () => {
    it('starts with no mines placed and status ready', () => {
        // Mines do not exist until the first click, which is what makes the
        // first-click guarantee below expressible at all.
        const b = new_board(PRESETS.beginner);
        expect(b.cells).toHaveLength(81);
        expect(b.cells.every((c) => !c.mine)).toBe(true);
        expect(b.status).toBe('ready');
    });

    it('never places a mine under the first click', () => {
        // THE invariant (spec D5). A 3x3 board with 8 mines leaves exactly one
        // safe cell, so if the exclusion is dropped this fails for every
        // opening square rather than occasionally.
        const dense = preset(3, 3, 8);
        for (let first = 0; first < 9; first++) {
            const b = reveal(new_board(dense), first, seq([0]));
            expect(
                b.cells[first]?.mine,
                `mine under first click ${String(first)}`,
            ).toBe(false);
            expect(b.cells.filter((c) => c.mine)).toHaveLength(8);
            expect(b.status).not.toBe('lost');
        }
    });

    it('flood-fills the whole board when the first click has no neighbours', () => {
        const b = reveal(new_board(preset(3, 3, 0)), 4);
        expect(b.cells.every((c) => c.state === 'revealed')).toBe(true);
        expect(b.status).toBe('won');
    });

    it('stops the flood at numbered cells', () => {
        // Mine lands at index 0; index 1 touches it, so the fill reveals index
        // 1 and stops rather than walking into the mine.
        const b = reveal(new_board(preset(3, 1, 1)), 2, seq([0]));
        expect(b.cells[1]?.state).toBe('revealed');
        expect(b.cells[1]?.adjacent).toBe(1);
        expect(b.cells[0]?.state).toBe('hidden');
    });

    it('loses when a mine is revealed after the first click', () => {
        // 3x3 with two mines, opened at the far corner: the flood stops at the
        // numbered cells around them and leaves index 2 unrevealed, so the
        // game is still in play. (A one-mine board is unusable here — the
        // first click floods every safe cell and wins immediately, which is
        // correct behaviour and makes "then step on a mine" unreachable.)
        let b = reveal(new_board(preset(3, 3, 2)), 8, seq([0]));
        expect(b.status).toBe('playing');
        b = reveal(b, 0);
        expect(b.status).toBe('lost');
        expect(b.cells[0]?.state).toBe('revealed');
    });

    it('counts flags down from the mine count', () => {
        let b = new_board(PRESETS.beginner);
        expect(flags_left(b)).toBe(10);
        b = toggle_flag(b, 0);
        expect(flags_left(b)).toBe(9);
        b = toggle_flag(b, 0);
        expect(flags_left(b)).toBe(10);
    });

    it('refuses to reveal a flagged cell', () => {
        // Flagging is how a player marks "do not click here"; honouring it is
        // the whole point of the flag.
        let b = toggle_flag(new_board(PRESETS.beginner), 0);
        b = reveal(b, 0);
        expect(b.cells[0]?.state).toBe('flagged');
        expect(b.status).toBe('ready');
    });

    it('wins when every non-mine cell is revealed', () => {
        const b = reveal(new_board(preset(2, 1, 1)), 1, seq([0]));
        expect(b.status).toBe('won');
    });

    it('does nothing once the game is over', () => {
        const lost = reveal(reveal(new_board(preset(3, 3, 2)), 8, seq([0])), 0);
        expect(reveal(lost, 1)).toEqual(lost);
        expect(toggle_flag(lost, 1)).toEqual(lost);
    });

    it('never mutates the board it was given', () => {
        // coding-style.md: immutable updates. A mutating reveal would make the
        // component's reassign-to-invalidate pattern silently unnecessary,
        // and then silently wrong when something else held a reference.
        const before = new_board(PRESETS.beginner);
        const snapshot = JSON.stringify(before);
        reveal(before, 40, seq([0]));
        toggle_flag(before, 0);
        expect(JSON.stringify(before)).toBe(snapshot);
    });
});
