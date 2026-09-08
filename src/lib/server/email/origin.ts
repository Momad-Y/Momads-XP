/**
 * Origin allowlist for /api/email (§6.8): production, Netlify deploy
 * previews / branch deploys, and local dev/preview.
 *
 * The domain itself lives in `$lib/site` — see that file for why the canonical
 * origin and the Netlify site name are two separate values.
 */
import {
    NETLIFY_SITE,
    allowed_site_origins,
    netlify_preview_pattern,
} from '../../site';

/**
 * BOTH the canonical origin and the Netlify one.
 *
 * Today they are the same string and the Set collapses to one entry. Once a
 * custom domain is attached they diverge, and Netlify keeps serving
 * `<site>.netlify.app` — so a visitor who arrives by the old URL would
 * otherwise have their contact form rejected with no explanation.
 */
const ALLOWED_ORIGINS = new Set(allowed_site_origins());
const NETLIFY_PREVIEW_RE = netlify_preview_pattern(NETLIFY_SITE);
const LOCAL_RE = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

export function is_allowed_origin(origin: string | null): boolean {
    if (origin == null) return false;
    return (
        ALLOWED_ORIGINS.has(origin) ||
        NETLIFY_PREVIEW_RE.test(origin) ||
        LOCAL_RE.test(origin)
    );
}
