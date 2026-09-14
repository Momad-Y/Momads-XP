import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { card_code, colour_of, fresh_deck, SUITS } from './deck';

describe('card_code', () => {
    it('names court cards and the ace by letter', () => {
        // This string IS the asset filename. A wrong mapping ships 53 broken
        // images, and the E2E cannot see it — it counts <img> elements, which
        // exist whether or not the file 404s.
        expect(card_code({ suit: 'spades', rank: 1, face_up: true })).toBe(
            'AS',
        );
        expect(card_code({ suit: 'hearts', rank: 11, face_up: true })).toBe(
            'JH',
        );
        expect(card_code({ suit: 'diamonds', rank: 12, face_up: true })).toBe(
            'QD',
        );
        expect(card_code({ suit: 'clubs', rank: 13, face_up: true })).toBe(
            'KC',
        );
    });

    it('names pip cards by number, including the two-digit ten', () => {
        expect(card_code({ suit: 'clubs', rank: 2, face_up: true })).toBe('2C');
        expect(card_code({ suit: 'hearts', rank: 9, face_up: true })).toBe(
            '9H',
        );
        expect(card_code({ suit: 'diamonds', rank: 10, face_up: true })).toBe(
            '10D',
        );
    });

    it('produces 52 distinct codes for a full deck', () => {
        const codes = fresh_deck().map(card_code);
        expect(new Set(codes).size).toBe(52);
    });
});

describe('the card artwork actually ships', () => {
    it('has a PNG for every one of the 52 cards, plus a back', () => {
        /*
         * Nothing else checks this. `vendored_games.test.ts` pins the
         * Stockfish and js-dos bytes but never looks at the card or chess
         * assets, and `LICENSE-third-party.md` makes claims about both.
         */
        const missing = fresh_deck()
            .map(card_code)
            .filter((code) => !existsSync(`static/assets/cards/${code}.png`));
        expect(missing, 'card faces missing from static/assets/cards').toEqual(
            [],
        );
        expect(existsSync('static/assets/cards/back.png')).toBe(true);
    });

    it('has a chess piece for both colours of all six types', () => {
        const missing: string[] = [];
        for (const colour of ['w', 'b']) {
            for (const type of ['K', 'Q', 'R', 'B', 'N', 'P']) {
                const file = `static/assets/chess/${colour}${type}.svg`;
                if (!existsSync(file)) missing.push(file);
            }
        }
        expect(missing).toEqual([]);
    });
});

describe('colour_of covers every suit', () => {
    it('splits the four suits two and two', () => {
        const reds = SUITS.filter((s) => colour_of(s) === 'red');
        expect(reds).toHaveLength(2);
        expect(SUITS).toHaveLength(4);
    });
});
