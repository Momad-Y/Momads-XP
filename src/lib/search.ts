/**
 * The one place the browser's home page and search engine are defined.
 *
 * They were hardcoded across four call sites — the homepage twice
 * (`internet_explorer.svelte`, `work_space.svelte`) and the search engine
 * twice (the sidebar box and the address bar's not-a-URL fallback) — and the
 * two searches pointed at Bing while the homepage pointed at wiby, so the
 * browser did not agree with itself about whose web it was on.
 *
 * wiby indexes the small, hand-made web: plain HTML, no scripts, no consent
 * walls. That is the right fit for a browser rendering inside a sandboxed
 * frame with no same-origin access, where a modern JS search page would show
 * a search box and never return results.
 */

/** IE's start page, and what the Home button goes to. */
export const HOMEPAGE = 'https://wiby.me/';

/** wiby's "surprise me" — a meta-refresh hop to a random indexed page. */
export const SURPRISE_URL = 'https://wiby.me/surprise/';

/**
 * A search for `query`. Returns null for a blank query so callers do not
 * navigate to a bare results page with nothing in it.
 */
export function search_url(query: string): string | null {
    const q = query.trim();
    if (q === '') return null;
    return `https://wiby.me/?q=${encodeURIComponent(q)}`;
}
