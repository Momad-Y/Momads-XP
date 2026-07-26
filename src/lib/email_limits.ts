/**
 * Caps/format rules shared by the /api/email server validator and the
 * client-side contact-form mirror. Client-safe: SvelteKit's server-only
 * guard forbids importing $lib/server/* into browser code, so these
 * constants live outside it.
 */
export const MAX_BODY_BYTES = 32_768;
export const MAX_FROM_LENGTH = 254;
export const MAX_SUBJECT_LENGTH = 200;
export const MAX_MESSAGE_LENGTH = 5000;
export const MIN_FILL_TIME_MS = 3000;

/**
 * Practical email shape, aligned with what Resend accepts: dot-atom local
 * part, domain labels without leading/trailing hyphens or empty segments,
 * alphabetic TLD. The old permissive `[^\s@]` pattern let through addresses
 * like `a@b.com.` that Resend 422s after our validation passed.
 */
export const EMAIL_RE =
    /^[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/;
