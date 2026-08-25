/**
 * The bundled Music Player tracks (SPECIFICATION.md §3.2, plan T9).
 *
 * THE SINGLE SOURCE OF TRUTH. The player reads this at runtime, and
 * `scripts/generate-vfs.ts` derives the `My Music` seed entries from it — so
 * there is exactly one list to maintain. Two hand-kept lists would drift, and
 * a drifted VFS entry is shipped data that cannot be un-shipped (see below).
 *
 * `size_kb` IS HAND-WRITTEN, DELIBERATELY. It could be `statSync`'d at
 * generation time, but then the mp3 bytes would become an input to
 * SEED_VERSION — which hashes the serialised seed — so regenerating a track
 * would silently bump the seed for every returning visitor. That is exactly
 * the migration T3 exists to make safe, and it should never fire by accident.
 * A test asserts these values match the committed files, so drift is a red
 * test rather than a wrong number in Explorer.
 *
 * UNITS ARE KB. `VfsItem.size` is documented as KB (types.ts) and the
 * inherited wallpaper entries prove the convention; a byte value would render
 * as "3,145,728 KB" in the Details column.
 *
 * IDS ARE PERMANENT. `merge_on_reseed` carries any cached item absent from a
 * later seed, and there is no mechanism to reap one — so a renamed id would
 * persist in every returning visitor's My Music forever, alongside its
 * replacement.
 */
export interface Track {
    /** Stable VFS id. NEVER change one — see the header. */
    id: string;
    title: string;
    /** File name as it appears in Explorer. */
    filename: string;
    /** Served from static/, so the player never depends on the VFS. */
    url: string;
    /** Rounded KB, matching the committed file. Asserted by a test. */
    size_kb: number;
    /** Whole seconds, for the track list and the seek bar's initial state. */
    duration_s: number;
}

export const TRACKS: readonly Track[] = [
    {
        id: 'p3MusicAscentTrack00001',
        title: 'Ascent',
        filename: 'ascent.mp3',
        url: '/audio/music/ascent.mp3',
        size_kb: 167,
        duration_s: 42,
    },
    {
        id: 'p3MusicPulseTrack000001',
        title: 'Pulse',
        filename: 'pulse.mp3',
        url: '/audio/music/pulse.mp3',
        size_kb: 501,
        duration_s: 38,
    },
    {
        id: 'p3MusicDriftTrack000001',
        title: 'Drift',
        filename: 'drift.mp3',
        url: '/audio/music/drift.mp3',
        size_kb: 455,
        duration_s: 36,
    },
];

/** Formats seconds as `m:ss`, the way every media player does. */
export function format_duration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${String(minutes)}:${rest.toString().padStart(2, '0')}`;
}
