import { describe, expect, it } from 'vitest';
import {
    NETLIFY_SITE,
    SITE_URL,
    allowed_site_origins,
    netlify_origin,
    netlify_preview_pattern,
} from './site';

describe('site identity', () => {
    it('has no trailing slash — it is compared against Origin headers', () => {
        expect(SITE_URL).toMatch(/^https:\/\/[^/]+$/);
    });

    it('keeps the Netlify site name separate from the canonical URL', () => {
        // They happen to agree today. The point of two fields is that a custom
        // domain moves SITE_URL and leaves NETLIFY_SITE alone.
        expect(netlify_origin()).toBe(`https://${NETLIFY_SITE}.netlify.app`);
    });
});

describe('netlify_preview_pattern', () => {
    it('matches deploy previews and branch deploys of this site', () => {
        const re = netlify_preview_pattern('momad-xp');
        expect(
            re.test('https://deploy-preview-123--momad-xp.netlify.app'),
        ).toBe(true);
        expect(re.test('https://feature-branch--momad-xp.netlify.app')).toBe(
            true,
        );
    });

    it('does not match another site, a subdomain, or plain http', () => {
        const re = netlify_preview_pattern('momad-xp');
        expect(re.test('https://xx--other-site.netlify.app')).toBe(false);
        expect(re.test('https://momad-xp.netlify.app')).toBe(false);
        expect(re.test('http://x--momad-xp.netlify.app')).toBe(false);
        expect(re.test('https://x--momad-xp.netlify.app.evil.com')).toBe(false);
    });

    it('keeps the preview label a DNS label, not a wildcard', () => {
        // loosening `[a-z0-9-]+` to `.*` lets a dotted host through
        const re = netlify_preview_pattern('momad-xp');
        expect(re.test('https://evil.com--momad-xp.netlify.app')).toBe(false);
        expect(re.test('https://a/b--momad-xp.netlify.app')).toBe(false);
    });

    it('treats the dots in netlify.app as literals', () => {
        // unescaped, `.` matches any character and this would pass
        const re = netlify_preview_pattern('momad-xp');
        expect(re.test('https://x--momad-xpXnetlifyYapp')).toBe(false);
    });

    it('still tracks the SITE NAME when the canonical domain changes', () => {
        // The reason these are two fields: previews stay on netlify.app.
        const re = netlify_preview_pattern('momad-xp');
        expect(re.test('https://deploy-preview-1--momad-xp.netlify.app')).toBe(
            true,
        );
    });
});

describe('allowed_site_origins', () => {
    it('collapses to one entry while the two agree', () => {
        expect(allowed_site_origins()).toEqual([SITE_URL]);
    });

    it('keeps the Netlify origin once a custom domain diverges', () => {
        // The case that does not exist yet, and the reason this is a function:
        // Netlify keeps serving <site>.netlify.app after a domain is attached,
        // so a visitor arriving by the old URL must still be able to send.
        expect(
            allowed_site_origins('https://momadsxp.com', 'momad-xp'),
        ).toEqual(['https://momadsxp.com', 'https://momad-xp.netlify.app']);
    });
});

describe('site name validation', () => {
    it('refuses a name that would widen the allowlist', () => {
        // These feed an ORIGIN ALLOWLIST: a `.` is a regex wildcard, so an
        // unvalidated name turns a typo into an open CORS policy on /api/email
        for (const bad of [
            '.*',
            'momad.xp',
            'a_b',
            'UPPER',
            '',
            '-lead',
            'trail-',
        ]) {
            expect(() => netlify_preview_pattern(bad), bad).toThrow(
                /invalid Netlify site name/,
            );
            expect(() => netlify_origin(bad), bad).toThrow(
                /invalid Netlify site name/,
            );
        }
    });

    it('proves the wildcard would otherwise match anything', () => {
        // guard removed, `.` matches any char — this is what is being prevented
        const unguarded = new RegExp(
            `^https://[a-z0-9-]+--momad.xp\\.netlify\\.app$`,
        );
        expect(unguarded.test('https://x--momadZxp.netlify.app')).toBe(true);
    });
});
