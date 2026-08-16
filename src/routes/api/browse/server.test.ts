import { beforeEach, describe, expect, it, vi } from 'vitest';
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
    vi.stubGlobal(
        'fetch',
        vi.fn(() =>
            Promise.resolve(html_response('<html><head></head></html>')),
        ),
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

    it('falls back to the Referer origin', async () => {
        const res = await GET(
            make_event('https://example.com/', {
                fetch_site: null,
                referer: `${APP}/xp`,
            }),
        );
        expect(res.status).toBe(200);
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
        vi.stubGlobal('fetch', spy);
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
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve(
                    html_response(
                        '<html><head></head></html>',
                        'https://example.com/final',
                    ),
                ),
            ),
        );
        const body = await (
            await GET(make_event('https://example.com/start'))
        ).text();
        expect(body).toContain('https://example.com/final');
    });

    it('strips headers that would break framing, and keeps the rest', async () => {
        const res = await GET(make_event('https://example.com/'));
        expect(res.headers.get('x-frame-options')).toBeNull();
        expect(res.headers.get('content-security-policy')).toBeNull();
        expect(res.headers.get('set-cookie')).toBeNull();
        expect(res.headers.get('x-custom')).toBe('keep-me');
        expect(res.headers.get('x-robots-tag')).toContain('noindex');
    });

    it('sends non-HTML straight to the origin instead of streaming it', async () => {
        const res_obj = new Response('binary', {
            status: 200,
            headers: { 'content-type': 'image/png' },
        });
        Object.defineProperty(res_obj, 'url', {
            value: 'https://example.com/a.png',
        });
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.resolve(res_obj)),
        );
        const res = await GET(make_event('https://example.com/a.png'));
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('https://example.com/a.png');
    });

    // raw=1 backs IE's View Source
    it('raw mode returns the ORIGINAL markup, not the rewritten copy', async () => {
        const original =
            '<html><head><title>t</title></head><body>hi</body></html>';
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.resolve(html_response(original))),
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
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.reject(new Error('dns'))),
        );
        expect(await status_of(make_event('https://example.com/'))).toBe(502);
    });

    it('refuses oversized documents', async () => {
        const big = '<html>' + 'x'.repeat(3_100_000);
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.resolve(html_response(big))),
        );
        expect(await status_of(make_event('https://example.com/'))).toBe(413);
    });

    it('does not forward cookies or credentials upstream', async () => {
        const spy = vi.fn(
            // eslint-disable-next-line @typescript-eslint/no-unused-vars -- typed params give mock.calls a real tuple shape; values are unused
            (_input: string | URL | Request, _init?: RequestInit) =>
                Promise.resolve(html_response('<html><head></head></html>')),
        );
        vi.stubGlobal('fetch', spy);
        await GET(make_event('https://example.com/'));
        const init = spy.mock.calls[0]?.[1];
        const headers = new Headers(init?.headers);
        expect(headers.get('cookie')).toBeNull();
        expect(headers.get('authorization')).toBeNull();
        expect(headers.get('user-agent')).toContain('MomadsXP');
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
