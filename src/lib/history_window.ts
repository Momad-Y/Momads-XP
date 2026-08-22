/**
 * The slice of an Explorer window's navigation trail that View > Go To shows.
 *
 * The flyout is unscrolled and clipped by the window, so the trail has to be
 * capped — but a plain `slice(-cap)` keeps the NEWEST stops, and the entry Go
 * To ticks is the CURRENT one. After enough hops, pressing Back put the folder
 * on screen outside the window: the menu listed stops the user had left and
 * showed no ✓ at all.
 */
import type { HistoryEntry } from './types';

export const GO_TO_CAP = 8;

/**
 * At most `cap` entries, always including `current`. Absolute `idx` values are
 * preserved, so picking one still navigates to the right stop.
 */
export function visible_trail(
    entries: readonly HistoryEntry[],
    current: number,
    cap: number = GO_TO_CAP,
): HistoryEntry[] {
    if (cap <= 0) return [];
    if (entries.length <= cap) return [...entries];
    // centre the window on `current`, then clamp it inside the trail
    const half = Math.floor(cap / 2);
    const start = Math.max(0, Math.min(current - half, entries.length - cap));
    return entries.slice(start, start + cap);
}
