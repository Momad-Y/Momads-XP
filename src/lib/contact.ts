/**
 * Client-side mirror of /api/email's caps/format rules (Phase 2 spec D8).
 * The 3s min-fill-time guard is deliberately server-only.
 */
import {
    MAX_FROM_LENGTH,
    MAX_MESSAGE_LENGTH,
    MAX_SUBJECT_LENGTH,
} from './server/email/validate';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ContactForm {
    from_email: string;
    subject: string;
    message: string;
}

/** Returns the first failing field's dialog message, or null when valid. */
export function validate_contact_form(form: ContactForm): string | null {
    const from = form.from_email.trim();
    if (
        from.length === 0 ||
        from.length > MAX_FROM_LENGTH ||
        !EMAIL_RE.test(from)
    ) {
        return 'Please enter a valid email address.';
    }
    const subject = form.subject.trim();
    if (subject.length === 0 || subject.length > MAX_SUBJECT_LENGTH) {
        return 'Please enter a subject.';
    }
    const message = form.message.trim();
    if (message.length === 0 || message.length > MAX_MESSAGE_LENGTH) {
        return 'Please enter a message.';
    }
    return null;
}
