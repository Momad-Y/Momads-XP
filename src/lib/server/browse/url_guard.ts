/**
 * Guards for /api/browse. A proxy that fetches whatever URL it is handed is an
 * SSRF hole and an open relay, so every request is checked here before any
 * network call happens.
 */

/** Only real web schemes — no file:, data:, gopher:, javascript:, … */
const ALLOWED_PROTOCOLS = ['http:', 'https:'];

/**
 * Hosts that must never be fetched server-side: loopback, link-local (cloud
 * metadata lives at 169.254.169.254), and the RFC1918 private ranges. Without
 * this, `?url=http://169.254.169.254/…` would hand a caller our host's
 * credentials.
 */
const BLOCKED_HOSTNAMES = new Set([
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '::1',
    '[::1]',
    'metadata.google.internal',
]);

function is_blocked_ip(hostname: string): boolean {
    // IPv4 literal?
    const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
    if (v4 == null) return false;
    const octets = v4.slice(1).map((part) => Number(part));
    const [a, b] = octets;
    if (a == null || b == null) return true;
    if (octets.some((o) => Number.isNaN(o) || o > 255)) return true;
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 0) return true; // "this network"
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    return false;
}

export interface UrlVerdict {
    ok: boolean;
    /** Normalised absolute URL, present only when ok. */
    url?: string;
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

    const host = parsed.hostname.toLowerCase();
    if (BLOCKED_HOSTNAMES.has(host) || is_blocked_ip(host)) {
        return { ok: false, reason: 'blocked_host' };
    }
    // ".local"/".internal" mDNS + cloud-internal names
    if (host.endsWith('.local') || host.endsWith('.internal')) {
        return { ok: false, reason: 'blocked_host' };
    }

    return { ok: true, url: parsed.toString() };
}
