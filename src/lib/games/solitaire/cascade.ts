/**
 * The win cascade's physics — XP's bouncing cards, as a pure function.
 *
 * Extracted from the component so it is testable: a win is close to
 * unreachable from an E2E (you would have to play a whole game), so if this
 * lived in `solitaire.svelte` it would ship with no coverage at all. The
 * component keeps only the frame loop and the DOM.
 */
export interface Bouncer {
    /** Asset basename, e.g. `KH`. */
    code: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
}

export interface Bounds {
    width: number;
    height: number;
}

export const GRAVITY = 0.9;
/** Energy kept after hitting the felt. Below 1, or they never settle. */
export const BOUNCE = 0.78;
export const CARD_W = 71;
export const CARD_H = 96;
/** How many may be in flight at once, so they cascade rather than dump. */
export const MAX_IN_FLIGHT = 14;

/** One frame. Returns a new array; the input is untouched. */
export function step_cascade(
    cards: readonly Bouncer[],
    bounds: Bounds,
): Bouncer[] {
    const floor = bounds.height - CARD_H;
    return (
        cards
            .map((card) => {
                const vy = card.vy + GRAVITY;
                const y = card.y + vy;
                if (y >= floor) {
                    // Land on the felt and rebound with some energy lost.
                    return {
                        ...card,
                        x: card.x + card.vx,
                        y: floor,
                        vy: -vy * BOUNCE,
                    };
                }
                return { ...card, x: card.x + card.vx, y, vy };
            })
            // Gone once fully off either edge.
            .filter(
                (card) => card.x > -CARD_W && card.x < bounds.width + CARD_W,
            )
    );
}

/** A card launched from the foundation pile at the top right. */
export function launch(
    code: string,
    bounds: Bounds,
    random: () => number,
): Bouncer {
    return {
        code,
        x: bounds.width - CARD_W - 19,
        y: 10,
        // Always leftward, at a spread of speeds, so the fan is uneven.
        vx: -(2 + random() * 5),
        vy: 0,
    };
}
