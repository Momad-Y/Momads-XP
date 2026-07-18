/**
 * Best-effort in-memory rate limiting for /api/email (§6.8): per-IP token
 * bucket + a global daily cap (spec M6 second layer against Resend-quota
 * drain). State lives in a closure — resets on function cold starts, which
 * is accepted for a portfolio contact form.
 */
export interface RateLimiter {
    /** Per-IP token bucket — safe to call before validation. */
    allow(ip: string, now_ms: number): boolean;
    /**
     * Global daily send cap — call ONLY right before an actual Resend send
     * (gate-6 B3: spam/invalid requests must not burn the budget legit
     * senders need).
     */
    allow_send(now_ms: number): boolean;
}

interface Bucket {
    tokens: number;
    last_refill_ms: number;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

export function create_rate_limiter(opts?: {
    per_ip_per_hour?: number;
    global_per_day?: number;
}): RateLimiter {
    const per_ip = opts?.per_ip_per_hour ?? 5;
    const per_day = opts?.global_per_day ?? 50;

    const buckets = new Map<string, Bucket>();
    let day_window_start = 0;
    let day_count = 0;

    return {
        allow(ip: string, now_ms: number): boolean {
            const bucket = buckets.get(ip) ?? {
                tokens: per_ip,
                last_refill_ms: now_ms,
            };
            const refill =
                ((now_ms - bucket.last_refill_ms) / HOUR_MS) * per_ip;
            const tokens = Math.min(per_ip, bucket.tokens + refill);
            if (tokens < 1) {
                buckets.set(ip, { tokens, last_refill_ms: now_ms });
                return false;
            }
            buckets.set(ip, { tokens: tokens - 1, last_refill_ms: now_ms });
            return true;
        },
        allow_send(now_ms: number): boolean {
            if (now_ms - day_window_start >= DAY_MS) {
                day_window_start = now_ms;
                day_count = 0;
            }
            if (day_count >= per_day) return false;
            day_count += 1;
            return true;
        },
    };
}
