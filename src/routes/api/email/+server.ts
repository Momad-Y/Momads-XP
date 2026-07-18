/**
 * Contact-form email endpoint (SPECIFICATION.md §3.1 / §6.8, Phase 2 spec
 * D4/D5). Emits a Netlify Function via adapter-netlify because of
 * `prerender = false`; calls Resend over plain fetch (no SDK — spec D5).
 * Responses never echo input: `{ ok: true }` or `{ error: code }` only.
 */
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { profile } from '../../../lib/profile';
import {
    MAX_BODY_BYTES,
    validate_email_payload,
} from '../../../lib/server/email/validate';
import { create_rate_limiter } from '../../../lib/server/email/rate_limit';
import { is_allowed_origin } from '../../../lib/server/email/origin';
import type { RequestHandler } from './$types';

export const prerender = false;

// Module-scope: survives warm invocations, resets on cold start (§6.8 —
// best-effort by design; accepted).
const limiter = create_rate_limiter();

export const POST: RequestHandler = async (event) => {
    if (!is_allowed_origin(event.request.headers.get('origin'))) {
        return json({ error: 'forbidden_origin' }, { status: 403 });
    }

    const body = await event.request.text();
    if (body.length > MAX_BODY_BYTES) {
        return json({ error: 'payload_too_large' }, { status: 413 });
    }

    let ip = 'unknown';
    try {
        ip = event.getClientAddress();
    } catch {
        // adapter couldn't resolve an address (e.g. unit test) — shared bucket
    }
    const now = Date.now();
    if (!limiter.allow(ip, now)) {
        return json({ error: 'rate_limited' }, { status: 429 });
    }

    let raw: unknown;
    try {
        raw = JSON.parse(body);
    } catch {
        return json({ error: 'invalid_payload' }, { status: 400 });
    }
    const result = validate_email_payload(raw, now);
    if (!result.ok) {
        if (result.code === 'honeypot') {
            // Pretend success to bots; nothing is sent.
            return json({ ok: true }, { status: 202 });
        }
        return json(
            { error: result.code },
            { status: result.code === 'too_fast' ? 422 : 400 },
        );
    }

    const key = env.RESEND_API_KEY;
    if (key == null || key === '') {
        console.error('/api/email: RESEND_API_KEY not configured');
        return json({ error: 'not_configured' }, { status: 500 });
    }

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                // empty string counts as unset (Netlify env vars default to '')
                from:
                    env.EMAIL_FROM != null && env.EMAIL_FROM !== ''
                        ? env.EMAIL_FROM
                        : 'onboarding@resend.dev',
                to: [profile.meta.email],
                reply_to: result.value.from_email,
                subject: `[Momad's XP] ${result.value.subject}`,
                text: `From: ${result.value.from_email}\n\n${result.value.message}`,
            }),
        });
        if (!res.ok) {
            console.error('/api/email: resend responded', res.status);
            return json({ error: 'send_failed' }, { status: 502 });
        }
        return json({ ok: true }, { status: 202 });
    } catch (error) {
        console.error('/api/email: resend fetch failed', error);
        return json({ error: 'send_failed' }, { status: 502 });
    }
};
