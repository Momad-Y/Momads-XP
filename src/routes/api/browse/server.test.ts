import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The guard now RESOLVES a hostname and rejects it unless every answer is a
 * public address — a string check cannot see that `ssrf.attacker.tld` points
 * at 169.254.169.254. Tests must not depend on real DNS, so the lookup is
 * mocked; `lookup_result` lets a test make a name resolve internally.
 */
const lookup_result = vi.fn(() =>
    Promise.resolve([{ address: '93.184.216.34', family: 4 }]),
);
vi.mock('node:dns/promises', () => ({
    default: { lookup: lookup_result },
    lookup: lookup_result,
}));

/**
 * The endpoint no longer calls global `fetch` — it goes through
 * `pinned_fetch`, which uses node:https with the resolved address forced into
 * `lookup` so a short-TTL DNS answer cannot move the socket. Stubbing that
 * module is the seam now, and it also lets a test assert WHICH address the
 * connection was pinned to.
 */
const pinned = vi.fn();
vi.mock('../../../lib/server/browse/pinned_fetch', () => ({
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- a vi.fn() mock is untyped by construction
    pinned_fetch: (req: unknown) => pinned(req),
}));

import { GET } from './+server';

const APP = 'https://momad-xp.netlify.app';

let ip_counter = 0;

/**
 * Builds only the fields GET reads. `sec-fetch-site: same-origin` is the normal
 * path — the iframe is opaque so Origin/Referer are absent in real traffic.
 */
