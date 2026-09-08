import { describe, expect, it } from 'vitest';
import { is_allowed_origin } from './origin';
import { SITE_URL, netlify_origin } from '../../site';

describe('is_allowed_origin', () => {
    it('allows the Netlify origin as well as the canonical one', () => {
        // They are the same string today. Once a custom domain is attached
        // they diverge and Netlify keeps serving <site>.netlify.app, so a
        // visitor arriving by the old URL must not have their contact form
        // silently rejected.
        expect(is_allowed_origin(SITE_URL)).toBe(true);
        expect(is_allowed_origin(netlify_origin())).toBe(true);
    });

    it('allows production, deploy previews, and local dev', () => {
        for (const origin of [
            'https://momad-xp.netlify.app',
            'https://deploy-preview-123--momad-xp.netlify.app',
            'https://feature-branch--momad-xp.netlify.app',
            'http://localhost:4173',
            'http://localhost:3000',
            'http://127.0.0.1:8888',
        ]) {
            expect(is_allowed_origin(origin), origin).toBe(true);
        }
    });

    it('denies everything else', () => {
        for (const origin of [
            null,
            '',
            'https://evil.com',
            'https://momad-xp.netlify.app.evil.com',
            'https://xx--other-site.netlify.app',
            'http://momad-xp.netlify.app',
            'https://sub.momad-xp.netlify.app',
        ]) {
            expect(is_allowed_origin(origin), String(origin)).toBe(false);
        }
    });
});
