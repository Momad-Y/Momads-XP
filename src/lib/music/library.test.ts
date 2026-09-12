import { describe, expect, it } from 'vitest';
import {
    AUDIO_EXTENSIONS,
    EXTRA_GROUP_KEY,
    UNSORTED_GROUP_KEY,
    build_library,
    is_audio,
    metadata_index,
} from './library';
import type { Track } from './manifest';
import type { HardDrive, VfsItem } from '../types';

/**
 * The grouping rules, written as the seven defects that produced them.
 *
 * These are the tests the OLD e2e suite could not be: it imported the same
 * generated manifest the VFS seed is generated from, so its expectations and
 * the player's data agreed by construction and every assertion passed whether
 * or not the player read the drive at all.
 */

const MY_MUSIC = 'my-music';

function node(id: string, over: Partial<VfsItem> = {}): VfsItem {
    return {
        id,
        type: 'file',
        name: id + '.mp3',
        basename: id,
        ext: '.mp3',
        children: [],
        date_created: 0,
        date_modified: 0,
        sort_option: 0,
        sort_order: 0,
        ...over,
    };
}

const dir = (id: string, children: string[], over: Partial<VfsItem> = {}) =>
    node(id, { type: 'folder', name: id, ext: '', children, ...over });

/** `My Music > Rock > riff.mp3`. */
function seed(): HardDrive {
    return {
        [MY_MUSIC]: dir(MY_MUSIC, ['rock']),
        rock: dir('rock', ['riff'], { name: 'Rock', parent: MY_MUSIC }),
        riff: node('riff', {
            parent: 'rock',
            storage_type: 'remote',
            url: '/audio/music/rock/01 - riff.mp3',
        }),
    };
}

const NO_META = new Map();
const build = (drive: HardDrive, meta = NO_META) =>
    build_library(drive, MY_MUSIC, meta, 'Unsorted');

