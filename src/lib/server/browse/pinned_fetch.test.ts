/* eslint-disable @typescript-eslint/no-unsafe-type-assertion -- this file stands in for node:http(s), whose request/response objects are large interfaces; the fakes implement only the handful of members the module touches, which cannot be expressed without assertions */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';

/**
 * The whole point of this module is the `lookup` it hands node:https — that is
 * what stops a short-TTL DNS answer moving the socket between the guard's
 * check and the connection. So the test asserts the request OPTIONS, which is
 * where the pin lives.
 */
const https_request = vi.fn();
const http_request = vi.fn();
vi.mock('node:https', () => ({
    default: { request: https_request },
    request: https_request,
}));
vi.mock('node:http', () => ({
    default: { request: http_request },
    request: http_request,
}));

const { pinned_fetch } = await import('./pinned_fetch');

/** A fake node request that answers immediately with `body`. */
function fake_transport(body: string, status = 200, headers = {}) {
    return (opts: unknown, cb: (res: unknown) => void) => {
        const req = new EventEmitter() as EventEmitter & {
            setTimeout: () => void;
            end: () => void;
            destroy: () => void;
        };
        req.setTimeout = () => undefined;
        req.destroy = () => undefined;
        req.end = () => {
            const res = Readable.from([Buffer.from(body)]) as Readable & {
                statusCode: number;
                headers: Record<string, string>;
            };
            res.statusCode = status;
            res.headers = { 'content-type': 'text/html', ...headers };
            cb(res);
        };
        return req;
    };
}

beforeEach(() => {
    https_request.mockReset();
    http_request.mockReset();
});

describe('pinned_fetch', () => {
    it('forces the socket onto the verified address, whatever DNS would say', async () => {
        https_request.mockImplementation(fake_transport('<html></html>'));
        await pinned_fetch({
            url: 'https://example.com/page',
            address: '203.0.113.10',
            family: 4,
            timeout_ms: 1000,
        });

        const opts = https_request.mock.calls[0]?.[0] as {
            lookup: (
                h: string,
                o: { all?: boolean },
                cb: (...args: unknown[]) => void,
            ) => void;
            hostname: string;
        };
        // the hostname is still sent, so SNI and certificate validation are
        // unaffected — only the address resolution is overridden
        expect(opts.hostname).toBe('example.com');

        // Node calls this with `{ all: true }` and then REQUIRES an array —
        // a bare string fails at runtime with "Invalid IP address: undefined".
        // Asserting only the simple shape passed against a broken build.
        const all_form: unknown[] = [];
        opts.lookup('example.com', { all: true }, (...args: unknown[]) => {
            all_form.push(...args);
        });
        expect(all_form).toEqual([
            null,
            [{ address: '203.0.113.10', family: 4 }],
        ]);

        const plain_form: unknown[] = [];
        opts.lookup('example.com', {}, (...args: unknown[]) => {
            plain_form.push(...args);
        });
        expect(plain_form).toEqual([null, '203.0.113.10', 4]);
    });

    it('sends an honest UA and no credentials', async () => {
        https_request.mockImplementation(fake_transport('<html></html>'));
        await pinned_fetch({
            url: 'https://example.com/',
            address: '203.0.113.10',
            family: 4,
            timeout_ms: 1000,
        });
        const opts = https_request.mock.calls[0]?.[0] as {
            headers: Record<string, string>;
        };
        expect(opts.headers['User-Agent']).toContain('MomadsXP');
        expect(opts.headers['Cookie']).toBeUndefined();
        expect(opts.headers['Authorization']).toBeUndefined();
    });

    it('uses node:http for an http url and node:https for https', async () => {
        http_request.mockImplementation(fake_transport('<html></html>'));
        await pinned_fetch({
            url: 'http://example.com/',
            address: '203.0.113.10',
            family: 4,
            timeout_ms: 1000,
        });
        expect(http_request).toHaveBeenCalled();
        expect(https_request).not.toHaveBeenCalled();
    });

    it('returns the body and status as a standard Response', async () => {
        https_request.mockImplementation(fake_transport('<b>hi</b>', 201));
        const res = await pinned_fetch({
            url: 'https://example.com/',
            address: '203.0.113.10',
            family: 4,
            timeout_ms: 1000,
        });
        expect(res?.status).toBe(201);
        expect(await res?.text()).toBe('<b>hi</b>');
    });

    it('does NOT follow redirects — the caller re-validates each hop', async () => {
        https_request.mockImplementation(
            fake_transport('', 302, { location: 'http://169.254.169.254/' }),
        );
        const res = await pinned_fetch({
            url: 'https://example.com/',
            address: '203.0.113.10',
            family: 4,
            timeout_ms: 1000,
        });
        expect(res?.status).toBe(302);
        expect(https_request).toHaveBeenCalledTimes(1);
    });

    it('returns null rather than throwing when the transport errors', async () => {
        https_request.mockImplementation(() => {
            const req = new EventEmitter() as EventEmitter & {
                setTimeout: () => void;
                end: () => void;
                destroy: () => void;
            };
            req.setTimeout = () => undefined;
            req.destroy = () => undefined;
            req.end = () => {
                req.emit('error', new Error('ECONNREFUSED'));
            };
            return req;
        });
        await expect(
            pinned_fetch({
                url: 'https://example.com/',
                address: '203.0.113.10',
                family: 4,
                timeout_ms: 1000,
            }),
        ).resolves.toBeNull();
    });

    it('returns null for a malformed url', async () => {
        await expect(
            pinned_fetch({
                url: 'not a url',
                address: '203.0.113.10',
                family: 4,
                timeout_ms: 1000,
            }),
        ).resolves.toBeNull();
    });
});
