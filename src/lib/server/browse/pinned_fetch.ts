/**
 * An upstream request pinned to an address we have already verified.
 *
 * Resolving a hostname and checking the answer is not enough on its own: the
 * name is resolved a SECOND time when the connection is made, and a DNS answer
 * with a very short TTL can return a public address to our check and an
 * internal one to the connection. That is classic DNS rebinding, and no amount
 * of checking the name beforehand closes it.
 *
 * `fetch` (undici) offers no hook to control that second lookup. `node:https`
 * does — `lookup` is called instead of the system resolver — so the socket can
 * be forced onto the exact address the guard approved. TLS still sees the real
 * hostname, so SNI and certificate validation are unaffected.
 */
import { Readable } from 'node:stream';
import type { LookupAddress } from 'node:dns';

export interface PinnedRequest {
    url: string;
    /** The address the guard verified; the socket may go nowhere else. */
    address: string;
    family: 4 | 6;
    timeout_ms: number;
}

/**
 * Perform the request and adapt it to a standard `Response`, so callers keep
 * working with the same shape they had under `fetch`. Redirects are NEVER
 * followed here — the caller re-validates each hop.
 *
 * Returns null on any transport failure; a proxy that cannot reach a site has
 * nothing useful to say about why.
 */
export async function pinned_fetch(
    req: PinnedRequest,
): Promise<Response | null> {
    let parsed: URL;
    try {
        parsed = new URL(req.url);
    } catch {
        return null;
    }
    const secure = parsed.protocol === 'https:';
    const mod = secure ? await import('node:https') : await import('node:http');

    return new Promise<Response | null>((resolve) => {
        let settled = false;
        const done = (value: Response | null) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        const request = mod.request(
            {
                protocol: parsed.protocol,
                hostname: parsed.hostname,
                port: parsed.port === '' ? (secure ? 443 : 80) : parsed.port,
                path: parsed.pathname + parsed.search,
                method: 'GET',
                // THE PIN: ignore the hostname and hand back only the address
                // the guard approved, so the socket cannot be redirected by a
                // second DNS answer.
                //
                // Node calls this with `{ all: true }` and then REQUIRES an
                // array; returning a bare string fails with "Invalid IP
                // address: undefined". Both shapes are handled because the
                // option is not contractually guaranteed.
                lookup: (
                    _hostname: string,
                    options: { all?: boolean } | undefined,
                    callback: (
                        err: NodeJS.ErrnoException | null,
                        address: string | LookupAddress[],
                        family?: number,
                    ) => void,
                ) => {
                    if (options?.all === true) {
                        callback(null, [
                            { address: req.address, family: req.family },
                        ]);
                        return;
                    }
                    callback(null, req.address, req.family);
                },
                headers: {
                    // Identify honestly and ask for a document. No cookies, no
                    // auth: none are added anywhere.
                    'User-Agent':
                        'Mozilla/5.0 (compatible; MomadsXP/1.0; +https://momad-xp.netlify.app)',
                    Accept: 'text/html,application/xhtml+xml,*/*;q=0.8',
                    'Accept-Language': 'en',
                    Host: parsed.host,
                },
            },
            (res) => {
                const headers = new Headers();
                for (const [key, value] of Object.entries(res.headers)) {
                    if (value == null) continue;
                    headers.set(
                        key,
                        Array.isArray(value) ? value.join(', ') : value,
                    );
                }
                // 204/304 carry no body and `Response` rejects one
                const status = res.statusCode ?? 502;
                const bodyless = status === 204 || status === 304;
                done(
                    new Response(
                        bodyless
                            ? null
                            : // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- node's ReadableStream and the DOM's are structurally the same object here but declared in separate lib files, so the conversion cannot be expressed without an assertion
                              (Readable.toWeb(
                                  res,
                              ) as unknown as ReadableStream<Uint8Array>),
                        { status, headers },
                    ),
                );
            },
        );

        request.setTimeout(req.timeout_ms, () => {
            request.destroy();
            done(null);
        });
        request.on('error', () => {
            done(null);
        });
        request.end();
    });
}
