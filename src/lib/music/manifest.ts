/**
 * The Music Player's library — TYPES and helpers only.
 *
 * THE TRACK LIST IS NO LONGER HAND-WRITTEN. It is discovered from
 * `static/audio/music/<genre>/*.mp3` by `scan.ts` and emitted into
 * `src/lib/generated/music.ts`, which CLAUDE.md forbids hand-editing. The owner
 * drops files into a genre folder and runs `npm run generate:vfs`. Genres, their
 * display names and their order come from `profile.json`; the folder supplies
 * the tracks.
 *
 * WHAT REPLACED THE OLD PROTECTIONS. `size_kb` used to be hand-written so mp3
 * bytes could never become an input to SEED_VERSION, because a re-encode would
 * silently re-seed every returning visitor. Scanning reintroduces that path, so
 * the protection moved rather than vanished: the generated manifest is
 * COMMITTED and CI diffs `src/lib/generated`, so a re-encode is a red freshness
 * gate and a visible diff instead of a silent bump. It is a real cost — any
 * re-encode of any one track re-seeds everyone — and it is acceptable only
 * because vanished seed ids are now reaped (`seed.ts`), which makes re-seeds
 * safe in a way they were not before.
 *
 * `duration_s` deliberately does NOT reach the VFS seed. It is player metadata,
 * not file metadata, so only `size` feeds SEED_VERSION — unchanged from before.
 *
 * IDS ARE DERIVED, NOT CHOSEN — `sha256(genre/filename)`, see `scan.ts`. A
 * rename or a move between genres therefore mints a new id and strands the old
 * one; `merge_on_reseed` reaps it from returning visitors' drives.
 *
 * UNITS ARE KB. `VfsItem.size` is documented as KB (types.ts); a byte value
 * would render as "3,145,728 KB" in the Details column.
 */
export interface Track {
    /** Derived from genre + filename. See `scan.ts`. */
    id: string;
    /** ID3 title, falling back to the filename without its extension. */
    title: string;
    /** ID3 artist, or null when the file carries no tag. */
    artist: string | null;
    /** File name as it appears in Explorer. */
    filename: string;
    /** Served from static/, so the player never depends on the VFS. */
    url: string;
    /** Rounded KB, matching the committed file. */
    size_kb: number;
    /** Whole seconds, for the track list and the seek bar's initial state. */
    duration_s: number;
    /** `dir` of the owning genre. */
    genre: string;
    /** Extracted cover art URL, or null when the file carries none. */
    cover: string | null;
}

export interface Genre {
    id: string;
    /** Folder under `static/audio/music`. */
    dir: string;
    /** Display name, from `profile.json`. */
    name: string;
}

export { TRACKS, GENRES } from '../generated/music';

/** Formats seconds as `m:ss`, the way every media player does. */
export function format_duration(seconds: number): string {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    const rest = total % 60;
    return `${String(minutes)}:${rest.toString().padStart(2, '0')}`;
}
