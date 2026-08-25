import { describe, it, expect, vi } from 'vitest';
import {
    bar_heights,
    clamp_volume,
    create_source_cache,
    effective_volume,
    next_index,
    prev_index,
    progress_ratio,
    seek_target,
} from './player';

describe('track navigation', () => {
    it('wraps forward past the last track', () => {
        expect(next_index(2, 3)).toBe(0);
        expect(next_index(0, 3)).toBe(1);
    });

    it('wraps backward past the first track', () => {
        expect(prev_index(0, 3)).toBe(2);
        expect(prev_index(2, 3)).toBe(1);
    });

    it('is 0 for an empty playlist rather than NaN', () => {
        // `%` on length 0 yields NaN, which would set audio.src to
        // "undefined" and silently 404.
        expect(next_index(0, 0)).toBe(0);
        expect(prev_index(0, 0)).toBe(0);
    });
});

describe('volume', () => {
    it('clamps to 0..1', () => {
        // Assigning outside this range throws on HTMLMediaElement.volume.
        expect(clamp_volume(-1)).toBe(0);
        expect(clamp_volume(2)).toBe(1);
        expect(clamp_volume(0.5)).toBe(0.5);
    });

    it('is 0 for NaN', () => {
        expect(clamp_volume(Number.NaN)).toBe(0);
    });

    it('multiplies the app slider by the system tray volume', () => {
        // The rule the inherited Media Player Classic already follows; the
        // tray control is a shipped surface.
        expect(effective_volume(0.5, 0.5)).toBe(0.25);
        expect(effective_volume(1, 0)).toBe(0);
    });

    it('clamps both inputs before multiplying', () => {
        expect(effective_volume(5, 0.5)).toBe(0.5);
    });
});

describe('progress and seeking', () => {
    it('is 0 while duration is still NaN', () => {
        // `audio.duration` is NaN until metadata loads — the state the player
        // renders in first.
        expect(progress_ratio(10, Number.NaN)).toBe(0);
        expect(progress_ratio(10, 0)).toBe(0);
    });

    it('never exceeds 1', () => {
        expect(progress_ratio(50, 40)).toBe(1);
    });

    it('maps a click ratio onto a time', () => {
        expect(seek_target(0.5, 40)).toBe(20);
        expect(seek_target(0, 40)).toBe(0);
        expect(seek_target(1, 40)).toBe(40);
    });

    it('clamps an out-of-range ratio and survives an unknown duration', () => {
        expect(seek_target(2, 40)).toBe(40);
        expect(seek_target(-1, 40)).toBe(0);
        expect(seek_target(0.5, Number.NaN)).toBe(0);
    });
});

describe('create_source_cache', () => {
    it('returns the SAME node for the same element', () => {
        // createMediaElementSource() is a permanent one-shot binding on the
        // element: a second call throws InvalidStateError even from a
        // different AudioContext. Without this cache, play -> pause -> play
        // throws.
        const factory = vi.fn((el: object) => ({ for: el }));
        const get = create_source_cache(factory);
        const element = {};
        const first = get(element);
        const second = get(element);
        expect(second).toBe(first);
        expect(factory).toHaveBeenCalledTimes(1);
    });

    it('returns distinct nodes for distinct elements', () => {
        const factory = vi.fn((el: object) => ({ for: el }));
        const get = create_source_cache(factory);
        const a = get({});
        const b = get({});
        expect(a).not.toBe(b);
        expect(factory).toHaveBeenCalledTimes(2);
    });
});

describe('bar_heights', () => {
    it('produces the requested number of bars', () => {
        const data = new Uint8Array(256).fill(128);
        expect(bar_heights(data, 32)).toHaveLength(32);
    });

    it('normalises to 0..1', () => {
        const loud = bar_heights(new Uint8Array(256).fill(255), 8);
        const quiet = bar_heights(new Uint8Array(256).fill(0), 8);
        for (const v of loud) expect(v).toBeCloseTo(1);
        for (const v of quiet) expect(v).toBe(0);
    });

    it('spreads low-frequency energy across the whole display', () => {
        // The failure this fixes: an FFT's bins are LINEAR in frequency while
        // musical energy sits in the bottom few percent, so a linear mapping
        // lit ~4 bars of 28 and the widget read as dead. Log spacing must put
        // that same energy under most of the bars.
        const data = new Uint8Array(128);
        data.fill(255, 0, 12); // energy only in the lowest ~9% of bins
        const bars = bar_heights(data, 16);
        const lit = bars.filter((v) => v > 0.5).length;
        expect(lit).toBeGreaterThan(bars.length / 2);
    });

    it('gives every bar a DISTINCT, non-empty bin range', () => {
        // The old version only asserted `> 0`, so it passed while the first
        // five bars all read the same bin and moved in lockstep. A ramp makes
        // duplicates visible: distinct ranges must produce distinct averages.
        // Starts at 1, not 0: bin 0 is now genuinely read, so a zero there
        // would be a correct average rather than the duplicate-bin bug.
        const data = new Uint8Array(128);
        for (let i = 0; i < data.length; i++) data[i] = 1 + i;
        const bars = bar_heights(data, 16);
        for (const v of bars) expect(v).toBeGreaterThan(0);
        expect(new Set(bars).size).toBe(bars.length);
    });

    it('reads bin 0 — the lowest band is not skipped', () => {
        // `lo` used to start at floor(usable ** 0) === 1, so the very lowest
        // bin never contributed to any bar.
        const data = new Uint8Array(64);
        data[0] = 255; // energy ONLY in bin 0
        expect(bar_heights(data, 8)[0]).toBeGreaterThan(0);
    });

    it('is empty for no bars or no data', () => {
        expect(bar_heights(new Uint8Array(0), 8)).toEqual([]);
        expect(bar_heights(new Uint8Array(64), 0)).toEqual([]);
    });
});
