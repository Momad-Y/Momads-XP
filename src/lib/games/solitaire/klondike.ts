import { colour_of, fresh_deck, shuffle, SUITS, type Card } from './deck';

/**
 * Klondike, as XP plays it.
 *
 * Everything here is immutable (`coding-style.md`): each function returns a
 * new `Game` and never touches its argument. The component relies on that —
 * it reassigns its `game` variable to invalidate, and a mutating update would
 * make that reassignment look redundant until something else held a reference.
 */
export interface Game {
    stock: Card[];
    waste: Card[];
    /** Indexed by `SUITS`: clubs, diamonds, hearts, spades. */
    foundations: [Card[], Card[], Card[], Card[]];
    tableau: [Card[], Card[], Card[], Card[], Card[], Card[], Card[]];
    draw: 1 | 3;
}

export type Source =
    | { pile: 'waste' }
    /** `depth` is how many cards sit ON TOP of the grabbed card; 0 is the top card. */
    | { pile: 'tableau'; index: number; depth: number }
    | { pile: 'foundation'; index: number };

export type Target =
    { pile: 'tableau'; index: number } | { pile: 'foundation'; index: number };

export const TABLEAU_COLUMNS = 7;

export function deal(rng: () => number, draw: 1 | 3 = 1): Game {
    const cards = shuffle(fresh_deck(), rng);
    let at = 0;
    const columns: Card[][] = [];
    for (let col = 0; col < TABLEAU_COLUMNS; col++) {
        const pile: Card[] = [];
        for (let n = 0; n <= col; n++) {
            const card = cards[at++];
            if (card == null) continue;
            pile.push({ ...card, face_up: n === col });
        }
        columns.push(pile);
    }
    return {
        stock: cards.slice(at).map((c) => ({ ...c, face_up: false })),
        waste: [],
        foundations: [[], [], [], []],
        tableau: [
            columns[0] ?? [],
            columns[1] ?? [],
            columns[2] ?? [],
            columns[3] ?? [],
            columns[4] ?? [],
            columns[5] ?? [],
            columns[6] ?? [],
        ],
        draw,
    };
}

export function draw_from_stock(game: Game): Game {
    if (game.stock.length === 0) {
        // Recycle: the waste goes back face down, in the order it was dealt.
        return {
            ...game,
            stock: [...game.waste]
                .reverse()
                .map((c) => ({ ...c, face_up: false })),
            waste: [],
        };
    }
    const count = Math.min(game.draw, game.stock.length);
    const taken = game.stock.slice(game.stock.length - count);
    return {
        ...game,
        stock: game.stock.slice(0, game.stock.length - count),
        waste: [...game.waste, ...taken.map((c) => ({ ...c, face_up: true }))],
    };
}

/** The cards a source refers to, top-most last. Empty when the source is invalid. */
function taken_cards(game: Game, from: Source): Card[] {
    if (from.pile === 'waste') {
        const top = game.waste.at(-1);
        return top == null ? [] : [top];
    }
    if (from.pile === 'foundation') {
        const top = game.foundations[from.index]?.at(-1);
        return top == null ? [] : [top];
    }
    const pile = game.tableau[from.index];
    if (pile == null) return [];
    const start = pile.length - 1 - from.depth;
    if (start < 0) return [];
    const run = pile.slice(start);
    // A run can only be dragged if every card in it is already face up.
    return run.every((c) => c.face_up) ? run : [];
}

export function can_move(game: Game, from: Source, to: Target): boolean {
    const cards = taken_cards(game, from);
    const first = cards[0];
    if (first == null) return false;

    // Moving onto the pile it came from is not a move.
    if (
        from.pile === 'tableau' &&
        to.pile === 'tableau' &&
        from.index === to.index
    ) {
        return false;
    }

    if (to.pile === 'foundation') {
        // One card at a time. A run would bury every card below the top.
        if (cards.length !== 1) return false;
        const foundation = game.foundations[to.index];
        if (foundation == null) return false;
        if (SUITS[to.index] !== first.suit) return false;
        return first.rank === foundation.length + 1;
    }

    const pile = game.tableau[to.index];
    if (pile == null) return false;
    const top = pile.at(-1);
    if (top == null) return first.rank === 13; // only a King opens a column
    if (!top.face_up) return false;
    return (
        first.rank === top.rank - 1 &&
        colour_of(first.suit) !== colour_of(top.suit)
    );
}

