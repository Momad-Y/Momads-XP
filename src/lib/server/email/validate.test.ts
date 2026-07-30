import { describe, expect, it } from 'vitest';
import {
    MAX_FROM_LENGTH,
    MAX_MESSAGE_LENGTH,
    MAX_SUBJECT_LENGTH,
    MIN_FILL_TIME_MS,
    validate_email_payload,
} from './validate';

const NOW = 1_000_000;

const valid = {
    from_email: ' visitor@example.com ',
    subject: ' Hello ',
    message: ' Great site! ',
    website: '',
    opened_at: NOW - MIN_FILL_TIME_MS,
};

describe('validate_email_payload', () => {
    it('accepts a valid payload and returns trimmed values', () => {
        const r = validate_email_payload(valid, NOW);
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.value.from_email).toBe('visitor@example.com');
            expect(r.value.subject).toBe('Hello');
            expect(r.value.message).toBe('Great site!');
        }
    });

    it('rejects non-object and missing-field payloads', () => {
        for (const raw of [null, 'x', 42, [], {}, { ...valid, subject: 7 }]) {
            const r = validate_email_payload(raw, NOW);
            expect(r).toEqual({ ok: false, code: 'invalid_payload' });
        }
    });

    it('flags a filled honeypot', () => {
        const r = validate_email_payload({ ...valid, website: 'spam' }, NOW);
        expect(r).toEqual({ ok: false, code: 'honeypot' });
    });

    it('enforces the min fill time boundary', () => {
        const fast = {
            ...valid,
            opened_at: NOW - MIN_FILL_TIME_MS + 1,
        };
        expect(validate_email_payload(fast, NOW)).toEqual({
            ok: false,
            code: 'too_fast',
        });
        const exact = { ...valid, opened_at: NOW - MIN_FILL_TIME_MS };
        expect(validate_email_payload(exact, NOW).ok).toBe(true);
    });

    it('enforces exact length caps', () => {
        const local = 'a'.repeat(MAX_FROM_LENGTH - '@ex.co'.length);
        const at_cap = {
            ...valid,
            from_email: `${local}@ex.co`,
            subject: 's'.repeat(MAX_SUBJECT_LENGTH),
            message: 'm'.repeat(MAX_MESSAGE_LENGTH),
        };
        expect(validate_email_payload(at_cap, NOW).ok).toBe(true);
        expect(
            validate_email_payload(
                { ...valid, subject: 's'.repeat(MAX_SUBJECT_LENGTH + 1) },
                NOW,
            ),
        ).toEqual({ ok: false, code: 'invalid_payload' });
        expect(
            validate_email_payload(
                { ...valid, message: 'm'.repeat(MAX_MESSAGE_LENGTH + 1) },
                NOW,
            ),
        ).toEqual({ ok: false, code: 'invalid_payload' });
    });

    it('rejects malformed emails and empty fields', () => {
        for (const from_email of [
            'not-an-email',
            'a@b',
            'a b@c.d',
            '',
            // shapes the old permissive regex passed but Resend 422s
            'visitor@example.com.',
            'visitor@example..com',
            'a@b.c-',
            'a@-b.com',
            'a@b.c3',
            'Test@a.a', // owner's original repro: single-letter TLD
        ]) {
            expect(
                validate_email_payload({ ...valid, from_email }, NOW),
            ).toEqual({ ok: false, code: 'invalid_payload' });
        }
        expect(
            validate_email_payload({ ...valid, subject: '  ' }, NOW),
        ).toEqual({ ok: false, code: 'invalid_payload' });
        expect(validate_email_payload({ ...valid, message: '' }, NOW)).toEqual({
            ok: false,
            code: 'invalid_payload',
        });
    });

    it('accepts real addresses the strict regex must not reject', () => {
        // red-team #4: apostrophes, RFC specials, IDN, plus-tagging
        for (const from_email of [
            "o'brien@example.com",
            'müller@example.com',
            'user@münchen.de',
            'a!b@example.com',
            'user+tag@example.co.uk',
        ]) {
            expect(
                validate_email_payload({ ...valid, from_email }, NOW).ok,
                from_email,
            ).toBe(true);
        }
    });

    it('rejects CRLF injection in the subject (header safety)', () => {
        expect(
            validate_email_payload(
                { ...valid, subject: 'Hi\r\nBcc: victim@example.com' },
                NOW,
            ),
        ).toEqual({ ok: false, code: 'invalid_payload' });
    });
});
