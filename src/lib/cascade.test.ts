import { beforeEach, describe, expect, it } from 'vitest';
import {
    CASCADE_STEP,
    cascade_position,
    next_cascade_position,
    reset_cascade,
} from './cascade';

const dims = {
    win_width: 600,
    win_height: 400,
    workspace_width: 1280,
    workspace_height: 770,
};
// centered base for these dims
const base = { top: 185, left: 340 };

describe('cascade_position (pure)', () => {
    it('opens the first window at the centered base', () => {
        expect(cascade_position(0, dims)).toEqual(base);
    });

    it('offsets each successive spawn by 24px down-right', () => {
        expect(cascade_position(1, dims)).toEqual({
            top: base.top + CASCADE_STEP,
            left: base.left + CASCADE_STEP,
        });
        expect(cascade_position(3, dims)).toEqual({
            top: base.top + 3 * CASCADE_STEP,
            left: base.left + 3 * CASCADE_STEP,
        });
    });

    it('wraps back to the base before crossing the workspace bottom', () => {
        // max down-steps: floor((770 - 400 - 185) / 24) = 7 → 8 slots
        expect(cascade_position(7, dims).top).toBe(base.top + 7 * CASCADE_STEP);
        expect(cascade_position(8, dims)).toEqual(base);
        expect(cascade_position(9, dims)).toEqual({
            top: base.top + CASCADE_STEP,
            left: base.left + CASCADE_STEP,
        });
    });

    it('pins oversized windows to the top-left with no offset', () => {
        const oversized = {
            win_width: 1400,
            win_height: 900,
            workspace_width: 1280,
            workspace_height: 770,
        };
        expect(cascade_position(0, oversized)).toEqual({ top: 0, left: 0 });
        expect(cascade_position(5, oversized)).toEqual({ top: 0, left: 0 });
    });
});

describe('next_cascade_position (module spawn cursor)', () => {
    beforeEach(() => {
        reset_cascade();
    });

    it('advances one slot per call', () => {
        expect(next_cascade_position(dims)).toEqual(base);
        expect(next_cascade_position(dims)).toEqual({
            top: base.top + CASCADE_STEP,
            left: base.left + CASCADE_STEP,
        });
    });
});
