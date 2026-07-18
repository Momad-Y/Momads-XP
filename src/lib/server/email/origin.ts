/**
 * Origin allowlist for /api/email (§6.8): production, Netlify deploy
 * previews / branch deploys, and local dev/preview.
 */
const PRODUCTION_ORIGIN = 'https://momad-xp.netlify.app';
const NETLIFY_PREVIEW_RE = /^https:\/\/[a-z0-9-]+--momad-xp\.netlify\.app$/;
const LOCAL_RE = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

export function is_allowed_origin(origin: string | null): boolean {
    if (origin == null) return false;
    return (
        origin === PRODUCTION_ORIGIN ||
        NETLIFY_PREVIEW_RE.test(origin) ||
        LOCAL_RE.test(origin)
    );
}