describe('build_library', () => {
    it('groups by the folders that are actually on the drive', () => {
        const library = build(seed());

        expect(library.groups).toHaveLength(1);
        expect(library.groups[0]?.name).toBe('Rock');
        expect(library.groups[0]?.tracks.map((t) => t.title)).toEqual(['riff']);
        expect(library.flat).toHaveLength(1);
    });

    /* Defect 1: deleting a song in Explorer left it listed and playable. */
    it('drops a song that is no longer on the drive', () => {
        const drive = seed();
        delete drive.riff;
        drive.rock = dir('rock', [], { name: 'Rock', parent: MY_MUSIC });

        const library = build(drive);
        expect(library.flat).toHaveLength(0);
    });

    /* Defect 2: deleting a genre folder left its header standing. */
    it('drops a category whose folder is gone', () => {
        const drive = seed();
        delete drive.rock;
        drive[MY_MUSIC] = dir(MY_MUSIC, []);

        expect(build(drive).groups).toHaveLength(0);
    });

    /* Defect 3: an emptied genre is still a genre. */
    it('keeps a category whose songs are all gone', () => {
        const drive = seed();
        delete drive.riff;
        drive.rock = dir('rock', [], { name: 'Rock', parent: MY_MUSIC });

        const library = build(drive);
        expect(library.groups).toHaveLength(1);
        expect(library.groups[0]?.tracks).toHaveLength(0);
    });

    /* Defect 4: a folder the visitor invents is a category too. */
    it('picks up a folder the visitor created, and its songs', () => {
        const drive = seed();
        drive[MY_MUSIC] = dir(MY_MUSIC, ['rock', 'mine']);
        drive.mine = dir('mine', ['tune'], {
            name: 'My Mix',
            parent: MY_MUSIC,
        });
        drive.tune = node('tune', { parent: 'mine', storage_type: 'local' });

        const library = build(drive);
        expect(library.groups.map((g) => g.name)).toEqual(['Rock', 'My Mix']);
        expect(library.groups[1]?.tracks[0]?.title).toBe('tune');
    });

    /* Defect 5: a song added to an existing genre never appeared. */
    it('picks up a song added to an existing category', () => {
        const drive = seed();
        drive.rock = dir('rock', ['riff', 'added'], {
            name: 'Rock',
            parent: MY_MUSIC,
        });
        drive.added = node('added', { parent: 'rock', storage_type: 'local' });

        expect(build(drive).groups[0]?.tracks.map((t) => t.title)).toEqual([
            'riff',
            'added',
        ]);
    });

    /* Defect 6: a song loose in My Music, with no folder at all. */
    it('collects loose songs under the unsorted header, last', () => {
        const drive = seed();
        drive[MY_MUSIC] = dir(MY_MUSIC, ['loose', 'rock']);
        drive.loose = node('loose', {
            parent: MY_MUSIC,
            storage_type: 'local',
        });

        const library = build(drive);
        // Folders first, then the loose files — the order Explorer itself
        // lists a folder in, even though `loose` comes first in `children`.
        expect(library.groups.map((g) => g.name)).toEqual(['Rock', 'Unsorted']);
        expect(library.groups[1]?.key).toBe(UNSORTED_GROUP_KEY);
        expect(library.flat.map((t) => t.title)).toEqual(['riff', 'loose']);
    });

    it('omits the unsorted header entirely when nothing is loose', () => {
        expect(build(seed()).groups.map((g) => g.key)).not.toContain(
            UNSORTED_GROUP_KEY,
        );
    });

    /*
     * A visitor who names a folder "Unsorted" must not collide with the
     * synthetic group: two groups sharing an `{#each}` key makes Svelte throw
     * and stop rendering the whole list.
     */
    it('does not collide with a folder the visitor named Unsorted', () => {
        const drive = seed();
        drive[MY_MUSIC] = dir(MY_MUSIC, ['theirs', 'loose']);
        drive.theirs = dir('theirs', [], {
            name: 'Unsorted',
            parent: MY_MUSIC,
        });
        drive.loose = node('loose', { parent: MY_MUSIC });

        const keys = build(drive).groups.map((g) => g.key);
        expect(keys).toEqual(['theirs', UNSORTED_GROUP_KEY]);
        expect(new Set(keys).size).toBe(keys.length);
    });

    it('keys groups by folder id, so two folders may share a name', () => {
        const drive = seed();
        drive[MY_MUSIC] = dir(MY_MUSIC, ['rock', 'rock2']);
        drive.rock2 = dir('rock2', [], { name: 'Rock', parent: MY_MUSIC });

        const keys = build(drive).groups.map((g) => g.key);
        expect(keys).toEqual(['rock', 'rock2']);
    });

    it('rolls a song in a nested folder up into its category', () => {
        const drive = seed();
        drive.rock = dir('rock', ['riff', 'live'], {
            name: 'Rock',
            parent: MY_MUSIC,
        });
        drive.live = dir('live', ['encore'], { name: 'Live', parent: 'rock' });
        drive.encore = node('encore', { parent: 'live' });

        const library = build(drive);
        // One category, not two — but nothing is invisible.
        expect(library.groups).toHaveLength(1);
        expect(library.groups[0]?.tracks.map((t) => t.title)).toEqual([
            'riff',
            'encore',
        ]);
    });

    it('ignores files it cannot play, and shortcuts to songs', () => {
        const drive = seed();
        drive.rock = dir('rock', ['riff', 'notes', 'link'], {
            name: 'Rock',
            parent: MY_MUSIC,
        });
        drive.notes = node('notes', {
            parent: 'rock',
            name: 'notes.txt',
            ext: '.txt',
        });
        drive.link = node('link', {
            parent: 'rock',
            name: 'riff.lnk',
            ext: '.lnk',
            storage_type: 'fake',
            shortcut_target: 'riff',
        });

        expect(build(drive).flat.map((t) => t.title)).toEqual(['riff']);
    });

    /*
     * Reachable: a legacy cached drive, or a re-seed fallback. This runs
     * inside a reactive statement, where a throw takes the whole component
     * down rather than just the list.
     */
    it('returns an empty library rather than throwing when My Music is gone', () => {
        expect(build({})).toEqual({ groups: [], flat: [] });
    });

    it('survives a drive whose folders contain each other', () => {
        const drive = seed();
        drive.rock = dir('rock', ['loop'], { name: 'Rock', parent: MY_MUSIC });
        drive.loop = dir('loop', ['rock'], { name: 'Loop', parent: 'rock' });

        expect(() => build(drive)).not.toThrow();
    });

    it('skips ids the drive no longer resolves', () => {
        const drive = seed();
        drive.rock = dir('rock', ['riff', 'ghost'], {
            name: 'Rock',
            parent: MY_MUSIC,
        });

        expect(build(drive).flat).toHaveLength(1);
    });
});