/**
 * Remove the source cards, flipping whatever they uncovered.
 *
 * The `count === 0` guard is not theoretical. Every `slice(0, -count)` below
 * becomes `slice(0, -0)` — and `-0 === 0` in JavaScript, so that is
 * `slice(0, 0)`, which returns an EMPTY array and would silently delete the
 * whole pile. `move()` cannot reach it today (`can_move` requires at least one
 * card), but nothing in the signature says so.
 */
function without(game: Game, from: Source, count: number): Game {
    if (count <= 0) return game;
    if (from.pile === 'waste') {
        return { ...game, waste: game.waste.slice(0, -count) };
    }
    if (from.pile === 'foundation') {
        const next: Game['foundations'] = [
            game.foundations[0],
            game.foundations[1],
            game.foundations[2],
            game.foundations[3],
        ];
        next[from.index] = (next[from.index] ?? []).slice(0, -count);
        return { ...game, foundations: next };
    }
    const t = game.tableau;
    const next: Game['tableau'] = [t[0], t[1], t[2], t[3], t[4], t[5], t[6]];
    const remaining = (next[from.index] ?? []).slice(0, -count);
    const exposed = remaining.at(-1);
    if (exposed != null && !exposed.face_up) {
        remaining[remaining.length - 1] = { ...exposed, face_up: true };
    }
    next[from.index] = remaining;
    return { ...game, tableau: next };
}

function onto(game: Game, to: Target, cards: Card[]): Game {
    if (to.pile === 'foundation') {
        const next: Game['foundations'] = [
            game.foundations[0],
            game.foundations[1],
            game.foundations[2],
            game.foundations[3],
        ];
        next[to.index] = [...(next[to.index] ?? []), ...cards];
        return { ...game, foundations: next };
    }
    const t = game.tableau;
    const next: Game['tableau'] = [t[0], t[1], t[2], t[3], t[4], t[5], t[6]];
    next[to.index] = [...(next[to.index] ?? []), ...cards];
    return { ...game, tableau: next };
}

/** Returns the game UNCHANGED when the move is illegal — callers rely on this. */
export function move(game: Game, from: Source, to: Target): Game {
    if (!can_move(game, from, to)) return game;
    const cards = taken_cards(game, from).map((c) => ({ ...c, face_up: true }));
    return onto(without(game, from, cards.length), to, cards);
}

/**
 * True when every remaining card is visible, so the rest of the game is
 * mechanical and the player can be offered a one-click finish.
 */
export function auto_complete_available(game: Game): boolean {
    if (has_won(game)) return false;
    return (
        game.stock.length === 0 &&
        game.waste.length === 0 &&
        game.tableau.every((pile) => pile.every((c) => c.face_up))
    );
}

export function has_won(game: Game): boolean {
    return game.foundations.every((pile) => pile.length === 13);
}

/**
 * Play every card that can go home, repeatedly, until nothing moves.
 *
 * ONLY top-card-to-foundation moves, which means it can stall: an Ace buried
 * under its own 2 deadlocks, because the 2 cannot go home until the Ace does
 * and this never moves the 2 aside. Callers must therefore check `has_won()`
 * on the result rather than assuming it finished — `auto_complete_available()`
 * says the position is fully visible, not that it is winnable this way.
 *
 * Terminates: every iteration either moves at least one card to a foundation
 * (of which there are 52) or breaks.
 */
export function auto_finish(game: Game): Game {
    let current = game;
    let moved = true;
    while (moved && !has_won(current)) {
        moved = false;
        for (let column = 0; column < TABLEAU_COLUMNS; column++) {
            const from: Source = { pile: 'tableau', index: column, depth: 0 };
            for (let f = 0; f < 4; f++) {
                const to: Target = { pile: 'foundation', index: f };
                if (!can_move(current, from, to)) continue;
                current = move(current, from, to);
                moved = true;
                break;
            }
        }
        // The waste can hold a playable card too when a caller invokes this
        // outside `auto_complete_available`'s preconditions.
        for (let f = 0; f < 4; f++) {
            const from: Source = { pile: 'waste' };
            const to: Target = { pile: 'foundation', index: f };
            if (!can_move(current, from, to)) continue;
            current = move(current, from, to);
            moved = true;
            break;
        }
    }
    return current;
}
