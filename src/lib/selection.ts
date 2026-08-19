/**
 * Narrowing the ONE global `selectingItems` store to the surface that is
 * acting on it.
 *
 * Every Explorer window, plus the desktop, shares a single selection store, so
 * a selection can legitimately span two surfaces at once (Ctrl+click in window
 * B while window A holds a selection). A destructive action that reads the
 * store raw therefore acts on items its own window is not showing — and the
 * victim's highlight is focus-gated, so it renders no selection at all. That
 * is a silent cross-window delete; it has now been found on three separate
 * call sites, so the narrowing lives here instead of being re-derived inline.
 */

/**
 * `selected` filtered to `scope`, preserving the selection's order.
 *
 * `scope` is the ids the acting surface is currently showing. A NULL scope
 * means the caller could not tell us what it is showing — we then fall back to
 * `fallback` (typically the single item that was right-clicked) rather than
 * assuming the whole selection is fair game. Failing closed matters here: the
 * failure mode of guessing wrong is destroying a file in another window.
 */
export function scoped_ids(
    selected: readonly string[],
    scope: readonly string[] | null | undefined,
    fallback: readonly string[] = [],
): string[] {
    if (scope == null) return [...fallback];
    return selected.filter((id) => scope.includes(id));
}
