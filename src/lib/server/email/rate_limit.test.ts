import { describe, expect, it } from 'vitest';
import { create_rate_limiter } from './rate_limit';

const HOUR = 3_600_000;

describe('create_rate_limiter', () => {
    it('allows 5 per IP then denies the 6th', () => {
        const rl = create_rate_limiter();
        for (let i = 0; i < 5; i++) {
            expect(rl.allow('1.2.3.4', 0)).toBe(true);
        }
        expect(rl.allow('1.2.3.4', 0)).toBe(false);
    });

    it('refills over time', () => {
        const rl = create_rate_limiter();
        for (let i = 0; i < 5; i++) rl.allow('1.2.3.4', 0);
        expect(rl.allow('1.2.3.4', 1000)).toBe(false);
        expect(rl.allow('1.2.3.4', HOUR)).toBe(true);
    });

    it('isolates IPs', () => {
        const rl = create_rate_limiter();
        for (let i = 0; i < 5; i++) rl.allow('1.1.1.1', 0);
        expect(rl.allow('1.1.1.1', 0)).toBe(false);
        expect(rl.allow('2.2.2.2', 0)).toBe(true);
    });

    it('trips the global daily send cap and resets next day', () => {
        const rl = create_rate_limiter({
            per_ip_per_hour: 100,
            global_per_day: 3,
        });
        expect(rl.allow_send(0)).toBe(true);
        expect(rl.allow_send(0)).toBe(true);
        expect(rl.allow_send(0)).toBe(true);
        expect(rl.allow_send(0)).toBe(false);
        expect(rl.allow_send(86_400_000)).toBe(true);
    });

    it('per-IP checks do not burn the global send budget (gate-6 B3)', () => {
        const rl = create_rate_limiter({
            per_ip_per_hour: 100,
            global_per_day: 1,
        });
        // spam-shaped traffic that never reaches a send
        for (let i = 0; i < 10; i++) rl.allow(`bot-${String(i)}`, 0);
        // the one real send still fits
        expect(rl.allow_send(0)).toBe(true);
    });
});