function make_event(
    target: string | null,
    opts?: {
        fetch_site?: string | null;
        origin?: string | null;
        referer?: string | null;
        ip?: string;
        raw?: boolean;
    },
) {
    const headers = new Headers();
    const site =
        opts?.fetch_site === undefined ? 'same-origin' : opts.fetch_site;
    if (site != null) headers.set('sec-fetch-site', site);
    if (opts?.origin != null) headers.set('origin', opts.origin);
    if (opts?.referer != null) headers.set('referer', opts.referer);

    const url = new URL(`${APP}/api/browse`);
    if (target != null) url.searchParams.set('url', target);
    if (opts?.raw === true) url.searchParams.set('raw', '1');

    const event_shape = {
        request: new Request(url, { method: 'GET', headers }),
        url,
        getClientAddress: () => opts?.ip ?? `10.0.0.${String(++ip_counter)}`,
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- unit test constructs only the fields GET reads
    return event_shape as unknown as Parameters<typeof GET>[0];
}

/** Captures the status thrown by SvelteKit's `error()`. */
async function status_of(event: Parameters<typeof GET>[0]): Promise<number> {
    try {
        const res = await GET(event);
        return res.status;
    } catch (thrown) {
        if (
            typeof thrown === 'object' &&
            thrown !== null &&
            'status' in thrown &&
            typeof thrown.status === 'number'
        ) {
            return thrown.status;
        }
        return 500;
    }
}

function html_response(body: string, url = 'https://example.com/') {
    const res = new Response(body, {
        status: 200,
        headers: {
            'content-type': 'text/html; charset=utf-8',
            'x-frame-options': 'DENY',
            'content-security-policy': "default-src 'none'",
            'set-cookie': 'a=b',
            'x-custom': 'keep-me',
        },
    });
    Object.defineProperty(res, 'url', { value: url });
    return res;
}

beforeEach(() => {
    pinned.mockImplementation(() =>
        Promise.resolve(html_response('<html><head></head></html>')),
    );
});

describe('/api/browse origin gating', () => {
    it('serves a same-origin request (the iframe case: no Origin, no Referer)', async () => {
        const res = await GET(make_event('https://example.com/'));
        expect(res.status).toBe(200);
    });

    it('accepts an allowed Origin when fetch metadata is absent', async () => {
        const res = await GET(
            make_event('https://example.com/', {
                fetch_site: null,
                origin: APP,
            }),
        );
        expect(res.status).toBe(200);
    });

    // `none` is what a browser sends for a typed address or a bookmark. It is
    // also one curl header, and accepting it re-opened the relay — caught by
    // probing a real deploy, where every other spoof was refused and this one
    // returned 200.
    it('REFUSES sec-fetch-site: none, which curl sets for free', () => {
        return expect(
            status_of(
                make_event('https://example.com/', {
                    fetch_site: 'none',
                    origin: null,
                }),
            ),
        ).resolves.toBe(403);
    });

    it('REFUSES a forged Referer — it is not a proof of origin', () => {
        // `curl -H 'Referer: <our app>'` used to be accepted, which made this
        // an anonymising relay billed to us and gave every SSRF finding a
        // zero-victim path. Sec-Fetch-Site and Origin are browser-set; Referer
        // is not.
        return expect(
            status_of(
                make_event('https://example.com/', {
                    fetch_site: null,
                    origin: null,
                    referer: APP + '/xp',
                }),
            ),
        ).resolves.toBe(403);
    });

    it('refuses to act as an open relay', async () => {
        expect(
            await status_of(
                make_event('https://example.com/', {
                    fetch_site: 'cross-site',
                    origin: 'https://evil.example',
                }),
            ),
        ).toBe(403);
        expect(
            await status_of(
                make_event('https://example.com/', { fetch_site: null }),
            ),
        ).toBe(403);
    });
});

describe('/api/browse url validation', () => {
    it('rejects a missing url', async () => {
        expect(await status_of(make_event(null))).toBe(400);
    });

    it('rejects SSRF targets before making any request', async () => {
        const spy = vi.fn();
        pinned.mockImplementation(spy);
        expect(
            await status_of(make_event('http://169.254.169.254/latest/')),
        ).toBe(400);
        expect(await status_of(make_event('http://127.0.0.1/'))).toBe(400);
        expect(await status_of(make_event('file:///etc/passwd'))).toBe(400);
        expect(spy).not.toHaveBeenCalled();
    });
});

describe('/api/browse response handling', () => {
    it('injects the base tag and the reporter', async () => {
        const res = await GET(make_event('https://example.com/'));
        const body = await res.text();
        expect(body).toContain('<base href="https://example.com/"');
        expect(body).toContain('__momadxp');
    });

    it('reports where the user LANDED after a redirect', async () => {
        // a real 302 chain: redirects are followed BY HAND now, so each hop
        // can be re-validated before it is touched
        const spy = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(null, {
                    status: 302,
                    headers: { location: 'https://example.com/final' },
                }),
            )
            .mockResolvedValueOnce(
                html_response(
                    '<html><head></head></html>',
                    'https://example.com/final',
                ),
            );
        pinned.mockImplementation(spy);
        const body = await (
            await GET(make_event('https://example.com/start'))
        ).text();
        expect(spy).toHaveBeenCalledTimes(2);
        expect(body).toContain('https://example.com/final');
    });

    // The connection is PINNED to the address the guard verified, so a
    // short-TTL DNS answer cannot move the socket between the check and the
    // connect. Nothing behavioural can observe that with a mocked transport —
    // it has to be asserted on the call.
    it('pins the connection to the address the guard verified', async () => {
        lookup_result.mockResolvedValueOnce([
            { address: '203.0.113.10', family: 4 },
        ]);
        const spy = vi
            .fn()
            .mockResolvedValue(html_response('<html><head></head></html>'));
        pinned.mockImplementation(spy);
        await GET(make_event('https://example.com/'));
        expect(spy).toHaveBeenCalledWith(
            expect.objectContaining({
                url: 'https://example.com/',
                address: '203.0.113.10',
                family: 4,
            }),
        );
    });

    it('REFUSES a redirect into a private address', async () => {
        // the whole point: check_browse_url validated only the string the
        // caller supplied, so a 302 walked past every rule in url_guard
        const spy = vi.fn().mockResolvedValueOnce(
            new Response(null, {
                status: 302,
                headers: {
                    location: 'http://169.254.169.254/latest/meta-data/',
                },
            }),
        );
        pinned.mockImplementation(spy);
        expect(await status_of(make_event('https://example.com/start'))).toBe(
            502,
        );
        expect(spy).toHaveBeenCalledTimes(1); // never connected to the target
    });

    it('REFUSES a hostname that resolves to a private address', async () => {
        lookup_result.mockResolvedValueOnce([
            { address: '169.254.169.254', family: 4 },
        ]);
        const spy = vi.fn();
        pinned.mockImplementation(spy);
        expect(await status_of(make_event('https://ssrf.attacker.tld/'))).toBe(
            400,
        );
        expect(spy).not.toHaveBeenCalled(); // no connection at all
    });

    // The CDN keys on the URL alone unless told otherwise, so a copy fetched
    // by an authorised request was served to one that would have been refused.
    it('varies on the headers the origin gate reads, so a cache cannot bypass it', async () => {
        const res = await GET(make_event('https://example.com/'));
        const vary = res.headers.get('vary') ?? '';
        expect(vary).toContain('Sec-Fetch-Site');
        expect(vary).toContain('Origin');
    });

    it('varies on the raw=1 response too', async () => {
        const res = await GET(
            make_event('https://example.com/', { raw: true }),
        );
        expect(res.headers.get('vary')).toContain('Sec-Fetch-Site');
    });

    it('forwards only the allowlisted headers', async () => {
        const res = await GET(make_event('https://example.com/'));
        // an ALLOWLIST now: a denylist let clear-site-data through onto our
        // own origin, which would wipe localStorage and the whole VFS
        expect(res.headers.get('x-frame-options')).toBeNull();
        expect(res.headers.get('content-security-policy')).toBeNull();
        expect(res.headers.get('set-cookie')).toBeNull();
        expect(res.headers.get('x-custom')).toBeNull();
        expect(res.headers.get('content-type')).toContain('text/html');
    });

    it('sends non-HTML straight to the origin instead of streaming it', async () => {
        const res_obj = new Response('binary', {
            status: 200,
            headers: { 'content-type': 'image/png' },
        });
        Object.defineProperty(res_obj, 'url', {
            value: 'https://example.com/a.png',
        });
        pinned.mockImplementation(() => Promise.resolve(res_obj));
        const res = await GET(make_event('https://example.com/a.png'));
        // an interstitial, NOT a 302: redirecting to any URL made this an open
        // redirect on our own domain and gave a clean signal for probing which
        // hosts answer. The user still gets there, but by clicking.
        expect(res.status).toBe(200);
        expect(res.headers.get('location')).toBeNull();
        const page = await res.text();
        expect(page).toContain('https://example.com/a.png');
        expect(page).toContain('not a web page');
    });

    // raw=1 backs IE's View Source
    it('raw mode returns the ORIGINAL markup, not the rewritten copy', async () => {
        const original =
            '<html><head><title>t</title></head><body>hi</body></html>';
        pinned.mockImplementation(() =>
            Promise.resolve(html_response(original)),
        );
        const res = await GET(
            make_event('https://example.com/', { raw: true }),
        );
        const body = await res.text();
        expect(body).toBe(original);
        expect(body).not.toContain('__momadxp');
        expect(body).not.toContain('<base');
        // served as text so it is displayed, never executed
        expect(res.headers.get('content-type')).toContain('text/plain');
        expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    });

    it('reports upstream failure as a gateway error', async () => {
        // pinned_fetch returns null on any transport failure rather than
        // throwing — a proxy that cannot reach a site has nothing useful to
        // say about why
        pinned.mockImplementation(() => Promise.resolve(null));
        expect(await status_of(make_event('https://example.com/'))).toBe(502);
    });

    it('refuses oversized documents', async () => {
        const big = '<html>' + 'x'.repeat(3_100_000);
        pinned.mockImplementation(() => Promise.resolve(html_response(big)));
        expect(await status_of(make_event('https://example.com/'))).toBe(413);
    });

    it('hands the transport nothing but the url, the pin and a timeout', async () => {
        // credentials cannot be forwarded because the endpoint never supplies
        // any headers at all — pinned_fetch owns them, and its own test pins
        // the honest User-Agent and the absence of cookies
        const spy = vi
            .fn()
            .mockResolvedValue(html_response('<html><head></head></html>'));
        pinned.mockImplementation(spy);
        await GET(make_event('https://example.com/'));
        const req: unknown = spy.mock.calls[0]?.[0];
        expect(Object.keys(req ?? {}).sort()).toEqual([
            'address',
            'family',
            'timeout_ms',
            'url',
        ]);
    });
});

