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
import { check_browse_url } from '../../../lib/server/browse/url_guard';
import {
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

export const GET: RequestHandler = async (event) => {
    // Only our own app may drive the proxy — this is not an open relay.
    //
    // The frame is sandboxed to an opaque origin AND carries
    // referrerpolicy="no-referrer", so Origin arrives as `null` and Referer is
    // absent. `Sec-Fetch-Site` is the reliable signal here: the browser sets it
    // and page script cannot forge it, and a document request from our own
    // page is `same-origin`. Origin/Referer remain as a fallback for browsers
    // that omit the fetch-metadata headers.
    const fetch_site = event.request.headers.get('sec-fetch-site');
    let same_origin_request = fetch_site === 'same-origin';
    if (!same_origin_request) {
        let origin = event.request.headers.get('origin');
        const referer = event.request.headers.get('referer');
        if ((origin == null || origin === 'null') && referer != null) {
            try {
                origin = new URL(referer).origin;
            } catch {
                origin = null;
            }
        }
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
    if (!limiter.allow(ip, Date.now())) {
        error(429, 'rate_limited');
    }

    const verdict = check_browse_url(event.url.searchParams.get('url'));
    if (!verdict.ok || verdict.url == null) {
        error(400, verdict.reason ?? 'malformed');
    }
    const target = verdict.url;

    const controller = new AbortController();
    const timer = setTimeout(() => {
        controller.abort();
    }, FETCH_TIMEOUT_MS);

    let upstream: Response;
    try {
        upstream = await fetch(target, {
            redirect: 'follow',
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
        clearTimeout(timer);
        error(502, 'fetch_failed');
    }
    clearTimeout(timer);

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
            headers: { location: upstream.url || target },
        });
    }

    const buffer = await upstream.arrayBuffer();
    if (buffer.byteLength > MAX_BYTES) {
        error(413, 'too_large');
    }
    const html = new TextDecoder('utf-8').decode(buffer);

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
    // `upstream.url` reflects redirects, so the reporter announces where the
    // user actually landed rather than where they aimed.
    const body = rewrite_document(html, upstream.url || target, target);

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
