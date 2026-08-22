import { describe, it, expect } from 'vitest';
import {
    should_strip_header,
    strip_csp_meta,
    strip_base,
    base_tag,
    meta_refresh_target,
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

    // The parent cannot tell a redirect of the page it asked for from a stale
    // message sent by a page the user has already left — unless the frame says
    // which URL was REQUESTED. Without it, Back was unusable on any
    // redirecting site.
    it('announces the requested url alongside where it landed', () => {
        const out = reporter_script(
            'https://www.e.com/final',
            'https://e.com/asked',
        );
        expect(out).toContain('"https://www.e.com/final"');
        expect(out).toContain('"https://e.com/asked"');
        expect(out).toContain("post('navigated',CUR,REQ)");
        expect(out).toContain('requested:requested');
    });

    it('defaults the requested url to the final one', () => {
        const out = reporter_script('https://e.com/only');
        expect(out).toContain('var CUR="https://e.com/only"');
        expect(out).toContain('var REQ="https://e.com/only"');
    });

    it('escapes a quote in the REQUESTED url too', () => {
        const out = reporter_script(
            'https://e.com/',
            'https://e.com/a";alert(1);//',
        );
        expect(out).toContain('\\"');
        expect(out).not.toContain('a";alert(1)');
    });
});

describe('rewrite_document', () => {
    const url = 'https://example.com/page';

    it('keeps <base> on the FINAL url but reports the requested one', () => {
        // relative subresources must resolve against where the document really
        // came from, while history has to key off what was asked for
        const out = rewrite_document(
            '<html><head></head><body></body></html>',
            'https://www.example.com/final',
            'https://example.com/asked',
        );
        expect(out).toContain('<base href="https://www.example.com/final"');
        expect(out).toContain('var REQ="https://example.com/asked"');
    });

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

describe('meta_refresh_target', () => {
    const base = 'https://wiby.me/surprise/';

    it('follows the instant refresh wiby uses for "surprise me"', () => {
        // the real body, which is a 200 — fetch(redirect:'follow') sees no
        // redirect at all, so the address bar stayed on /surprise/
        const html =
            '<html><head><meta http-equiv="refresh" content="0; URL=https://rosemaryjacobs.com/"/></head><body>You asked for it!</body></html>';
        expect(meta_refresh_target(html, base)).toBe(
            'https://rosemaryjacobs.com/',
        );
    });

    it('accepts the attribute and quoting variants authors actually write', () => {
        expect(
            meta_refresh_target(
                `<meta content='0;url=/next' http-equiv='refresh'>`,
                base,
            ),
        ).toBe('https://wiby.me/next');
        expect(
            meta_refresh_target(
                '<META HTTP-EQUIV="REFRESH" CONTENT="0 ; Url = page.html">',
                base,
            ),
        ).toBe('https://wiby.me/surprise/page.html');
    });

    it('leaves a DELAYED refresh alone — that page is meant to be read', () => {
        const html =
            '<meta http-equiv="refresh" content="5; url=https://e.com/">';
        expect(meta_refresh_target(html, base)).toBeNull();
    });

    it('ignores a refresh with no url (a plain reload)', () => {
        expect(
            meta_refresh_target(
                '<meta http-equiv="refresh" content="0">',
                base,
            ),
        ).toBeNull();
    });

    it('returns null when there is no refresh at all', () => {
        expect(meta_refresh_target('<html><body>hi</body></html>', base)).toBe(
            null,
        );
        expect(meta_refresh_target('<meta charset="utf-8">', base)).toBeNull();
    });

    it('returns null for an unparseable target rather than throwing', () => {
        expect(
            meta_refresh_target(
                '<meta http-equiv="refresh" content="0; url=http://">',
                base,
            ),
        ).toBeNull();
    });
});
