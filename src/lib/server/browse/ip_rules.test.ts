import { describe, it, expect } from 'vitest';
import { is_private_address } from './ip_rules';

/**
 * The original guard parsed dotted-quad IPv4 and nothing else, so every IPv6
 * spelling of an internal address walked straight through. These are the exact
 * strings that did, reproduced from the red-team pass.
 */
describe('is_private_address — the IPv6 forms that bypassed the old guard', () => {
    it('blocks IPv4-mapped internal addresses', () => {
        // cloud metadata, and the Lambda runtime API whose
        // /runtime/invocation/next hands over the next request
        expect(is_private_address('::ffff:169.254.169.254')).toBe(true);
        expect(is_private_address('::ffff:127.0.0.1')).toBe(true);
        expect(is_private_address('[::ffff:127.0.0.1]')).toBe(true);
        expect(is_private_address('::ffff:10.0.0.1')).toBe(true);
    });

    it('blocks the unspecified and loopback addresses', () => {
        expect(is_private_address('::')).toBe(true);
        expect(is_private_address('::1')).toBe(true);
        expect(is_private_address('0:0:0:0:0:0:0:1')).toBe(true);
    });

    it('blocks unique-local, link-local and multicast v6', () => {
        expect(is_private_address('fd00::1')).toBe(true);
        expect(is_private_address('fc00::1')).toBe(true);
        expect(is_private_address('fe80::1')).toBe(true);
        expect(is_private_address('ff02::1')).toBe(true);
    });

    it('blocks NAT64', () => {
        expect(is_private_address('64:ff9b::7f00:1')).toBe(true);
    });

    it('still allows real public v6', () => {
        expect(is_private_address('2001:4860:4860::8888')).toBe(false);
        expect(is_private_address('2606:4700:4700::1111')).toBe(false);
    });
});

describe('is_private_address — IPv4', () => {
    it('blocks every private and special range', () => {
        for (const a of [
            '0.0.0.0',
            '10.1.2.3',
            '127.0.0.1',
            '169.254.169.254',
            '172.16.0.1',
            '172.31.255.255',
            '192.168.1.1',
            '100.64.0.1', // CGNAT — missed by the old guard
            '224.0.0.1',
            '255.255.255.255',
        ]) {
            expect(is_private_address(a), a).toBe(true);
        }
    });

    it('allows public v4', () => {
        for (const a of ['8.8.8.8', '93.184.216.34', '172.32.0.1', '9.9.9.9']) {
            expect(is_private_address(a), a).toBe(false);
        }
    });
});

describe('is_private_address — fails closed', () => {
    it('treats an empty or unparseable address as unsafe', () => {
        expect(is_private_address('')).toBe(true);
        expect(is_private_address('   ')).toBe(true);
    });

    it('does not mistake a hostname for an address', () => {
        // a NAME is not an address — it is judged by the hostname rules and
        // then by resolving it
        expect(is_private_address('example.com')).toBe(false);
    });
});
