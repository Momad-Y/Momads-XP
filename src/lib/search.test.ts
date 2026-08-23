import { describe, it, expect } from 'vitest';
import { HOMEPAGE, SURPRISE_URL, search_url } from './search';

describe('search_url', () => {
    it('builds a wiby query', () => {
        expect(search_url('windows xp')).toBe(
            'https://wiby.me/?q=windows%20xp',
        );
    });

    it('encodes characters that would break the query string', () => {
        expect(search_url('a&b=c?d#e')).toBe(
            'https://wiby.me/?q=a%26b%3Dc%3Fd%23e',
        );
        expect(search_url('100% pure')).toBe(
            'https://wiby.me/?q=100%25%20pure',
        );
    });

    it('trims, so a stray space is not searched for', () => {
        expect(search_url('  xp  ')).toBe('https://wiby.me/?q=xp');
    });

    it('returns null for a blank query rather than a bare results page', () => {
        expect(search_url('')).toBeNull();
        expect(search_url('   ')).toBeNull();
    });
});

describe('constants', () => {
    it('home and surprise are wiby, and search agrees with them', () => {
        // the browser used to search Bing while its home page was wiby
        expect(HOMEPAGE).toBe('https://wiby.me/');
        expect(SURPRISE_URL.startsWith(HOMEPAGE)).toBe(true);
        expect(search_url('x')?.startsWith(HOMEPAGE)).toBe(true);
    });
});
