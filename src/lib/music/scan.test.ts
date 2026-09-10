import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    clean_artist,
    display_title,
    scan_music,
    track_id,
    genre_id,
    cover_extension,
    type GenreDecl,
    type TrackTags,
} from './scan';

let root = '';

/** Distinct bytes per file: identical audio across genres is a hard error. */
function put(dir: string, name: string, filler = name): void {
    mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(join(root, dir, name), `mp3-${filler}`.padEnd(2048, '.'));
}

const tags =
    (over: Record<string, TrackTags> = {}) =>
    (path: string): Promise<TrackTags> => {
        const name = path.split('/').pop() ?? '';
        return Promise.resolve(
            over[name] ?? { duration_s: 200, title: undefined },
        );
    };

const TARAB: GenreDecl = { dir: 'tarab', name: 'Tarab' };
const HIP_HOP: GenreDecl = { dir: 'hip-hop', name: 'Hip Hop' };
const GENRES: GenreDecl[] = [TARAB, HIP_HOP];

beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'music-scan-'));
});
afterEach(() => {
    rmSync(root, { recursive: true, force: true });
});

describe('ids', () => {
    it('is stable for the same genre and filename', () => {
        expect(track_id('tarab', 'a.mp3')).toBe(track_id('tarab', 'a.mp3'));
        expect(track_id('tarab', 'a.mp3')).toHaveLength(16);
    });

    it('changes when a track moves between genres', () => {
        // the reason vanished seed ids must be reaped — see seed.ts
        expect(track_id('tarab', 'a.mp3')).not.toBe(
            track_id('hip-hop', 'a.mp3'),
        );
    });

    it('separates genre folder ids from track ids', () => {
        expect(genre_id('tarab')).not.toBe(track_id('tarab', 'tarab'));
    });
});

describe('cover_extension', () => {
    it('maps MIME types and ID3v2.2 bare codes alike', () => {
        expect(cover_extension('image/jpeg')).toBe('.jpg');
        expect(cover_extension('image/png')).toBe('.png');
        // ID3v2.2 stores a 3-character format code, not a MIME type
        expect(cover_extension('PNG')).toBe('.png');
        expect(cover_extension('JPG')).toBe('.jpg');
    });

    it('refuses a format it cannot name', () => {
        expect(() => cover_extension('image/tiff')).toThrow(/unsupported/);
    });
});

describe('scan_music', () => {
    it('returns genres in profile order and tracks in numeric filename order', async () => {
        put('tarab', '2 - b.mp3');
        put('tarab', '10 - c.mp3');
        put('tarab', '1 - a.mp3');
        put('hip-hop', 'x.mp3');

        const result = await scan_music(GENRES, tags(), root);
        expect(result.genres.map((g) => g.dir)).toEqual(['tarab', 'hip-hop']);
        // 10 must sort AFTER 2, which plain string order gets wrong
        expect(result.genres[0]?.tracks.map((t) => t.filename)).toEqual([
            '1 - a.mp3',
            '2 - b.mp3',
            '10 - c.mp3',
        ]);
    });

    it('URL-encodes each path segment', async () => {
        put('tarab', 'إنت عمري.mp3');
        const track = (await scan_music([TARAB], tags(), root)).genres[0]
            ?.tracks[0];
        expect(track?.url).toBe(
            `/audio/music/tarab/${encodeURI('إنت عمري.mp3')}`,
        );
        expect(track?.url).not.toContain(' ');
    });

    it('falls back to the filename when there is no title tag', async () => {
        put('tarab', 'Shedeeny.mp3');
        const track = (await scan_music([TARAB], tags(), root)).genres[0]
            ?.tracks[0];
        expect(track?.title).toBe('Shedeeny');
        expect(track?.artist).toBeNull();
    });

    it('deduplicates identical cover art across tracks', async () => {
        put('tarab', 'a.mp3');
        put('tarab', 'b.mp3');
        const art = { data: new Uint8Array([1, 2, 3]), format: 'image/jpeg' };
        const result = await scan_music(
            [TARAB],
            tags({
                'a.mp3': { duration_s: 1, picture: art },
                'b.mp3': { duration_s: 1, picture: art },
            }),
            root,
        );
        expect(result.covers).toHaveLength(1);
        const [a, b] = result.genres[0]?.tracks ?? [];
        expect(a?.cover).toBe(b?.cover);
        expect(a?.cover).toMatch(/^\/assets\/covers\/[0-9a-f]{16}\.jpg$/);
    });

    it('records cover null rather than failing when a file has no art', async () => {
        put('tarab', 'a.mp3');
        const result = await scan_music([TARAB], tags(), root);
        expect(result.genres[0]?.tracks[0]?.cover).toBeNull();
        expect(result.covers).toEqual([]);
    });
});

