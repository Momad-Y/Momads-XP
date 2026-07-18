import { beforeEach, describe, expect, it, vi } from 'vitest';

// CRITICAL (plan red-team C1): vitest cannot resolve SvelteKit's $env
// virtual modules — mock before importing the handler.
const mock_env = vi.hoisted(() => {
    const env: { RESEND_API_KEY?: string; EMAIL_FROM?: string } = {
        RESEND_API_KEY: 'test-key',
        EMAIL_FROM: '',
    };
    return { env };
});
vi.mock('$env/dynamic/private', () => mock_env);

import { POST } from './+server';
import { MIN_FILL_TIME_MS } from '../../../lib/server/email/validate';
import { profile } from '../../../lib/profile';

const ORIGIN = 'https://momad-xp.netlify.app';

function payload(over?: Record<string, unknown>): string {
    return JSON.stringify({
        from_email: 'visitor@example.com',
        subject: 'Hello',
        message: 'Great site!',
        website: '',
        opened_at: Date.now() - MIN_FILL_TIME_MS - 1000,
        ...over,
    });
}

let ip_counter = 0;

function make_event(body: string, origin: string | null, ip?: string) {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (origin != null) headers.set('origin', origin);
    const event_shape = {
        request: new Request('https://momad-xp.netlify.app/api/email', {
            method: 'POST',
            headers,
            body,
        }),
        getClientAddress: () => ip ?? `10.0.0.${String(++ip_counter)}`,
    };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- unit test constructs only the fields POST reads
    return event_shape as unknown as Parameters<typeof POST>[0];
}

const ok_fetch = () =>
    vi.fn(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars -- typed params give mock.calls a real tuple shape; values are unused
        (_input: string | URL | Request, _init?: RequestInit) =>
            Promise.resolve(new Response('{"id":"1"}', { status: 200 })),
    );

beforeEach(() => {
    mock_env.env.RESEND_API_KEY = 'test-key';
    mock_env.env.EMAIL_FROM = '';
    vi.stubGlobal('fetch', ok_fetch());
});

describe('POST /api/email', () => {
    it('403s a foreign or missing origin', async () => {
        for (const origin of ['https://evil.com', null]) {
            const res = await POST(make_event(payload(), origin));
            expect(res.status).toBe(403);
        }
    });

    it('413s an oversized body', async () => {
        const res = await POST(make_event('x'.repeat(40_000), ORIGIN));
        expect(res.status).toBe(413);
    });

    it('400s malformed JSON', async () => {
        const res = await POST(make_event('{nope', ORIGIN));
        expect(res.status).toBe(400);
    });

    it('202s a honeypot hit WITHOUT calling Resend', async () => {
        const fetch_spy = ok_fetch();
        vi.stubGlobal('fetch', fetch_spy);
        const res = await POST(
            make_event(payload({ website: 'spam' }), ORIGIN),
        );
        expect(res.status).toBe(202);
        expect(fetch_spy).not.toHaveBeenCalled();
    });

    it('422s a too-fast submission', async () => {
        const res = await POST(
            make_event(payload({ opened_at: Date.now() }), ORIGIN),
        );
        expect(res.status).toBe(422);
    });

    it('429s the 6th call from one IP', async () => {
        let last = 0;
        for (let i = 0; i < 6; i++) {
            const res = await POST(make_event(payload(), ORIGIN, '6.6.6.6'));
            last = res.status;
        }
        expect(last).toBe(429);
    });

    it('500s when the API key is not configured', async () => {
        mock_env.env.RESEND_API_KEY = '';
        const res = await POST(make_event(payload(), ORIGIN));
        expect(res.status).toBe(500);
        expect(await res.json()).toEqual({ error: 'not_configured' });
    });

    it('202s the happy path with the correct Resend payload', async () => {
        const fetch_spy = ok_fetch();
        vi.stubGlobal('fetch', fetch_spy);
        const res = await POST(make_event(payload(), ORIGIN));
        expect(res.status).toBe(202);
        expect(await res.json()).toEqual({ ok: true });

        expect(fetch_spy).toHaveBeenCalledOnce();
        const call = fetch_spy.mock.calls[0];
        if (call == null) throw new Error('fetch not called');
        const [url, init] = call;
        expect(url).toBe('https://api.resend.com/emails');
        if (typeof init?.body !== 'string') throw new Error('no string body');
        const sent: unknown = JSON.parse(init.body);
        expect(sent).toMatchObject({
            from: 'onboarding@resend.dev',
            to: [profile.meta.email],
            reply_to: 'visitor@example.com',
            subject: "[Momad's XP] Hello",
        });
    });

    it('502s when Resend fails or the fetch rejects', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.resolve(new Response('{}', { status: 500 }))),
        );
        const res1 = await POST(make_event(payload(), ORIGIN));
        expect(res1.status).toBe(502);

        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.reject(new Error('network'))),
        );
        const res2 = await POST(make_event(payload(), ORIGIN));
        expect(res2.status).toBe(502);
    });
});
