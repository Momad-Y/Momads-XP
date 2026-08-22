/**
 * Read-only page proxy for Internet Explorer.
 *
 * Why it exists: an iframe pointed straight at an external site is opaque to
 * us, so the address bar, Back/Forward, Create Shortcut and Favorites could
 * never follow the user past the first page. Serving the document from our own
 * origin (with a reporter injected) makes navigation observable.
 *
 * Why it is not a security regression: the IE iframe keeps its sandbox WITHOUT
 * `allow-same-origin`, so the proxied document runs on an opaque origin and
 * cannot reach localStorage, IndexedDB or the VFS. Nothing here relaxes that —
 * the reporter talks to the parent over postMessage, which the parent
 * validates.
 */
import { error } from '@sveltejs/kit';
import {
    check_browse_url,
    resolves_to_public,
} from '../../../lib/server/browse/url_guard';
import {
    meta_refresh_target,
    rewrite_document,
    should_strip_header,
} from '../../../lib/server/browse/rewrite';
import { create_rate_limiter } from '../../../lib/server/email/rate_limit';
import { is_allowed_origin } from '../../../lib/server/email/origin';
import type { RequestHandler } from './$types';

export const prerender = false;

/** Generous vs the contact form: browsing is many requests, sending is few. */
const limiter = create_rate_limiter({
    per_ip_per_hour: 300,
    global_per_day: 5000,
});

const FETCH_TIMEOUT_MS = 10_000;
/** Retro pages are small; this caps both memory and egress. */
const MAX_BYTES = 3_000_000;
/**
 * How many INSTANT meta refreshes to follow before giving up. Bounds a refresh
 * loop; two hops is already more than any real interstitial chain.
 */
const MAX_META_REFRESH_HOPS = 3;
/** Redirect hops followed by hand, each one re-validated. */
const MAX_REDIRECTS = 5;

/**
 * One timed, cookie-less upstream fetch. Returns null instead of throwing so a
 * meta-refresh hop can simply stop following rather than fail the whole page.
 */
async function fetch_upstream(url: string): Promise<Response | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => {
        controller.abort();
    }, FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, {
            // MANUAL, not 'follow'. `check_browse_url` validates the string the
            // caller supplied; following redirects inside `fetch` then walked
            // wherever the response pointed with no further check, so
            // `?url=https://attacker.tld/r` returning
            // `302 Location: http://169.254.169.254/…` defeated every rule in
            // url_guard. Each hop is now re-validated by `follow_redirects`.
            redirect: 'manual',
            signal: controller.signal,
            headers: {
                // Identify honestly and ask for a document. No cookies, no
                // auth: `fetch` sends none by default and we add none.
                'User-Agent':
                    'Mozilla/5.0 (compatible; MomadsXP/1.0; +https://momad-xp.netlify.app)',
                Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
                'Accept-Language': 'en',
            },
        });
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Follow up to `MAX_REDIRECTS` hops, re-running the FULL guard — text rules and
 * DNS resolution — on every `Location` before touching it. Returns the final
 * response, or null if a hop was refused or the chain ran too long.
 */
async function follow_redirects(
    first: Response,
    from_url: string,
): Promise<{ response: Response; url: string } | null> {
    let response = first;
    let current = from_url;

    for (let hop = 0; hop < MAX_REDIRECTS; hop++) {
        if (response.status < 300 || response.status >= 400) {
            return { response, url: current };
        }
        const location = response.headers.get('location');
        if (location == null || location === '') {
            return { response, url: current };
        }
        let next: string;
        try {
            next = new URL(location, current).toString();
        } catch {
            return null;
        }
        const verdict = check_browse_url(next);
        if (!verdict.ok || verdict.url == null || verdict.hostname == null) {
            return null;
        }
        if (!(await resolves_to_public(verdict.hostname))) return null;

        const hop_res = await fetch_upstream(verdict.url);
        if (hop_res == null) return null;
        response = hop_res;
        current = verdict.url;
    }
    return null; // too many hops
}

/**
 * Read at most `MAX_BYTES`, stopping as soon as the cap is passed.
 *
 * `await res.arrayBuffer()` buffered the WHOLE body first and only then
 * compared its length, so a server streaming gigabytes of `text/html` for the
 * full timeout was paid for in ingress and memory before the cap ever ran.
 */
async function read_capped(res: Response): Promise<string | null> {
    const body = res.body;
    if (body == null) return '';
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > MAX_BYTES) {
                await reader.cancel();
                return null;
            }
            chunks.push(value);
        }
    } catch {
        return null;
    }
    const joined = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
        joined.set(chunk, at);
        at += chunk.byteLength;
    }
    return new TextDecoder('utf-8').decode(joined);
}

