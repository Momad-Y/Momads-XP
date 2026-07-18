/**
 * Payload validation for /api/email (SPECIFICATION.md §6.8, Phase 2 spec D4).
 * Boundary validation: never trust the request body.
 */
import {
    EMAIL_RE,
    MAX_BODY_BYTES,
    MAX_FROM_LENGTH,
    MAX_MESSAGE_LENGTH,
    MAX_SUBJECT_LENGTH,
    MIN_FILL_TIME_MS,
} from '../../email_limits';

export interface EmailPayload {
    from_email: string;
    subject: string;
    message: string;
    /** Honeypot — must be empty for humans. */
    website: string;
    /** Client timestamp (ms) when the form was opened. */
    opened_at: number;
}

export type ValidationResult =
    | { ok: true; value: EmailPayload }
    | { ok: false; code: 'invalid_payload' | 'honeypot' | 'too_fast' };

export {
    MAX_BODY_BYTES,
    MAX_FROM_LENGTH,
    MAX_MESSAGE_LENGTH,
    MAX_SUBJECT_LENGTH,
    MIN_FILL_TIME_MS,
};

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

export function validate_email_payload(
    raw: unknown,
    now_ms: number,
): ValidationResult {
    if (!is_record(raw)) return { ok: false, code: 'invalid_payload' };

    const { from_email, subject, message, website, opened_at } = raw;
    if (
        typeof from_email !== 'string' ||
        typeof subject !== 'string' ||
        typeof message !== 'string' ||
        typeof website !== 'string' ||
        typeof opened_at !== 'number'
    ) {
        return { ok: false, code: 'invalid_payload' };
    }

    if (website !== '') return { ok: false, code: 'honeypot' };
    if (now_ms - opened_at < MIN_FILL_TIME_MS) {
        return { ok: false, code: 'too_fast' };
    }

    const trimmed_from = from_email.trim();
    const trimmed_subject = subject.trim();
    const trimmed_message = message.trim();

    if (
        trimmed_from.length === 0 ||
        trimmed_from.length > MAX_FROM_LENGTH ||
        !EMAIL_RE.test(trimmed_from) ||
        trimmed_subject.length === 0 ||
        trimmed_subject.length > MAX_SUBJECT_LENGTH ||
        trimmed_message.length === 0 ||
        trimmed_message.length > MAX_MESSAGE_LENGTH
    ) {
        return { ok: false, code: 'invalid_payload' };
    }

    return {
        ok: true,
        value: {
            from_email: trimmed_from,
            subject: trimmed_subject,
            message: trimmed_message,
            website,
            opened_at,
        },
    };
}
