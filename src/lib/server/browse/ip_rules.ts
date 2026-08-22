/**
 * Is an IP address safe to fetch from a server?
 *
 * Split out of `url_guard` because the guard's original check was a literal
 * hostname set plus a dotted-quad regex, which meant every IPv6 spelling of an
 * internal address walked straight through: `[::ffff:169.254.169.254]`
 * (cloud metadata), `[::ffff:127.0.0.1]:9001` (the Lambda runtime API, whose
 * /runtime/invocation/next hands over the next request), `[::]`, `[fd00::1]`,
 * `[fe80::1]`. It also missed CGNAT and trailing-dot hostnames.
 *
 * This module works on ADDRESSES, so it can be applied both to a literal in
 * the URL and to whatever DNS actually resolved to — which is the check that
 * matters, since a hostname the attacker controls can point anywhere.
 */

/** Dotted-quad → the four octets, or null if it is not one. */
function parse_ipv4(host: string): number[] | null {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (m == null) return null;
    const octets = m.slice(1).map(Number);
    if (octets.some((o) => Number.isNaN(o) || o > 255)) return null;
    return octets;
}

function is_private_ipv4(octets: number[]): boolean {
    const [a = 0, b = 0] = octets;
    if (a === 0) return true; // 0.0.0.0/8 "this network"
    if (a === 10) return true; // 10/8
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
    if (a === 192 && b === 168) return true; // 192.168/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
    if (a === 192 && b === 0) return true; // 192.0.0/24 + 192.0.2/24
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast, reserved, broadcast
    return false;
}

/** Expand an IPv6 literal to its eight 16-bit groups, or null. */
function parse_ipv6(host: string): number[] | null {
    let text = host;
    if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1);
    if (!text.includes(':')) return null;

    // an IPv4-mapped tail (::ffff:127.0.0.1) — fold it into two groups
    const tail = /:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(text);
    if (tail?.[1] != null) {
        const v4 = parse_ipv4(tail[1]);
        if (v4 == null) return null;
        const [a = 0, b = 0, c = 0, d = 0] = v4;
        text =
            text.slice(0, tail.index + 1) +
            ((a << 8) | b).toString(16) +
            ':' +
            ((c << 8) | d).toString(16);
    }

    const halves = text.split('::');
    if (halves.length > 2) return null;
    const to_groups = (part: string): number[] | null => {
        if (part === '') return [];
        const out: number[] = [];
        for (const piece of part.split(':')) {
            if (!/^[0-9a-fA-F]{1,4}$/.test(piece)) return null;
            out.push(Number.parseInt(piece, 16));
        }
        return out;
    };

    const head = to_groups(halves[0] ?? '');
    if (head == null) return null;
    if (halves.length === 1) return head.length === 8 ? head : null;

    const rest = to_groups(halves[1] ?? '');
    if (rest == null) return null;
    const gap = 8 - head.length - rest.length;
    if (gap < 0) return null;
    return [...head, ...Array<number>(gap).fill(0), ...rest];
}

function is_private_ipv6(groups: number[]): boolean {
    const [g0 = 0, g1 = 0] = groups;
    const all_zero = groups.every((g) => g === 0);
    if (all_zero) return true; // ::  (unspecified — routes to loopback)
    if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) {
        return true; // ::1 loopback
    }
    // IPv4-mapped (::ffff:0:0/96) and IPv4-compatible — judge the v4 inside
    const v4_mapped =
        groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff;
    if (v4_mapped) {
        const a = groups[6] ?? 0;
        const b = groups[7] ?? 0;
        return is_private_ipv4([a >> 8, a & 0xff, b >> 8, b & 0xff]);
    }
    if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
    if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
    if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast
    if (g0 === 0x0064 && g1 === 0xff9b) return true; // 64:ff9b::/96 NAT64
    if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation
    return false;
}

/**
 * True when this address must never be fetched server-side. Unparseable input
 * is treated as unsafe — this is a deny gate, so "I do not understand it" has
 * to mean no.
 */
export function is_private_address(address: string): boolean {
    const host = address.trim().toLowerCase();
    if (host === '') return true;
    const v4 = parse_ipv4(host);
    if (v4 != null) return is_private_ipv4(v4);
    const v6 = parse_ipv6(host);
    if (v6 != null) return is_private_ipv6(v6);
    return false; // not an IP literal at all — the hostname rules apply
}

/** True when the string is an IP literal in either family. */
export function is_ip_literal(host: string): boolean {
    const bare = host.startsWith('[') ? host : host;
    return parse_ipv4(bare) != null || parse_ipv6(bare) != null;
}
