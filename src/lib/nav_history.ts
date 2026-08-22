/**
 * Internet Explorer's navigation trail.
 *
 * Kept out of the component because the Back button's correctness turns
 * entirely on WHICH of these two operations a given event maps to, and getting
 * that wrong is invisible until you press Back on a site that redirects:
 *
 *   - a NEW navigation (address bar, link click, favourite) APPENDS, and
 *     truncates anything ahead of the cursor;
 *   - a REDIRECT REPLACES the current entry, because the URL you asked for and
 *     the URL you landed on are one step, not two.
 *
 * Appending on redirect is the classic back-button trap: Back returns to the
 * URL that redirects, which redirects again and re-appends its destination, so
 * the user never leaves the page. google.com -> www.google.com is the everyday
 * case, and it made Back look completely dead.
 */

export interface NavState {
    entries: readonly string[];
    index: number;
}

/** The entry currently displayed, or null for a malformed state. */
export function current_entry(state: NavState): string | null {
    return state.entries[state.index] ?? null;
}

/**
 * A new navigation. Truncates forward history and appends.
 *
 * Navigating to the page already on screen does NOT add an entry — IE reloads
 * in place — otherwise a link pointing at the current page would leave a Back
 * step that visibly goes nowhere.
 */
export function push_entry(state: NavState, url: string): NavState {
    if (current_entry(state) === url) return state;
    const kept = state.entries.slice(0, state.index + 1);
    return { entries: [...kept, url], index: kept.length };
}

/**
 * A redirect of the entry we are already on: same step, different URL.
 * Never changes `index`, and never adds a step to walk back through.
 */
export function replace_entry(state: NavState, url: string): NavState {
    if (state.index < 0 || state.index >= state.entries.length) return state;
    if (current_entry(state) === url) return state;
    return {
        entries: state.entries.map((e, i) => (i === state.index ? url : e)),
        index: state.index,
    };
}

/** Step to an absolute index. Out-of-range moves are ignored, not clamped. */
export function go_to(state: NavState, idx: number): NavState {
    if (idx < 0 || idx >= state.entries.length) return state;
    if (idx === state.index) return state;
    return { entries: state.entries, index: idx };
}

export function can_go_back(state: NavState): boolean {
    return state.index > 0;
}

export function can_go_forward(state: NavState): boolean {
    return state.index < state.entries.length - 1;
}
