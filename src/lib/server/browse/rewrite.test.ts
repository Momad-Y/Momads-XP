import { describe, it, expect } from 'vitest';
import {
    should_strip_header,
    strip_csp_meta,
    strip_base,
    base_tag,
    reporter_script,
    rewrite_document,
} from './rewrite';

describe('should_strip_header', () => {
    it('strips headers that would break framing or re-impose policy', () => {
        for (const h of [
            'X-Frame-Options',
            'content-security-policy',
            'Content-Security-Policy-Report-Only',
            'set-cookie',
            'strict-transport-security',
        ]) {
            expect(should_strip_header(h)).toBe(true);
        }
    });

    it('keeps ordinary headers', () => {
        expect(should_strip_header('content-type')).toBe(false);
        expect(should_strip_header('last-modified')).toBe(false);
    });
});

describe('strip_csp_meta', () => {
    it('removes a CSP meta tag in any casing/quoting', () => {
        const html = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'">hi`;
        expect(strip_csp_meta(html)).toBe('hi');
        expect(
            strip_csp_meta(`<META HTTP-EQUIV=content-security-policy c="x">y`),
        ).toBe('y');
    });

    it('leaves other meta tags alone', () => {
        const html = '<meta charset="utf-8">';
        expect(strip_csp_meta(html)).toBe(html);
    });
});

describe('strip_base', () => {
    it('removes existing base tags that would fight ours', () => {
        expect(strip_base('<base href="/x"><p>a</p>')).toBe('<p>a</p>');
    });
});

describe('base_tag', () => {
    it('points relative assets back at the real site', () => {
        expect(base_tag('https://example.com/dir/page.html')).toBe(
            '<base href="https://example.com/dir/page.html">',
        );
    });

    it('escapes attribute-breaking characters', () => {
        expect(base_tag('https://e.com/?a=1&b=2')).toContain('&amp;');
    });

    it('returns nothing for an unparseable url', () => {
        expect(base_tag('nonsense')).toBe('');
    });
});

describe('reporter_script', () => {
    it('embeds the url safely as JSON', () => {
        expect(reporter_script('https://e.com/a')).toContain(
            '"https://e.com/a"',
        );
    });

    it('cannot be broken out of with a quote in the url', () => {
        const nasty = 'https://e.com/a";alert(1);//';
        const out = reporter_script(nasty);
        // the quote must be escaped inside the JSON string literal
        expect(out).toContain('\\"');
        expect(out).not.toContain('a";alert(1)');
    });

    it('reports on load and intercepts clicks and GET submits', () => {
        const out = reporter_script('https://e.com/');
        expect(out).toContain("post('navigated'");
        expect(out).toContain("addEventListener('click'");
        expect(out).toContain("addEventListener('submit'");
        expect(out).toContain('__momadxp');
    });
});

describe('rewrite_document', () => {
    const url = 'https://example.com/page';

    it('injects base + reporter right after <head>', () => {
        const out = rewrite_document(
            '<html><head><title>t</title></head>',
            url,
        );
        expect(out.indexOf('<base')).toBeGreaterThan(out.indexOf('<head>'));
        expect(out.indexOf('<base')).toBeLessThan(out.indexOf('<title>'));
        expect(out).toContain('__momadxp');
    });

    it('falls back to <html> when there is no head', () => {
        const out = rewrite_document('<html><body>x</body></html>', url);
        expect(out).toContain('<base');
        expect(out.indexOf('<base')).toBeLessThan(out.indexOf('<body>'));
    });

    it('still injects into a bare fragment', () => {
        expect(rewrite_document('<p>hi</p>', url)).toContain('<base');
    });

    it('drops the origin CSP meta and any existing base', () => {
        const html =
            '<html><head><base href="/old"><meta http-equiv="content-security-policy" content="x"></head>';
        const out = rewrite_document(html, url);
        expect(out).not.toContain('/old');
        expect(out).not.toContain('content-security-policy" content="x"');
        expect(out).toContain('https://example.com/page');
    });
});
