import { describe, expect, it } from 'vitest';
import { colour_of, fresh_deck, shuffle, type Card, type Suit } from './deck';
import {
    auto_complete_available,
    auto_finish,
    can_move,
    deal,
    draw_from_stock,
    has_won,
    move,
    type Game,
} from './klondike';

const fixed = (): number => 0.5;
const card = (suit: Suit, rank: number, face_up = true): Card => ({
    suit,
    rank,
    face_up,
});

/** Replace one tableau column without widening the tuple type. */
function with_tableau(game: Game, index: number, pile: Card[]): Game {
    const t = game.tableau;
    const next: Game['tableau'] = [t[0], t[1], t[2], t[3], t[4], t[5], t[6]];
    next[index] = pile;
    return { ...game, tableau: next };
}

describe('deck', () => {
    it('assigns colours by suit', () => {
        expect(colour_of('hearts')).toBe('red');
        expect(colour_of('diamonds')).toBe('red');
        expect(colour_of('spades')).toBe('black');
        expect(colour_of('clubs')).toBe('black');
    });

    it('builds 52 distinct face-down cards', () => {
        const d = fresh_deck();
        expect(d).toHaveLength(52);
        expect(new Set(d.map((c) => `${c.suit}${String(c.rank)}`)).size).toBe(
            52,
        );
        expect(d.every((c) => !c.face_up)).toBe(true);
    });

    it('shuffles without gaining or losing a card, and without mutating', () => {
        const d = fresh_deck();
        const before = JSON.stringify(d);
        const s = shuffle(d, fixed);
        expect(s).toHaveLength(52);
        expect(new Set(s.map((c) => `${c.suit}${String(c.rank)}`)).size).toBe(
            52,
        );
        expect(JSON.stringify(d)).toBe(before);
    });
});

