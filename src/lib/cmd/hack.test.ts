import { describe, it, expect } from 'vitest';
import {
    BEAT_GAP_MS,
    DOT_INTERVAL_MS,
    HACK_SCRIPT,
    PROGRESS_WIDTH,
    progress_bar,
    script_duration_ms,
    step_width,
} from './hack';
import { MAX_COLS } from './format';
import { profile } from '../profile';

describe('the hack script', () => {
    it('is long enough to be a bit, not a list', () => {
        // The original was five steps of straight technobabble, which is as
        // long as one note can run before it drags. The rewrite earns its
        // length by turning partway through, so the count is load-bearing.
        expect(HACK_SCRIPT.length).toBeGreaterThanOrEqual(15);
    });

    it('fits the 72-column width every other command is sized to', () => {
        // A step that overflows wraps mid-dots and the alignment collapses.
        for (const beat of HACK_SCRIPT) {
            if (beat.kind === 'step') {
                expect(step_width(beat), beat.text).toBeLessThanOrEqual(
                    MAX_COLS,
                );
            } else if (beat.kind !== 'progress') {
                expect(beat.text.length, beat.text).toBeLessThanOrEqual(
                    MAX_COLS,
                );
            }
        }
        expect(progress_bar(PROGRESS_WIDTH).length).toBeLessThanOrEqual(
            MAX_COLS,
        );
    });

    it('gives every step visible dots and a payoff tag', () => {
        // A step with no tag just trails off, and a step with no dots has no
        // animation at all — it would appear instantly and read as a bug.
        const steps = HACK_SCRIPT.filter((b) => b.kind === 'step');
        expect(steps.length).toBeGreaterThan(0);
        for (const step of steps) {
            expect(step.dots, step.text).toBeGreaterThan(0);
            expect(step.tag.length, step.text).toBeGreaterThan(0);
        }
    });

    it('lands the joke instead of just stopping', () => {
        const text = HACK_SCRIPT.map((b) =>
            b.kind === 'progress' ? b.label : b.text,
        ).join('\n');
        expect(text).toContain('ACCESS GRANTED');
        // The payoff is the admission, not the fake breach. Without it the egg
        // is a machine bragging at a visitor.
        expect(text).toContain('Nothing was hacked');
    });

    it('carries no hardcoded personal content', () => {
        // CLAUDE.md forbids it outright, and §3.2 requires command output to
        // be sourced from JSON. The egg is the shell's voice, never Momad's.
        const text = HACK_SCRIPT.map((b) =>
            b.kind === 'progress' ? b.label : b.text,
        ).join('\n');
        expect(text).not.toContain(profile.meta.name);
        expect(text).not.toContain(profile.meta.email);
    });

    it('runs long enough to enjoy and short enough to sit through', () => {
        // Both bounds matter. A script kept as data grows one appended beat at
        // a time and no single commit looks like the one that made it tedious.
        const duration = script_duration_ms();
        expect(duration).toBeGreaterThan(6_000);
        expect(duration).toBeLessThan(15_000);
    });

    it('accounts for every beat kind when timing the script', () => {
        // Guards the reduce: a new beat kind falling through to the default
        // would be timed as a bare gap and silently under-report.
        const gaps = HACK_SCRIPT.length * BEAT_GAP_MS;
        const dots = HACK_SCRIPT.reduce(
            (n, b) => n + (b.kind === 'step' ? b.dots : 0),
            0,
        );
        expect(script_duration_ms()).toBeGreaterThan(
            gaps + dots * DOT_INTERVAL_MS,
        );
    });
});

describe('progress_bar', () => {
    it('fills from empty to full', () => {
        expect(progress_bar(0)).toContain(`[${'-'.repeat(PROGRESS_WIDTH)}]`);
        expect(progress_bar(PROGRESS_WIDTH)).toContain(
            `[${'#'.repeat(PROGRESS_WIDTH)}]`,
        );
        expect(progress_bar(0)).toContain('0%');
        expect(progress_bar(PROGRESS_WIDTH)).toContain('100%');
    });

    it('keeps a constant width so the bar does not jitter', () => {
        // The percentage grows from one digit to three as it fills; without
        // the pad the closing bracket walks left and right on every frame.
        const widths = new Set(
            Array.from(
                { length: PROGRESS_WIDTH + 1 },
                (_, i) => progress_bar(i).length,
            ),
        );
        expect(widths.size).toBe(1);
    });

    it('clamps instead of emitting a negative repeat count', () => {
        // `'-'.repeat(-1)` throws RangeError, which inside the animation loop
        // would surface as an unhandled rejection rather than a visible bug.
        expect(() => progress_bar(-5)).not.toThrow();
        expect(() => progress_bar(PROGRESS_WIDTH + 5)).not.toThrow();
        expect(progress_bar(-5)).toBe(progress_bar(0));
        expect(progress_bar(PROGRESS_WIDTH + 5)).toBe(
            progress_bar(PROGRESS_WIDTH),
        );
    });
});
