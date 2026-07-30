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
 * Practical email shape, aligned with what Resend accepts: an RFC-5321
 * dot-atom local part (incl. apostrophes and the other valid specials, plus
 * Unicode letters for SMTPUTF8), domain labels without leading/trailing
 * hyphens or empty segments, and a ≥2-letter TLD. Blocks the shapes Resend
 * 422s (trailing dot `a@b.com.`, bare single-char TLD `a@b.c`) while no
 * longer rejecting real people (`o'brien@…`) or IDN domains (`user@münchen.de`).
 */
export const EMAIL_RE =
    /^[\p{L}0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[\p{L}0-9!#$%&'*+/=?^_`{|}~-]+)*@[\p{L}0-9](?:[\p{L}0-9-]*[\p{L}0-9])?(?:\.[\p{L}0-9](?:[\p{L}0-9-]*[\p{L}0-9])?)*\.[\p{L}]{2,}$/u;
