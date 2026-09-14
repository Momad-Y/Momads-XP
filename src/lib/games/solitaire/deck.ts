/** A standard 52-card deck. Rank 1 is the Ace, 11-13 are Jack/Queen/King. */
export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type Colour = 'red' | 'black';

export interface Card {
    suit: Suit;
    rank: number;
    face_up: boolean;
}

export const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

/** Klondike's tableau builds alternate colour, so this is load-bearing. */
export function colour_of(suit: Suit): Colour {
    return suit === 'hearts' || suit === 'diamonds' ? 'red' : 'black';
}

export function fresh_deck(): Card[] {
    const cards: Card[] = [];
    for (const suit of SUITS) {
        for (let rank = 1; rank <= 13; rank++) {
            cards.push({ suit, rank, face_up: false });
        }
    }
    return cards;
}

/**
 * Fisher-Yates against an injected rng, so a test can pin the deal and the
 * component can pass `Math.random`. Returns a new array — the input is not
 * touched.
 */
export function shuffle(cards: readonly Card[], rng: () => number): Card[] {
    const out = [...cards];
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const a = out[i];
        const b = out[j];
        if (a == null || b == null) continue;
        out[i] = b;
        out[j] = a;
    }
    return out;
}

/** Short label for a card, e.g. `AS`, `10H`, `KD`. Also the asset basename. */
export function card_code(card: Card): string {
    const rank =
        card.rank === 1
            ? 'A'
            : card.rank === 11
              ? 'J'
              : card.rank === 12
                ? 'Q'
                : card.rank === 13
                  ? 'K'
                  : String(card.rank);
    return `${rank}${card.suit[0]?.toUpperCase() ?? ''}`;
}
