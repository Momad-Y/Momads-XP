import { describe, expect, it } from 'vitest';
import { CARD_H, MAX_FAN, PILE_H, fan_height, fan_offset } from './fan';

describe('tableau fan', () => {
    it('leaves short piles at XP’s full spacing', () => {
        // Nothing should look different until the pile actually needs it.
        for (const count of [0, 1, 2, 5, 11]) {
            expect(fan_offset(count), `${String(count)} cards`).toBe(MAX_FAN);
        }
    });

    it('keeps every pile depth inside the pile box', () => {
        /*
         * THE ASSERTION THAT MATTERS.
         *
         * 19 is the real maximum — six face-down cards under a King-to-Ace
         * run — and at the old fixed 20px gap that needed 452px of a 300px
         * box, so the top six cards were invisible and undraggable.
         */
        for (let count = 1; count <= 19; count++) {
            expect(
                fan_height(count),
                `${String(count)} cards overflow the pile`,
            ).toBeLessThanOrEqual(PILE_H);
        }
    });

    it('compresses only as much as it has to', () => {
        // A deeper pile is never given a wider gap than a shallower one.
        for (let count = 2; count <= 19; count++) {
            expect(fan_offset(count)).toBeLessThanOrEqual(
                fan_offset(count - 1),
            );
        }
        // …and the deepest pile still leaves the rank pip readable.
        expect(fan_offset(19)).toBeGreaterThan(10);
    });

    it('fills the box exactly once compression kicks in', () => {
        // At 12 cards a 20px gap would need 312px, so this is the first depth
        // that must compress — and it should use the whole 300px, not less.
        expect(fan_offset(11)).toBe(MAX_FAN);
        expect(fan_offset(12)).toBeLessThan(MAX_FAN);
        expect(fan_height(12)).toBeCloseTo(PILE_H, 6);
        expect(fan_height(19)).toBeCloseTo(PILE_H, 6);
    });

    it('states the geometry it depends on', () => {
        // These mirror `solitaire.svelte`'s `h-[300px]` and `w-[71px]` cards;
        // if the markup changes, this file has to change with it.
        expect(PILE_H).toBe(300);
        expect(CARD_H).toBe(92);
    });
});