describe('scan_music fails loudly', () => {
    const only_tarab = [TARAB];

    it('when a folder on disk is undeclared', async () => {
        put('tarab', 'a.mp3');
        put('mystery', 'b.mp3');
        // the message hands over the exact profile.json line, because
        // renaming a genre folder is deliberately a two-part edit
        await expect(scan_music(only_tarab, tags(), root)).rejects.toThrow(
            /"dir": "mystery"/,
        );
    });

    it('when a declared genre has no folder', async () => {
        put('tarab', 'a.mp3');
        await expect(scan_music(GENRES, tags(), root)).rejects.toThrow(
            /does not exist/,
        );
    });

    it('when a genre folder holds no mp3', async () => {
        mkdirSync(join(root, 'tarab'), { recursive: true });
        writeFileSync(join(root, 'tarab', 'notes.txt'), 'x');
        await expect(scan_music(only_tarab, tags(), root)).rejects.toThrow(
            /empty genre/,
        );
    });

    it('when an mp3 sits loose in the root', async () => {
        // the pre-migration layout: this must not be silently ignored
        put('tarab', 'a.mp3');
        writeFileSync(join(root, 'ascent.mp3'), 'x');
        await expect(scan_music(only_tarab, tags(), root)).rejects.toThrow(
            /loose mp3s/,
        );
    });

    it('when stripping the track number leaves nothing to show', async () => {
        // `07 .mp3` is a real shape for a badly-exported file; it would list in
        // Explorer as an empty name
        put('tarab', '07 .mp3');
        await expect(scan_music(only_tarab, tags(), root)).rejects.toThrow(
            /no name left once its track number is stripped/,
        );
    });

    it('when a filename would be unreachable as a URL', async () => {
        for (const bad of ['a#b.mp3', 'a?b.mp3', 'a%b.mp3']) {
            rmSync(root, { recursive: true, force: true });
            put('tarab', bad);
            await expect(scan_music(only_tarab, tags(), root)).rejects.toThrow(
                /unreachable as a URL/,
            );
        }
    });

    it('when a genre dir is not a plain slug', async () => {
        put('tarab', 'a.mp3');
        await expect(
            scan_music([{ dir: '../etc', name: 'x' }], tags(), root),
        ).rejects.toThrow(/must match/);
        await expect(
            scan_music([{ dir: 'Tarab', name: 'x' }], tags(), root),
        ).rejects.toThrow(/must match/);
    });

    it('when the same genre dir is declared twice', async () => {
        put('tarab', 'a.mp3');
        await expect(scan_music([TARAB, TARAB], tags(), root)).rejects.toThrow(
            /declared twice/,
        );
    });

    it('when the same audio appears in two genres', async () => {
        put('tarab', 'a.mp3', 'same');
        put('hip-hop', 'b.mp3', 'same');
        await expect(scan_music(GENRES, tags(), root)).rejects.toThrow(
            /byte-identical/,
        );
    });

    it('when a duration is missing or zero', async () => {
        put('tarab', 'a.mp3');
        for (const bad of [undefined, 0, NaN]) {
            await expect(
                scan_music(
                    only_tarab,
                    tags({ 'a.mp3': { duration_s: bad } }),
                    root,
                ),
            ).rejects.toThrow(/no readable duration/);
        }
    });

    it('when no genres are declared at all', async () => {
        await expect(scan_music([], tags(), root)).rejects.toThrow(
            /no music genres/,
        );
    });
});

describe('display_title', () => {
    it('drops the extension and the ordering prefix', () => {
        // `01 - ` exists to order the folder, not to be read on screen
        expect(display_title('01 - Shape Of You.mp3')).toBe('Shape Of You');
        expect(display_title('02. Homecoming.mp3')).toBe('Homecoming');
        expect(display_title('3 No Role Modelz.mp3')).toBe('No Role Modelz');
    });

    it('keeps a number that is part of the name', () => {
        // stripping needs a separator or a space, so these survive intact
        expect(display_title('7 Rings.mp3')).toBe('Rings');
        expect(display_title('99 Problems.mp3')).toBe('Problems');
        expect(display_title('1979.mp3')).toBe('1979');
    });

    it('keeps parentheses and non-ASCII', () => {
        expect(display_title('01 - i (Single Version).mp3')).toBe(
            'i (Single Version)',
        );
        expect(display_title('02 - شدي.mp3')).toBe('شدي');
    });
});

describe('clean_artist', () => {
    it('strips the two unambiguous YouTube artefacts', () => {
        expect(clean_artist('Kanye West - Topic')).toBe('Kanye West');
        expect(clean_artist('KendrickLamarVEVO')).toBe('KendrickLamar');
    });

    it('leaves anything else exactly as tagged', () => {
        // a wrong-but-honest tag beats an invented one
        expect(clean_artist('Wegz ويجز')).toBe('Wegz ويجز');
        expect(clean_artist('J. Cole')).toBe('J. Cole');
    });

    it('treats empty and missing alike', () => {
        expect(clean_artist(undefined)).toBeNull();
        expect(clean_artist('   ')).toBeNull();
        expect(clean_artist('VEVO')).toBeNull();
    });
});
