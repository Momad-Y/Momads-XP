/**
 * Playlist and audio-graph logic for the Music Player, kept pure so the
 * footguns below are testable without a browser.
 */

/** Next track, wrapping to the start. */
export function next_index(current: number, length: number): number {
    if (length <= 0) return 0;
    return (current + 1) % length;
}

/** Previous track, wrapping to the end. */
export function prev_index(current: number, length: number): number {
    if (length <= 0) return 0;
    return (current - 1 + length) % length;
}

/** Volume is 0..1; anything else would throw when assigned to `audio.volume`. */
export function clamp_volume(value: number): number {
    if (!Number.isFinite(value)) return 0;
    return Math.min(1, Math.max(0, value));
}

/**
 * Effective output level.
 *
 * The app slider is multiplied by the system tray volume, matching what the
 * inherited Media Player Classic already does — the tray control is a shipped
 * surface and a second player that ignored it would be incoherent.
 */
export function effective_volume(app: number, system: number): number {
    return clamp_volume(clamp_volume(app) * clamp_volume(system));
}

/** Progress as 0..1, safe while `duration` is still NaN. */
export function progress_ratio(current: number, duration: number): number {
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    if (!Number.isFinite(current) || current <= 0) return 0;
    return Math.min(1, current / duration);
}

/** Where a click at `ratio` along the seek bar should jump to. */
export function seek_target(ratio: number, duration: number): number {
    if (!Number.isFinite(duration) || duration <= 0) return 0;
    return clamp_volume(ratio) * duration;
}

/**
 * One `MediaElementAudioSourceNode` per media element, forever.
 *
 * THE FOOTGUN THIS EXISTS FOR: `createMediaElementSource()` is a PERMANENT,
 * ONE-SHOT binding on the element. A second call throws `InvalidStateError`
 * — and the check is on the ELEMENT, so it throws even from a different
 * `AudioContext`. Naively creating the node wherever playback starts gives:
 * play -> works, pause -> play -> InvalidStateError.
 *
 * A WeakMap keyed on the element is the fix, and it also lets the element be
 * garbage-collected normally.
 *
 * The cache is written against an INJECTED factory so the contract (same
 * element -> same node; two elements -> two nodes) is unit-testable. The real
 * `InvalidStateError` cannot be reproduced in CI: vitest has no Web Audio, and
 * headless Chromium additionally ignores the autoplay policy — so that half is
 * a manual deploy-probe line in the phase guide.
 */
export function create_source_cache<E extends object, N>(
    factory: (element: E) => N,
): (element: E) => N {
    const cache = new WeakMap<E, N>();
    return (element: E): N => {
        const existing = cache.get(element);
        if (existing !== undefined) return existing;
        const node = factory(element);
        cache.set(element, node);
        return node;
    };
}

/**
 * Bar heights for the visualiser, from an `AnalyserNode` frequency buffer.
 *
 * Pure so the drawing logic is testable; the component only blits the result.
 * The low end of the spectrum carries almost all the energy in real music, so
 * sampling linearly across the whole buffer wastes most bars on near-silent
 * high frequencies — this walks a fraction of the range instead.
 */
export function bar_heights(
    frequencies: Uint8Array | readonly number[],
    bars: number,
    /** Fraction of the spectrum to display. */
    span = 0.6,
): number[] {
    if (bars <= 0 || frequencies.length === 0) return [];
    const usable = Math.max(1, Math.floor(frequencies.length * span));
    const per_bar = Math.max(1, Math.floor(usable / bars));
    const out: number[] = [];
    for (let i = 0; i < bars; i++) {
        let sum = 0;
        let count = 0;
        for (let j = i * per_bar; j < (i + 1) * per_bar && j < usable; j++) {
            sum += frequencies[j] ?? 0;
            count++;
        }
        out.push(count === 0 ? 0 : sum / count / 255);
    }
    return out;
}