describe('/api/browse rate limiting', () => {
    it('eventually throttles a single hammering client', async () => {
        const ip = '203.0.113.9';
        let limited = false;
        for (let i = 0; i < 400; i++) {
            if (
                (await status_of(
                    make_event('https://example.com/', { ip }),
                )) === 429
            ) {
                limited = true;
                break;
            }
        }
        expect(limited).toBe(true);
    });
});

/**
 * wiby's "surprise me" is a 200 whose BODY meta-refreshes to a random page, so
 * `fetch(redirect: 'follow')` sees no redirect and the proxy used to serve the
 * interstitial — the frame moved on by itself while the address bar stayed on
 * https://wiby.me/surprise/.
 */
describe('/api/browse follows an instant meta refresh', () => {
    function refresh_page(to: string) {
        return html_response(
            `<html><head><meta http-equiv="refresh" content="0; URL=${to}"/></head><body>You asked for it!</body></html>`,
            'https://wiby.me/surprise/',
        );
    }

    it('serves the page the refresh points at, and reports it as the landing url', async () => {
        const spy = vi
            .fn()
            .mockResolvedValueOnce(refresh_page('https://random.example/page'))
            .mockResolvedValueOnce(
                html_response(
                    '<html><head></head><body>RANDOM</body></html>',
                    'https://random.example/page',
                ),
            );
        pinned.mockImplementation(spy);

        const res = await GET(make_event('https://wiby.me/surprise/'));
        const body = await res.text();

        expect(spy).toHaveBeenCalledTimes(2);
        expect(body).toContain('RANDOM');
        expect(body).not.toContain('You asked for it!');
        // CUR is where we landed, REQ is what the user asked for — the parent
        // needs both to treat this as a redirect of the CURRENT entry rather
        // than a new step (src/lib/nav_history.ts)
        expect(body).toContain('var CUR="https://random.example/page"');
        expect(body).toContain('var REQ="https://wiby.me/surprise/"');
    });

    it('re-validates each hop, so a refresh cannot point at the metadata service', async () => {
        const spy = vi
            .fn()
            .mockResolvedValueOnce(refresh_page('http://169.254.169.254/'));
        pinned.mockImplementation(spy);

        const res = await GET(make_event('https://wiby.me/surprise/'));
        const body = await res.text();

        // the hop is refused and the interstitial is served as-is; SSRF guards
        // apply to a url a PAGE hands us exactly as they do to a typed one
        expect(spy).toHaveBeenCalledTimes(1);
        expect(body).toContain('You asked for it!');
    });

    it('stops after the hop budget rather than chasing a refresh loop', async () => {
        // a FRESH Response per call: a body can only be read once
        const spy = vi
            .fn()
            .mockImplementation(() =>
                Promise.resolve(refresh_page('https://loop.example/next')),
            );
        pinned.mockImplementation(spy);

        await GET(make_event('https://wiby.me/surprise/'));
        // the first fetch plus MAX_META_REFRESH_HOPS, and no more
        expect(spy).toHaveBeenCalledTimes(4);
    });

    it('leaves a DELAYED refresh alone — that page is meant to be read', async () => {
        const spy = vi
            .fn()
            .mockImplementation(() =>
                Promise.resolve(
                    html_response(
                        '<html><head><meta http-equiv="refresh" content="5; URL=https://random.example/"/></head><body>hold on</body></html>',
                        'https://slow.example/',
                    ),
                ),
            );
        pinned.mockImplementation(spy);

        const res = await GET(make_event('https://slow.example/'));
        expect(spy).toHaveBeenCalledTimes(1);
        expect(await res.text()).toContain('hold on');
    });
});
