/**
 * Where this site lives. THE ONLY PLACE THE DOMAIN IS WRITTEN DOWN.
 *
 * Changing to a custom domain should be one edit here, not a hunt through
 * server code. It previously appeared in three unrelated files, one of them an
 * origin allowlist — so pointing a domain at the site would have started
 * rejecting every contact-form submission with no obvious cause.
 *
 * TWO FIELDS, NOT ONE, and this is the part that is easy to get wrong.
 * `SITE_URL` is the canonical public origin and moves when a custom domain is
 * added. `NETLIFY_SITE` is the Netlify *site name*, which does NOT: deploy
 * previews are always `<something>--<site-name>.netlify.app` no matter what
 * domain is attached, and Netlify keeps serving `<site-name>.netlify.app`
 * alongside the custom one. Collapsing these into a single constant would
 * silently stop matching previews the day the domain changed.
 *
 * WHY A CONSTANT RATHER THAN AN ENV VAR. Netlify does expose `URL`, which
 * would make this zero-edit — but it is only set during Netlify builds and
 * functions, so local dev and vitest need a fallback anyway, and CLAUDE.md
 * records that vitest cannot resolve `$env/dynamic/private` without a mock at
 * every import site. One typed constant with tests beats env plumbing for a
 * value that changes once.
 *
 * Plain `src/lib`, not `$lib/server`: the server-only guard would stop any
 * client code from ever reading it, and CLAUDE.md puts shared constants here.
 */

/** Canonical public origin. No trailing slash — it is compared to `Origin`. */
export const SITE_URL = 'https://momad-xp.netlify.app';

/** The Netlify site name. Independent of any custom domain — see the header. */
export const NETLIFY_SITE = 'momad-xp';

/** Netlify site names are DNS labels; anything else is a mistake worth catching. */
const SITE_NAME = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

/**
 * Guarded because the results feed an ORIGIN ALLOWLIST. A site name carrying
 * regex metacharacters — `.` most plausibly — would widen
 * `netlify_preview_pattern` from "one site" to "any host", turning a typo into
 * an open CORS policy on `/api/email`. Validated at the boundary, per the repo
 * rules, rather than trusted because it is "our own" constant.
 */
function checked(site: string): string {
    if (!SITE_NAME.test(site)) {
        throw new Error(
            `invalid Netlify site name "${site}" — expected a DNS label ` +
                '(lowercase letters, digits and inner hyphens)',
        );
    }
    return site;
}

/** `https://momad-xp.netlify.app` — served even after a custom domain exists. */
export function netlify_origin(site: string = NETLIFY_SITE): string {
    return `https://${checked(site)}.netlify.app`;
}

/** Matches deploy previews and branch deploys of this site, and nothing else. */
export function netlify_preview_pattern(site: string = NETLIFY_SITE): RegExp {
    return new RegExp(`^https://[a-z0-9-]+--${checked(site)}\\.netlify\\.app$`);
}

/**
 * Every origin that is *this site*, deduped.
 *
 * A function taking both values rather than reading the constants, so a test
 * can exercise the case that does not exist yet: today `SITE_URL` and the
 * Netlify origin are the same string, so a test against the constants cannot
 * tell whether the second is present at all.
 */
export function allowed_site_origins(
    site_url: string = SITE_URL,
    netlify_site: string = NETLIFY_SITE,
): string[] {
    return [...new Set([site_url, netlify_origin(netlify_site)])];
}
