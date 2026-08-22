import { is_private_address } from './ip_rules';

/**
 * Guards for /api/browse. A proxy that fetches whatever URL it is handed is an
 * SSRF hole and an open relay, so every request is checked here before any
 * network call happens.
 */

/** Only real web schemes — no file:, data:, gopher:, javascript:, … */
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/**
 * Names that must never be fetched, compared with any trailing dot removed —
 * `localhost.` and `metadata.google.internal.` are the same hosts as their
 * undotted forms and both used to sail through a literal set lookup.
 */
const BLOCKED_HOSTNAMES = new Set([
    'localhost',
    'metadata.google.internal',
    'metadata.goog',
    'instance-data',
]);

/** Trailing dots are legal in DNS and mean the same host. */
function canonical_host(hostname: string): string {
    let host = hostname.toLowerCase();
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
    while (host.endsWith('.')) host = host.slice(0, -1);
    return host;
}

/**
 * The hostname rules — everything that can be decided from the URL text alone.
 * Address-shaped hosts are judged by `is_private_address`, which understands
 * both families; a NAME still has to be resolved and re-checked, because a
 * hostname the attacker controls can point anywhere (see `resolves_to_public`).
 */
function is_blocked_host(hostname: string): boolean {
    const host = canonical_host(hostname);
    if (host === '') return true;
    if (BLOCKED_HOSTNAMES.has(host)) return true;
    if (host.endsWith('.local') || host.endsWith('.internal')) return true;
    if (host.endsWith('.localhost')) return true;
    return is_private_address(host);
}

export interface UrlVerdict {
    ok: boolean;
    /** Normalised absolute URL, present only when ok. */
    url?: string;
    /** Lower-cased host with any trailing dot removed, present only when ok. */
    hostname?: string;
    reason?: 'malformed' | 'bad_protocol' | 'blocked_host' | 'too_long';
}

const MAX_URL_LENGTH = 2048;

export function check_browse_url(raw: string | null): UrlVerdict {
    if (raw == null || raw.trim() === '')
        return { ok: false, reason: 'malformed' };
    if (raw.length > MAX_URL_LENGTH) return { ok: false, reason: 'too_long' };

    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        return { ok: false, reason: 'malformed' };
    }

    if (!ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
        return { ok: false, reason: 'bad_protocol' };
    }

    if (is_blocked_host(parsed.hostname)) {
        return { ok: false, reason: 'blocked_host' };
    }

    return {
        ok: true,
        url: parsed.toString(),
        hostname: canonical_host(parsed.hostname),
    };
}

/**
 * Resolve `hostname` and confirm EVERY address it answers with is public.
 *
 * The text check above can only see what is written in the URL. A hostname the
 * attacker controls can point at anything — `?url=http://ssrf.attacker.tld/`
 * whose A record is 169.254.169.254 passed every string rule ever written. No
 * blocklist can close that; only resolving can.
 *
 * Fails CLOSED: a lookup that errors, or returns nothing, is refused.
 *
 * The returned address is then PINNED for the actual connection — see
 * pinned_fetch. Resolving alone would not be enough: the name is resolved a
 * second time when the socket is opened, and a short-TTL answer can differ
 * between the two (DNS rebinding).
 */
export interface ResolvedHost {
    address: string;
    family: 4 | 6;
}

export async function resolve_public_address(
    hostname: string,
): Promise<ResolvedHost | null> {
    const host = canonical_host(hostname);
    if (is_private_address(host)) return null;

    // already an address — nothing to resolve, and nothing to rebind
    if (host.includes(':')) return { address: host, family: 6 };
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host))
        return { address: host, family: 4 };

    try {
        const dns = await import('node:dns/promises');
        const answers = await dns.lookup(host, { all: true, verbatim: true });
        if (answers.length === 0) return null;
        // EVERY answer must be public: returning the first public one while
        // another is internal would just hand the attacker a retry.
        if (answers.some((a) => is_private_address(a.address))) return null;
        const first = answers[0];
        if (first == null) return null;
        return {
            address: first.address,
            family: first.family === 6 ? 6 : 4,
        };
    } catch {
        return null;
    }
}

/** Convenience wrapper for callers that only need the yes/no. */
export async function resolves_to_public(hostname: string): Promise<boolean> {
    return (await resolve_public_address(hostname)) != null;
}