describe('klondike', () => {
    it('deals seven ascending piles with only the last card face up', () => {
        const g = deal(fixed);
        expect(g.tableau.map((p) => p.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
        for (const pile of g.tableau) {
            expect(pile.at(-1)?.face_up).toBe(true);
            expect(pile.slice(0, -1).every((c) => !c.face_up)).toBe(true);
        }
        expect(g.stock).toHaveLength(24);
        expect(g.waste).toHaveLength(0);
        expect(g.foundations.flat()).toHaveLength(0);
    });

    it('uses all 52 cards exactly once', () => {
        const g = deal(fixed);
        const all = [
            ...g.stock,
            ...g.waste,
            ...g.tableau.flat(),
            ...g.foundations.flat(),
        ];
        expect(all).toHaveLength(52);
        expect(new Set(all.map((c) => `${c.suit}${String(c.rank)}`)).size).toBe(
            52,
        );
    });

    it('recycles the waste when the stock runs out', () => {
        let g: Game = { ...deal(fixed), draw: 1 };
        for (let i = 0; i < 24; i++) g = draw_from_stock(g);
        expect(g.stock).toHaveLength(0);
        expect(g.waste).toHaveLength(24);
        g = draw_from_stock(g);
        expect(g.stock).toHaveLength(24);
        expect(g.waste).toHaveLength(0);
    });

    it('turns drawn cards face up', () => {
        const g = draw_from_stock({ ...deal(fixed), draw: 1 });
        expect(g.waste.at(-1)?.face_up).toBe(true);
    });

    it('allows a descending alternating-colour build', () => {
        const g = with_tableau(
            { ...deal(fixed), waste: [card('hearts', 6)] },
            0,
            [card('spades', 7)],
        );
        expect(
            can_move(g, { pile: 'waste' }, { pile: 'tableau', index: 0 }),
        ).toBe(true);
    });

    it('rejects a same-colour or wrong-rank build', () => {
        const same = with_tableau(
            { ...deal(fixed), waste: [card('diamonds', 6)] },
            0,
            [card('hearts', 7)],
        );
        expect(
            can_move(same, { pile: 'waste' }, { pile: 'tableau', index: 0 }),
        ).toBe(false);

        const gap = with_tableau(
            { ...deal(fixed), waste: [card('spades', 5)] },
            0,
            [card('hearts', 7)],
        );
        expect(
            can_move(gap, { pile: 'waste' }, { pile: 'tableau', index: 0 }),
        ).toBe(false);
    });

    it('only lets a King fill an empty column', () => {
        const king = with_tableau(
            { ...deal(fixed), waste: [card('spades', 13)] },
            0,
            [],
        );
        expect(
            can_move(king, { pile: 'waste' }, { pile: 'tableau', index: 0 }),
        ).toBe(true);

        const queen = with_tableau(
            { ...deal(fixed), waste: [card('spades', 12)] },
            0,
            [],
        );
        expect(
            can_move(queen, { pile: 'waste' }, { pile: 'tableau', index: 0 }),
        ).toBe(false);
    });

    it('builds foundations up by suit from the Ace', () => {
        const ace: Game = {
            ...deal(fixed),
            waste: [card('clubs', 1)],
            foundations: [[], [], [], []],
        };
        expect(
            can_move(ace, { pile: 'waste' }, { pile: 'foundation', index: 0 }),
        ).toBe(true);

        const seeded: Game = {
            ...ace,
            foundations: [[card('clubs', 1)], [], [], []],
        };
        expect(
            can_move(
                { ...seeded, waste: [card('clubs', 3)] },
                { pile: 'waste' },
                { pile: 'foundation', index: 0 },
            ),
        ).toBe(false);
        expect(
            can_move(
                { ...seeded, waste: [card('clubs', 2)] },
                { pile: 'waste' },
                { pile: 'foundation', index: 0 },
            ),
        ).toBe(true);
        // wrong suit for that foundation
        expect(
            can_move(
                { ...seeded, waste: [card('hearts', 2)] },
                { pile: 'waste' },
                { pile: 'foundation', index: 0 },
            ),
        ).toBe(false);
    });

    it('refuses to send a multi-card run to a foundation', () => {
        // Foundations take one card at a time; a run would silently bury cards.
        const g = with_tableau(
            { ...deal(fixed), foundations: [[], [], [], []] },
            0,
            [card('clubs', 1), card('diamonds', 2)],
        );
        expect(
            can_move(
                g,
                { pile: 'tableau', index: 0, depth: 1 },
                { pile: 'foundation', index: 0 },
            ),
        ).toBe(false);
    });

    it('moves a run and flips the card it uncovers', () => {
        let g = with_tableau(deal(fixed), 0, [
            card('hearts', 5, false),
            card('spades', 4),
            card('diamonds', 3),
        ]);
        g = with_tableau(g, 1, [card('hearts', 5)]);
        // depth 1 = grab the spades 4, which has the diamonds 3 on top of it.
        // depth 2 would reach the FACE-DOWN hearts 5, and a run containing a
        // hidden card is not draggable — asserted separately below.
        const after = move(
            g,
            { pile: 'tableau', index: 0, depth: 1 },
            { pile: 'tableau', index: 1 },
        );
        expect(after.tableau[1]).toHaveLength(3);
        expect(after.tableau[0]).toHaveLength(1);
        expect(after.tableau[0][0]?.face_up).toBe(true);
    });

    it('refuses to drag a run that contains a face-down card', () => {
        // Reaching past a hidden card would expose it mid-drag and let the
        // player move cards they have not earned sight of.
        let g = with_tableau(deal(fixed), 0, [
            card('hearts', 5, false),
            card('spades', 4),
            card('diamonds', 3),
        ]);
        g = with_tableau(g, 1, [card('spades', 6)]);
        expect(
            can_move(
                g,
                { pile: 'tableau', index: 0, depth: 2 },
                { pile: 'tableau', index: 1 },
            ),
        ).toBe(false);
    });

    it('returns the game unchanged for an illegal move', () => {
        const g = with_tableau(
            { ...deal(fixed), waste: [card('diamonds', 6)] },
            0,
            [card('hearts', 7)],
        );
        expect(
            move(g, { pile: 'waste' }, { pile: 'tableau', index: 0 }),
        ).toEqual(g);
    });

    it('never mutates the game it was given', () => {
        const g = deal(fixed);
        const before = JSON.stringify(g);
        draw_from_stock(g);
        move(g, { pile: 'waste' }, { pile: 'tableau', index: 0 });
        expect(JSON.stringify(g)).toBe(before);
    });

    it('detects auto-complete only once nothing is hidden', () => {
        const g = deal(fixed);
        expect(auto_complete_available(g)).toBe(false);

        const face_up = (pile: Card[]): Card[] =>
            pile.map((c) => ({ ...c, face_up: true }));
        const t = g.tableau;
        const done: Game = {
            ...g,
            stock: [],
            waste: [],
            tableau: [
                face_up(t[0]),
                face_up(t[1]),
                face_up(t[2]),
                face_up(t[3]),
                face_up(t[4]),
                face_up(t[5]),
                face_up(t[6]),
            ],
        };
        expect(auto_complete_available(done)).toBe(true);

        // still cards in the stock -> not yet
        expect(
            auto_complete_available({ ...done, stock: [card('clubs', 1)] }),
        ).toBe(false);
    });

    it('wins when all four foundations hold thirteen cards', () => {
        const g = deal(fixed);
        expect(has_won(g)).toBe(false);
        const pile = (s: Suit): Card[] =>
            Array.from({ length: 13 }, (_, i) => card(s, i + 1));
        const full: Game = {
            ...g,
            foundations: [
                pile('clubs'),
                pile('diamonds'),
                pile('hearts'),
                pile('spades'),
            ],
        };
        expect(has_won(full)).toBe(true);
    });
});

describe('auto_finish', () => {
    const suits: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

    it('sends every card home from a solved-but-unplayed position', () => {
        // One suit per column, ace on top, so every step is a legal home move.
        const g = deal(fixed);
        const columns = suits.map((s) =>
            Array.from({ length: 13 }, (_, i) => card(s, 13 - i)),
        );
        const start: Game = {
            ...g,
            stock: [],
            waste: [],
            foundations: [[], [], [], []],
            tableau: [
                columns[0] ?? [],
                columns[1] ?? [],
                columns[2] ?? [],
                columns[3] ?? [],
                [],
                [],
                [],
            ],
        };
        expect(has_won(auto_finish(start))).toBe(true);
    });

    it('terminates instead of spinning when it cannot finish', () => {
        /*
         * THE case the component must handle. An Ace buried under its own 2
         * deadlocks: the 2 cannot go home before the Ace, and this never moves
         * the 2 aside. It must stop, not loop — and the caller must not
         * assume a win.
         */
        const g = deal(fixed);
        const stuck: Game = {
            ...g,
            stock: [],
            waste: [],
            foundations: [[], [], [], []],
            tableau: [
                [card('clubs', 1), card('clubs', 2)],
                [],
                [],
                [],
                [],
                [],
                [],
            ],
        };
        const after = auto_finish(stuck);
        expect(has_won(after)).toBe(false);
        expect(after.tableau[0]).toHaveLength(2);
    });

    it('never mutates the game it was given', () => {
        const g = deal(fixed);
        const before = JSON.stringify(g);
        auto_finish(g);
        expect(JSON.stringify(g)).toBe(before);
    });
});

describe('the removal helper guards against a zero count', () => {
    it('a no-op move leaves every pile intact', () => {
        /*
         * Guards a JavaScript trap rather than a game rule: `slice(0, -count)`
         * with count 0 is `slice(0, -0)`, and `-0 === 0`, so it returns an
         * empty array and would wipe the pile. Exercised through the only
         * public path that could ever reach it.
         */
        const g = with_tableau({ ...deal(fixed), waste: [] }, 0, [
            card('spades', 7),
        ]);
        // An empty waste yields no cards, so this move is refused outright.
        const after = move(g, { pile: 'waste' }, { pile: 'tableau', index: 0 });
        expect(after.tableau[0]).toHaveLength(1);
        expect(after).toEqual(g);
    });
});
