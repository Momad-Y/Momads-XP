import { beforeEach, describe, it, expect, vi } from 'vitest';
import { check_browse_url } from './url_guard';

describe('check_browse_url', () => {
    it('accepts ordinary http(s) pages', () => {
        expect(check_browse_url('https://wiby.me/').ok).toBe(true);
        expect(check_browse_url('http://example.com/a?b=c').ok).toBe(true);
    });

    it('normalises the URL it returns', () => {
        expect(check_browse_url('https://EXAMPLE.com').url).toBe(
            'https://example.com/',
        );
    });

    it('rejects empty and malformed input', () => {
        expect(check_browse_url(null).reason).toBe('malformed');
        expect(check_browse_url('   ').reason).toBe('malformed');
        expect(check_browse_url('not a url').reason).toBe('malformed');
    });

    it('rejects non-web schemes', () => {
        for (const bad of [
            'file:///etc/passwd',
            'data:text/html,<script>1</script>',
            'javascript:alert(1)',
            'gopher://x/',
        ]) {
            expect(check_browse_url(bad).reason).toBe('bad_protocol');
        }
    });

    // SSRF: the proxy runs server-side, so these would be fetched from inside
    // the host's network.
    it('blocks loopback and internal names', () => {
        for (const bad of [
            'http://localhost/',
            'http://127.0.0.1/',
            'http://[::1]/',
            'http://metadata.google.internal/',
            'http://printer.local/',
            'http://svc.internal/',
        ]) {
            expect(check_browse_url(bad).reason).toBe('blocked_host');
        }
    });

    it('blocks cloud metadata and private ranges', () => {
        for (const bad of [
            'http://169.254.169.254/latest/meta-data/', // AWS/GCP metadata
            'http://10.0.0.5/',
            'http://192.168.1.1/',
            'http://172.16.0.9/',
            'http://172.31.255.255/',
            'http://0.0.0.0/',
        ]) {
            expect(check_browse_url(bad).reason).toBe('blocked_host');
        }
    });

    it('does NOT block public addresses that merely look similar', () => {
        expect(check_browse_url('http://172.32.0.1/').ok).toBe(true);
        expect(check_browse_url('http://11.0.0.1/').ok).toBe(true);
        expect(check_browse_url('http://169.253.0.1/').ok).toBe(true);
    });

    it('rejects absurdly long URLs', () => {
        expect(
            check_browse_url('https://e.com/' + 'a'.repeat(3000)).reason,
        ).toBe('too_long');
    });
});

/**
 * Resolving is the half a string check cannot do: `ssrf.attacker.tld` looks
 * perfectly ordinary and can point anywhere. These cover the resolver's own
 * branches, including the one that matters most — a name with a MIX of public
 * and private answers must be refused outright, or an attacker just retries
 * until the public one is picked.
 */
describe('resolve_public_address', () => {
    const lookup = vi.fn();
    beforeEach(() => {
        lookup.mockReset();
        vi.doMock('node:dns/promises', () => ({
            default: { lookup },
            lookup,
        }));
    });

    it('returns an IP literal unchanged, with nothing to resolve', async () => {
        const { resolve_public_address } = await import('./url_guard');
        expect(await resolve_public_address('93.184.216.34')).toEqual({
            address: '93.184.216.34',
            family: 4,
        });
        expect(await resolve_public_address('[2001:4860:4860::8888]')).toEqual({
            address: '2001:4860:4860::8888',
            family: 6,
        });
    });

    it('refuses a private literal without touching DNS', async () => {
        const { resolve_public_address } = await import('./url_guard');
        expect(await resolve_public_address('[::ffff:127.0.0.1]')).toBeNull();
        expect(lookup).not.toHaveBeenCalled();
    });

    it('returns the resolved address for a public name', async () => {
        lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
        const { resolve_public_address } = await import('./url_guard');
        expect(await resolve_public_address('example.com')).toEqual({
            address: '93.184.216.34',
            family: 4,
        });
    });

    it('refuses a name that resolves internally', async () => {
        lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
        const { resolve_public_address } = await import('./url_guard');
        expect(await resolve_public_address('ssrf.attacker.tld')).toBeNull();
    });

    it('refuses a MIXED answer rather than picking the public one', async () => {
        lookup.mockResolvedValue([
            { address: '93.184.216.34', family: 4 },
            { address: '127.0.0.1', family: 4 },
        ]);
        const { resolve_public_address } = await import('./url_guard');
        expect(await resolve_public_address('mixed.attacker.tld')).toBeNull();
    });

    it('fails closed on an empty answer or a lookup error', async () => {
        lookup.mockResolvedValue([]);
        const mod = await import('./url_guard');
        expect(await mod.resolve_public_address('nothing.tld')).toBeNull();
        lookup.mockRejectedValue(new Error('ENOTFOUND'));
        expect(await mod.resolve_public_address('broken.tld')).toBeNull();
    });
});