describe('metadata sidecar', () => {
    const track: Track = {
        id: 'riff',
        title: 'Riff',
        artist: 'Somebody',
        filename: '01 - riff.mp3',
        url: '/audio/music/rock/01 - riff.mp3',
        size_kb: 100,
        duration_s: 212,
        genre: 'rock',
        cover: '/assets/covers/abc.png',
        cover_box: { x: 1, y: 2, w: 3, h: 4, iw: 5, ih: 6 },
    };

    it('joins on the VFS id, which IS the manifest id for seeded tracks', () => {
        const library = build(seed(), new Map(metadata_index([track])));
        const row = library.flat[0];

        // Asserting on ARTIST and COVER, not title: a seeded track's VFS
        // basename is already its ID3 title, so a broken join is invisible in
        // the title and a test on it could never fail.
        expect(row?.artist).toBe('Somebody');
        expect(row?.cover).toBe('/assets/covers/abc.png');
        expect(row?.duration_s).toBe(212);
        expect(row?.cover_box?.iw).toBe(5);
    });

    it('falls back to the url, so a copy keeps its art', () => {
        const drive = seed();
        // What `clone_fs` produces: a fresh id, the same url.
        drive.rock = dir('rock', ['copy'], { name: 'Rock', parent: MY_MUSIC });
        drive.copy = node('copy', {
            parent: 'rock',
            storage_type: 'remote',
            url: '/audio/music/rock/01 - riff.mp3',
        });

        const row = build(drive, new Map(metadata_index([track]))).flat[0];
        expect(row?.artist).toBe('Somebody');
    });

    it('leaves a visitor’s own upload without art or duration', () => {
        const drive = seed();
        drive.rock = dir('rock', ['theirs'], {
            name: 'Rock',
            parent: MY_MUSIC,
        });
        drive.theirs = node('theirs', {
            parent: 'rock',
            storage_type: 'local',
            url: 'blob-key-1',
        });

        const row = build(drive, new Map(metadata_index([track]))).flat[0];
        expect(row?.artist).toBeNull();
        expect(row?.cover).toBeNull();
        // Not 0: the row renders `--:--` until the file is decoded.
        expect(row?.duration_s).toBeNull();
    });

    it('titles a row from the drive, so a rename in Explorer is honoured', () => {
        const drive = seed();
        drive.riff = node('riff', {
            parent: 'rock',
            basename: 'Renamed By Visitor',
            name: 'Renamed By Visitor.mp3',
            url: '/audio/music/rock/01 - riff.mp3',
        });

        const row = build(drive, new Map(metadata_index([track]))).flat[0];
        expect(row?.title).toBe('Renamed By Visitor');
        // …while the sidecar still supplies what the drive cannot know.
        expect(row?.artist).toBe('Somebody');
    });
});

describe('is_audio', () => {
    it('accepts every listed extension, case-insensitively', () => {
        for (const ext of AUDIO_EXTENSIONS) {
            expect(is_audio(node('x', { ext }))).toBe(true);
            expect(is_audio(node('x', { ext: ext.toUpperCase() }))).toBe(true);
        }
    });

    it('rejects folders, programs and unplayable files', () => {
        expect(is_audio(dir('f', []))).toBe(false);
        expect(is_audio(node('p', { storage_type: 'fake' }))).toBe(false);
        expect(is_audio(node('t', { ext: '.txt' }))).toBe(false);
    });
});

describe('a file opened from outside My Music', () => {
    /** `Desktop > stray.mp3`, alongside the usual library. */
    function with_stray(): HardDrive {
        const drive = seed();
        drive.desktop = dir('desktop', ['stray'], { name: 'Desktop' });
        drive.stray = node('stray', {
            parent: 'desktop',
            storage_type: 'local',
            url: 'blob-1',
        });
        return drive;
    }

    const build_with = (drive: HardDrive, extra: string | null) =>
        build_library(drive, MY_MUSIC, NO_META, 'Unsorted', extra);

    it('is listed in its own group, named after the folder it came from', () => {
        const library = build_with(with_stray(), 'stray');

        expect(library.groups.map((g) => g.name)).toEqual(['Rock', 'Desktop']);
        expect(library.groups[1]?.key).toBe(EXTRA_GROUP_KEY);
        expect(library.flat.map((t) => t.title)).toEqual(['riff', 'stray']);
    });

    /*
     * THE CASE THAT SHIPS. Every bundled track lives inside My Music, so the
     * launched file is usually already in the library — and appending a group
     * for it would put a duplicate id in `flat`, sending prev/next to the
     * wrong place, or collide with an existing group key and throw
     * `each_key_duplicate`, which stops the whole list rendering.
     */
    it('is NOT duplicated when it is already in the library', () => {
        const library = build_with(with_stray(), 'riff');

        expect(library.groups.map((g) => g.name)).toEqual(['Rock']);
        expect(library.flat.map((t) => t.id)).toEqual(['riff']);
    });

    /*
     * The id is re-resolved on every rebuild rather than snapshotted, so
     * deleting the file removes it from the library — the player then stops,
     * exactly as it does for a library track (defect 1).
     */
    it('disappears when the file is deleted', () => {
        const drive = with_stray();
        delete drive.stray;

        expect(build_with(drive, 'stray').flat.map((t) => t.title)).toEqual([
            'riff',
        ]);
    });

    it('is ignored when it is not audio', () => {
        const drive = with_stray();
        drive.stray = node('stray', {
            parent: 'desktop',
            name: 'notes.txt',
            ext: '.txt',
        });

        expect(build_with(drive, 'stray').groups).toHaveLength(1);
    });

    it('falls back to the unsorted label when its folder is unresolvable', () => {
        const drive = with_stray();
        delete drive.desktop;

        expect(build_with(drive, 'stray').groups[1]?.name).toBe('Unsorted');
    });

    it('changes nothing when no file was handed over', () => {
        expect(build_with(with_stray(), null).groups).toHaveLength(1);
    });
});
