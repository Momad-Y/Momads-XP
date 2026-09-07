/**
 * Discovers the music library from `static/audio/music/<genre>/*.mp3`.
 *
 * Replaces the hand-written `TRACKS` array: the owner drops files into a genre
 * folder, runs `npm run generate:vfs`, and everything appears. There is no
 * server, so "dynamic" is build-time — the result is committed and CI diffs it.
 *
 * WHY THIS LIVES IN `src/lib` AND NOT `scripts/`: vitest only collects
 * `src/**\/*.test.ts`, and `coverage.include` is `src/**\/*.ts`. Scanner logic
 * in `scripts/` could not be unit-tested or mutation-tested at all.
 *
 * EVERY LISTING IS EXPLICITLY SORTED. `fs.readdirSync` guarantees no ordering,
 * and this order reaches the genre folders' `children` arrays and therefore
 * `JSON.stringify(seed)` -> SEED_VERSION. The owner's filesystem and the CI
 * runner need not agree; a mismatch would be a permanently red freshness gate
 * whose diff looks like reordered JSON with no cause.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Root of the library, relative to the repo. */
export const MUSIC_ROOT = 'static/audio/music';

/** Where extracted cover art is written. The generator OWNS this directory. */
export const COVER_DIR = 'static/assets/covers';

/**
 * Characters that must never reach a filename.
 *
 * `#` truncates a URL at the fragment and `?` starts a query, so either makes
 * the track unreachable on Netlify; `%` breaks re-encoding; `/` and `\` are
 * path traversal. Non-ASCII is fine — `encodeURI` handles Arabic titles.
 */