export const GET: RequestHandler = async (event) => {
    // Only our own app may drive the proxy — this is not an open relay.
    //
    // The frame is sandboxed to an opaque origin AND carries
    // referrerpolicy="no-referrer", so Origin arrives as `null` and Referer is
    // absent. `Sec-Fetch-Site` is the reliable signal here: the browser sets it
    // and page script cannot forge it, and a document request from our own
    // page is `same-origin`. Origin/Referer remain as a fallback for browsers
    // that omit the fetch-metadata headers.
    /**
     * `Sec-Fetch-Site` is set by the BROWSER and cannot be forged from script;
     * `Origin` is likewise browser-controlled. `Referer` is neither — it used
     * to be accepted as a fallback, so `curl -H 'Referer: <our app>'` turned
     * this endpoint into a general-purpose anonymising relay billed to us, and
     * turned every SSRF finding into a zero-victim attack. Dropped.
     *
     * Browsers that send no fetch metadata still work: they send `Origin` on
     * anything cross-origin, and same-origin subresource loads from our own
     * page are exactly the case `sec-fetch-site: same-origin` covers.
     */
    const fetch_site = event.request.headers.get('sec-fetch-site');
    let same_origin_request =
        fetch_site === 'same-origin' || fetch_site === 'none';
    if (!same_origin_request) {
        const origin = event.request.headers.get('origin');
        same_origin_request = is_allowed_origin(origin);
    }
    if (!same_origin_request) {
        error(403, 'forbidden_origin');
    }

    let ip = 'unknown';
    try {
        ip = event.getClientAddress();
    } catch {
        // adapter could not resolve one (unit test) — shared bucket
    }
    // The global cap was configured and NEVER enforced — `allow_send` was
    // never called, so a metered endpoint that spends an invocation per user
    // action had no ceiling but a per-IP, per-container bucket.
    if (!limiter.allow_send(Date.now())) {
        error(429, 'rate_limited');
    }
    if (!limiter.allow(ip, Date.now())) {
        error(429, 'rate_limited');
    }

    const verdict = check_browse_url(event.url.searchParams.get('url'));
    if (!verdict.ok || verdict.url == null || verdict.hostname == null) {
        error(400, verdict.reason ?? 'malformed');
    }
    const target = verdict.url;
    // The text rules can only see what is written in the URL. A hostname the
    // caller controls can point anywhere, so it has to be resolved and every
    // answer checked before we connect.
    if (!(await resolves_to_public(verdict.hostname))) {
        error(400, 'blocked_host');
    }

    const first = await fetch_upstream(target);
    if (first == null) error(502, 'fetch_failed');
    const followed = await follow_redirects(first, target);
    if (followed == null) error(502, 'fetch_failed');
    const upstream = followed.response;
    const landed_url = followed.url;

    // `raw=1` backs IE's View Source: it must show the page as the server sent
    // it, NOT the rewritten copy with our base tag and reporter injected.
    const raw = event.url.searchParams.get('raw') === '1';

    const content_type = upstream.headers.get('content-type') ?? '';
    // Anything that is not a document is served by the real origin via <base>,
    // so a non-HTML response here means the user navigated straight to an
    // asset. Send them to it rather than streaming it through the function.
    if (!content_type.includes('text/html')) {
        return new Response(null, {
            status: 302,
            headers: { location: landed_url },
        });
    }

    const html = await read_capped(upstream);
    if (html == null) {
        error(413, 'too_large');
    }

    if (raw) {
        // text/plain + nosniff: the source is displayed, never executed.
        return new Response(html, {
            status: upstream.status,
            headers: {
                'content-type': 'text/plain; charset=utf-8',
                'x-content-type-options': 'nosniff',
                'cache-control': 'public, max-age=300',
                'x-robots-tag': 'noindex, nofollow',
            },
        });
    }
    /**
     * Follow an INSTANT meta refresh, which `redirect: 'follow'` cannot see —
     * it is a 200 whose body redirects. wiby's "surprise me" is exactly that,
     * so without this the frame moved itself to the random page while the
     * address bar stayed on https://wiby.me/surprise/.
     *
     * Each hop is re-validated through `check_browse_url`: the target comes
     * from a page we do not control, so it gets the same SSRF treatment as
     * anything the user types. The budget bounds a refresh loop.
     */
    let landed = landed_url;
    let page = html;
    for (let hop = 0; hop < MAX_META_REFRESH_HOPS; hop++) {
        const next = meta_refresh_target(page, landed);
        if (next == null) break;
        const next_verdict = check_browse_url(next);
        if (
            !next_verdict.ok ||
            next_verdict.url == null ||
            next_verdict.hostname == null
        )
            break;
        if (!(await resolves_to_public(next_verdict.hostname))) break;

        const hop_first = await fetch_upstream(next_verdict.url);
        if (hop_first == null) break;
        const hop_followed = await follow_redirects(
            hop_first,
            next_verdict.url,
        );
        if (hop_followed == null) break;
        const hop_res = hop_followed.response;
        if (!(hop_res.headers.get('content-type') ?? '').includes('text/html'))
            break;
        // Following is BEST EFFORT: the page in hand already loaded, so a
        // hop that fails to read must leave the user on it rather than turn a
        // working page into a 500.
        const hop_html = await read_capped(hop_res);
        if (hop_html == null) break;

        page = hop_html;
        landed = hop_followed.url;
    }

    // `landed` reflects redirects — HTTP ones and the meta variety — so the
    // reporter announces where the user actually ended up, while `target` is
    // what they aimed at. The parent needs both to tell a redirect of the
    // current entry from a stale message (see src/lib/nav_history.ts).
    const body = rewrite_document(page, landed, target);

    const headers = new Headers();
    upstream.headers.forEach((value, key) => {
        if (!should_strip_header(key)) headers.set(key, value);
    });
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.delete('content-encoding');
    headers.delete('content-length');
    // Our own policy for the proxied document: it may render and script, but it
    // is on an opaque origin (iframe sandbox) so it owns nothing of ours.
    headers.set('cache-control', 'public, max-age=300');
    headers.set('x-robots-tag', 'noindex, nofollow');

    return new Response(body, { status: upstream.status, headers });
};
