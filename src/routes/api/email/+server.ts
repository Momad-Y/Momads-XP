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

/**
 * SvelteKit's generated env types claim `string` when a local .env declares
 * the key but `string | undefined` in CI — this boundary keeps the runtime
 * guards honest (and lint quiet) in both worlds.
 */
function optional_env(value: string | undefined): string | undefined {
    return value;
}

/** Sender address; empty/unset falls back to Resend's sandbox sender. */
function email_from(): string {
    const configured = optional_env(env.EMAIL_FROM);
    return configured != null && configured !== ''
        ? configured
        : 'onboarding@resend.dev';
}

export const POST: RequestHandler = async (event) => {
    // §6.8 "Origin/Referer": privacy browsers strip Origin — fall back to
    // the Referer's origin before rejecting (gate-6 L4).
    let origin = event.request.headers.get('origin');
    const referer = event.request.headers.get('referer');
    if (origin == null && referer != null) {
        try {
            origin = new URL(referer).origin;
        } catch {
            // unparseable referer — treated as absent
        }
    }
    if (!is_allowed_origin(origin)) {
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

    const key = optional_env(env.RESEND_API_KEY);
    if (key == null || key === '') {
        console.error('/api/email: RESEND_API_KEY not configured');
        return json({ error: 'not_configured' }, { status: 500 });
    }

    // Global daily cap consumed only by real sends (gate-6 B3).
    if (!limiter.allow_send(now)) {
        return json({ error: 'rate_limited' }, { status: 429 });
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
                from: email_from(),
                // Resend's sandbox compares the recipient against the
                // account email CASE-SENSITIVELY — normalize (verified via
                // API log: 403 for Mohamed.Y.… vs account mohamed.y.…).
                to: [profile.meta.email.toLowerCase()],
                reply_to: result.value.from_email,
                subject: `[Momad's XP] ${result.value.subject}`,
                text: `From: ${result.value.from_email}\n\n${result.value.message}`,
            }),
        });
        if (!res.ok) {
            // Log Resend's error body server-side (never echoed to the client),
            // but redact email-shaped substrings first — Resend's errors echo
            // the account owner's and the visitor's addresses, and these logs
            // are retained third-party PII otherwise (red-team #16).
            const detail = await res.text().catch(() => '(unreadable)');
            const redacted = detail
                .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, '[email]')
                .slice(0, 500);
            console.error('/api/email: resend responded', res.status, redacted);
            return json({ error: 'send_failed' }, { status: 502 });
        }
        return json({ ok: true }, { status: 202 });
    } catch (error) {
        console.error('/api/email: resend fetch failed', error);
        return json({ error: 'send_failed' }, { status: 502 });
    }
};
