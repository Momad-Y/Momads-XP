/**
 * How far apart cards sit down a tableau pile.
 *
 * A fixed gap does not work. The pile box is 300px tall and a card is 92px, so
 * a 20px gap fits only 11 cards inside it, and the felt — which clips — shows
 * 13 before the rest simply disappear. A Klondike pile legitimately reaches
 * 19: up to six face-down cards under a full King-to-Ace run.
 *
 * What makes that a real bug rather than a cosmetic one is WHICH card goes
 * missing. The pile grows downward, so past the thirteenth card it is the TOP
 * card that falls off the bottom — and the top card is the one you have to
 * drag. The game would become unplayable exactly when it is nearly won.
 *
 * So the fan compresses once it has to, which is what XP does as well.
 */

/** `h-[300px]` on each tableau pile in `solitaire.svelte`. */
export const PILE_H = 300;
/** The rasterised deck is 71x92, and the markup pins width at `w-[71px]`. */
export const CARD_H = 92;
/** XP's uncompressed gap, used whenever the pile is short enough to afford it. */
export const MAX_FAN = 20;

/**
 * The gap for a pile of `count` cards, in CSS px.
 *
 * Never more than `MAX_FAN`, and never so large that the last card's bottom
 * edge falls outside `PILE_H`.
 */
export function fan_offset(count: number): number {
    if (count < 2) return MAX_FAN;
    return Math.min(MAX_FAN, (PILE_H - CARD_H) / (count - 1));
}

/** Where the bottom edge of the last card lands, measured from the pile top. */
export function fan_height(count: number): number {
    if (count < 1) return 0;
    return (count - 1) * fan_offset(count) + CARD_H;
}
