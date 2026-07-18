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

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