const FORBIDDEN = /[#?%/\\]/;

/** A genre folder name. Also an id input and a URL segment, so keep it plain. */
const DIR_PATTERN = /^[a-z0-9-]+$/;

/** Declared in `profile.json`; the folder holds the tracks. */
export interface GenreDecl {
    /** Folder under `static/audio/music`. Matches DIR_PATTERN. */
    dir: string;
    /** Display name — free of filesystem constraints. */
    name: string;
}

export interface ScannedTrack {
    id: string;
    title: string;
    artist: string | null;
    filename: string;
    url: string;
    size_kb: number;
    duration_s: number;
    /** `dir` of the owning genre. */
    genre: string;
    /** URL of the extracted cover, or null when the file carries no art. */
    cover: string | null;
}

export interface ScannedGenre {
    id: string;
    dir: string;
    name: string;
    tracks: ScannedTrack[];
}

/** One extracted cover, for the generator to write. */
export interface CoverFile {
    filename: string;
    data: Uint8Array;
}

export interface ScanResult {
    genres: ScannedGenre[];
    covers: CoverFile[];
}

/** What `music-metadata` gives us, narrowed to what this module needs. */
export interface TrackTags {
    title?: string | undefined;
    artist?: string | undefined;
    duration_s?: number | undefined;
    picture?: { data: Uint8Array; format: string } | undefined;
}

/** Injected so the scanner stays pure and testable without real mp3 bytes. */
export type ReadTags = (path: string) => Promise<TrackTags>;

/**
 * Ids are derived, never chosen — but they are still PERMANENT in the sense
 * that `merge_on_reseed` replaces the seed wholesale. 16 hex chars of sha256
 * over `genre/filename`: deterministic, and collision-free far past 15 tracks.
 *
 * Renaming a file, or moving it between genres, therefore changes its id. That
 * is safe ONLY because vanished seed ids are now reaped from returning
 * visitors' drives (`seed.ts`); without that, every rename would strand a
 * permanent 404 in My Music.
 */
export function track_id(genre_dir: string, filename: string): string {
    return createHash('sha256')
        .update(`${genre_dir}/${filename}`)
        .digest('hex')
        .slice(0, 16);
}

/** Genre folders need ids too, and are reaped by the same rule when renamed. */
export function genre_id(genre_dir: string): string {
    return createHash('sha256')
        .update(`genre:${genre_dir}`)
        .digest('hex')
        .slice(0, 16);
}

/** `image/png` -> `.png`. ID3v2.2 stores a bare 3-char code instead of a MIME. */
export function cover_extension(format: string): string {
    const lower = format.toLowerCase();
    const bare = lower.startsWith('image/')
        ? lower.slice('image/'.length)
        : lower;
    if (bare === 'jpeg' || bare === 'jpg') return '.jpg';
    if (bare === 'png') return '.png';
    if (bare === 'webp') return '.webp';
    if (bare === 'gif') return '.gif';
    if (bare === 'bmp') return '.bmp';
    throw new Error(`unsupported cover image format: ${format}`);
}

/** Filename order, with numeric runs compared as numbers so 10 follows 9. */
function by_name(a: string, b: string): number {
    return a.localeCompare(b, 'en', { numeric: true });
}

function check_name(kind: string, value: string): void {
    if (FORBIDDEN.test(value)) {
        throw new Error(
            `${kind} "${value}" contains one of # ? % / \\ — it would be ` +
                'unreachable as a URL. Rename it.',
        );
    }
}

/**
 * Walks the declared genres and returns the library plus the covers to write.
 *
 * Every failure here is LOUD. The worst outcome this feature can have is a
 * pasted album that silently never appears, so a folder nobody declared and a
 * genre with no folder are both errors, not skips.
 */
export async function scan_music(
    genres: readonly GenreDecl[],
    read_tags: ReadTags,
    root: string = MUSIC_ROOT,
): Promise<ScanResult> {
    if (genres.length === 0)
        throw new Error('no music genres declared in profile.json');

    const declared = new Set<string>();
    for (const g of genres) {
        if (!DIR_PATTERN.test(g.dir)) {
            throw new Error(
                `genre dir "${g.dir}" must match ${String(DIR_PATTERN)} — it is ` +
                    'used as a path segment, a URL segment and an id input',
            );
        }
        if (declared.has(g.dir))
            throw new Error(`genre dir "${g.dir}" declared twice`);
        declared.add(g.dir);
    }

    const on_disk = readdirSync(root, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name)
        .sort(by_name);

    for (const dir of on_disk) {
        if (!declared.has(dir)) {
            // Renaming a folder is deliberately a TWO-part edit: the folder and
            // its profile.json entry. Failing here rather than skipping is what
            // stops a renamed or newly pasted genre from silently vanishing —
            // so the error hands over the exact line to paste.
            throw new Error(
                `${root}/${dir} exists but no genre in profile.json declares it. ` +
                    'Add it to profile.json "music".genres, in the order you want ' +
                    `it shown:\n    { "dir": "${dir}", "name": "${dir.replace(/-/g, ' ')}" }`,
            );
        }
    }
    const loose = readdirSync(root, { withFileTypes: true }).filter(
        (e) => e.isFile() && e.name.endsWith('.mp3'),
    );
    if (loose.length > 0) {
        throw new Error(
            `${root} holds loose mp3s (${loose.map((e) => e.name).join(', ')}) — ` +
                'every track belongs to a genre folder',
        );
    }

    const covers = new Map<string, CoverFile>();
    const seen_ids = new Map<string, string>();
    const seen_audio = new Map<string, string>();
    const out: ScannedGenre[] = [];

    for (const genre of genres) {
        const dir = join(root, genre.dir);
        let entries: string[];
        try {
            entries = readdirSync(dir, { withFileTypes: true })
                .filter((e) => e.isFile())
                .map((e) => e.name)
                .sort(by_name);
        } catch {
            throw new Error(
                `genre "${genre.dir}" is declared in profile.json but ${dir} ` +
                    'does not exist. If you renamed the folder, rename its ' +
                    '"dir" here too — the two must match.',
            );
        }

        const files = entries.filter((n) => n.toLowerCase().endsWith('.mp3'));
        if (files.length === 0) {
            throw new Error(
                `genre "${genre.dir}" has no .mp3 files — an empty genre is a mistake`,
            );
        }

        const tracks: ScannedTrack[] = [];
        for (const filename of files) {
            check_name('track', filename);
            const path = join(dir, filename);
            const bytes = readFileSync(path);

            const audio_hash = createHash('sha256').update(bytes).digest('hex');
            const twin = seen_audio.get(audio_hash);
            if (twin != null) {
                throw new Error(
                    `${path} is byte-identical to ${twin} — the same song in two ` +
                        'genres gives duplicate rows and an ambiguous Open With',
                );
            }
            seen_audio.set(audio_hash, path);

            const id = track_id(genre.dir, filename);
            const clash = seen_ids.get(id);
            if (clash != null)
                throw new Error(`id collision: ${path} and ${clash}`);
            seen_ids.set(id, path);

            const tags = await read_tags(path);
            const duration = tags.duration_s;
            if (
                duration == null ||
                !Number.isFinite(duration) ||
                duration <= 0
            ) {
                throw new Error(
                    `${path} has no readable duration — the seek bar would be ` +
                        'silently dead rather than visibly broken',
                );
            }

            let cover: string | null = null;
            if (tags.picture != null) {
                const ext = cover_extension(tags.picture.format);
                const hash = createHash('sha256')
                    .update(tags.picture.data)
                    .digest('hex')
                    .slice(0, 16);
                const cover_name = `${hash}${ext}`;
                if (!covers.has(cover_name)) {
                    covers.set(cover_name, {
                        filename: cover_name,
                        data: tags.picture.data,
                    });
                }
                cover = `/assets/covers/${cover_name}`;
            }

            tracks.push({
                id,
                title: tags.title?.trim() ?? filename.replace(/\.mp3$/i, ''),
                artist: tags.artist?.trim() ?? null,
                filename,
                url: `/audio/music/${encodeURI(genre.dir)}/${encodeURI(filename)}`,
                // KB, per VfsItem.size — a byte value renders as "512,986 KB"
                size_kb: Math.round(statSync(path).size / 1024),
                duration_s: Math.round(duration),
                genre: genre.dir,
                cover,
            });
        }

        out.push({
            id: genre_id(genre.dir),
            dir: genre.dir,
            name: genre.name,
            tracks,
        });
    }

    return {
        genres: out,
        covers: [...covers.values()].sort((a, b) =>
            by_name(a.filename, b.filename),
        ),
    };
}
