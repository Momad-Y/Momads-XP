import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Recycling and restoring.
 *
 * The Recycle Bin could only ever be EMPTIED — there was no way back out of
 * it, which is the one verb everybody expects it to have. These cover the way
 * back, and in particular the target resolution: the folder an item came from
 * may itself have been deleted, in which case it has to be brought back first.
 */
const del = vi.fn(() => Promise.resolve());
vi.mock('idb-keyval', () => ({
    get: vi.fn(() => Promise.resolve(undefined)),
    set: vi.fn(() => Promise.resolve()),
    del,
}));

import { get } from 'svelte/store';
import { hardDrive } from './store';
import {
    recycle_bin_id,
    desktop_folder,
    my_cv_desktop_exe,
    protected_items,
} from './system';
import { readFileSync } from 'node:fs';
import { RESUME_FILE_ID } from './generated/vfs_ids';
import { DOCUMENTS_FOLDER_ID } from './portfolio_sections';
import { to_hard_drive } from './types';
import type { HardDrive, VfsItem } from './types';

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

/** `my-music > genre > song`, plus the bin and the desktop. */
function seed(): HardDrive {
    return {
        [recycle_bin_id]: dir(recycle_bin_id, []),
        [desktop_folder]: dir(desktop_folder, []),
        'my-music': dir('my-music', ['genre']),
        genre: dir('genre', ['song'], { parent: 'my-music' }),
        song: node('song', {
            parent: 'genre',
            storage_type: 'remote',
            url: '/a.mp3',
        }),
    };
}

let fs: typeof import('./fs');

// fs.ts transitively imports finder.ts, which snapshots the drive store at
// module load — seed the store BEFORE the dynamic import.
beforeAll(async () => {
    hardDrive.set(seed());
    fs = await import('./fs');
});

beforeEach(() => {
    hardDrive.set(seed());
    del.mockClear();
});

const drive = (): HardDrive => get(hardDrive) ?? {};
const bin_children = () => drive()[recycle_bin_id]?.children ?? [];
const only_bin_child = () => {
    const id = bin_children()[0];
    expect(id).toBeDefined();
    return drive()[id ?? ''];
};

describe('recycle_fs', () => {
    it('moves the item into the bin and out of its folder', () => {
        fs.recycle_fs('song');

        expect(drive().song).toBeUndefined();
        expect(drive().genre?.children).not.toContain('song');
        expect(bin_children()).toHaveLength(1);
        expect(only_bin_child()?.name).toBe('song.mp3');
    });

    it('records where the item came from, and what it was called', () => {
        fs.recycle_fs('song');

        const clone = only_bin_child();
        expect(clone?.restore_id).toBe('song');
        expect(clone?.restore_parent).toBe('genre');
        expect(clone?.restore_name).toBe('song.mp3');
    });

    /*
     * `clone_fs` has no such guard of its own; today the only thing stopping a
     * protected item being recycled is that each delete surface filters them
     * out first. `fs.ts` records what happened the last time a path skipped
     * that filter: Ctrl+X then Ctrl+V cloned the whole portfolio tree and left
     * the original in place, because `del_fs` no-ops on protected ids while
     * `clone_fs` does not.
     */
    it('refuses to recycle a protected item', () => {
        const guarded = protected_items[0];
        expect(guarded).toBeDefined();
        hardDrive.update((d) => ({
            ...(d ?? {}),
            [guarded ?? '']: node(guarded ?? '', { parent: 'my-music' }),
        }));

        fs.recycle_fs(guarded ?? '');

        expect(drive()[guarded ?? '']).toBeDefined();
        expect(bin_children()).toHaveLength(0);
    });
});

describe('restore_fs', () => {
    it('puts the item back in the folder it came from', () => {
        fs.recycle_fs('song');
        const restored = fs.restore_fs(bin_children()[0] ?? '');

        expect(restored).toBeDefined();
        expect(drive()[restored ?? '']?.parent).toBe('genre');
        expect(drive().genre?.children).toContain(restored);
        expect(bin_children()).toHaveLength(0);
    });

    it('restores under the ORIGINAL name, not the one the bin gave it', () => {
        // Two songs of the same name, so the second clone is deduped on its
        // way into the bin.
        hardDrive.update((d) => {
            const data = d ?? {};
            return {
                ...data,
                other: node('other', {
                    parent: 'my-music',
                    name: 'song.mp3',
                    basename: 'song',
                }),
                'my-music': dir('my-music', ['genre', 'other']),
            };
        });
        fs.recycle_fs('song');
        fs.recycle_fs('other');

        const second = bin_children()[1] ?? '';
        expect(drive()[second]?.name).toBe('song 2.mp3');

        const restored = fs.restore_fs(second);
        expect(drive()[restored ?? '']?.name).toBe('song.mp3');
    });

    it('does not carry the breadcrumbs back out of the bin', () => {
        fs.recycle_fs('song');
        const restored = fs.restore_fs(bin_children()[0] ?? '') ?? '';

        expect(drive()[restored]?.restore_id).toBeUndefined();
        expect(drive()[restored]?.restore_parent).toBeUndefined();
        expect(drive()[restored]?.restore_name).toBeUndefined();
    });

    /*
     * The case the owner picked: the genre folder was deleted after the song
     * was, so restoring the song has to bring the folder back first. Its clone
     * is still in the bin, so the folder comes back with its own icon and
     * dates rather than as a fabricated lookalike.
     */
    it('recreates the original folder from its own bin clone', () => {
        fs.recycle_fs('song');
        fs.recycle_fs('genre');
        expect(bin_children()).toHaveLength(2);

        const song_clone = bin_children()[0] ?? '';
        const restored = fs.restore_fs(song_clone) ?? '';

        const parent_id = drive()[restored]?.parent ?? '';
        const parent = drive()[parent_id];
        expect(parent?.name).toBe('genre');
        expect(parent?.parent).toBe('my-music');
        expect(parent?.children).toContain(restored);
        // Both the song and its folder have left the bin.
        expect(bin_children()).toHaveLength(0);
    });

    it('falls back to the Desktop when the folder is gone for good', () => {
        fs.recycle_fs('song');
        const clone = bin_children()[0] ?? '';
        // The folder is destroyed outright rather than recycled, so no clone
        // of it survives to be restored.
        fs.del_fs('genre');

        const restored = fs.restore_fs(clone) ?? '';
        expect(drive()[restored]?.parent).toBe(desktop_folder);
        expect(drive()[desktop_folder]?.children).toContain(restored);
    });

    it('restores a folder with everything inside it', () => {
        fs.recycle_fs('genre');
        const restored = fs.restore_fs(bin_children()[0] ?? '') ?? '';

        const children = drive()[restored]?.children ?? [];
        expect(children).toHaveLength(1);
        expect(drive()[children[0] ?? '']?.name).toBe('song.mp3');
    });

    it('is a no-op for an id that is not there', () => {
        expect(fs.restore_fs('nope')).toBeUndefined();
    });
});

describe('restoring an upload keeps its bytes', () => {
    /*
     * `del_fs` releases an upload's IndexedDB bytes once no item references
     * its key. Restoring deletes the bin clone, so the restored copy has to
     * exist FIRST — otherwise the last reference disappears and restore hands
     * back an item whose bytes were freed on the way out.
     */
    it('does not release the blob when the item comes back', () => {
        hardDrive.set({
            ...seed(),
            song: node('song', {
                parent: 'genre',
                storage_type: 'local',
                url: 'blob-key-1',
            }),
        });

        fs.recycle_fs('song');
        expect(del).not.toHaveBeenCalled();

        fs.restore_fs(bin_children()[0] ?? '');
        expect(del).not.toHaveBeenCalled();
    });

    it('releases it when the bin entry is destroyed instead', () => {
        hardDrive.set({
            ...seed(),
            song: node('song', {
                parent: 'genre',
                storage_type: 'local',
                url: 'blob-key-1',
            }),
        });

        fs.recycle_fs('song');
        fs.del_fs(bin_children()[0] ?? '');
        expect(del).toHaveBeenCalledWith('blob-key-1');
    });
});

describe('restore_origin_known', () => {
    it('is true for an entry recycled the normal way', () => {
        fs.recycle_fs('song');
        expect(fs.restore_origin_known(bin_children()[0] ?? '')).toBe(true);
    });

    /*
     * The reported bug. Before `recycle_fs` existed, deleting was a plain
     * clone into the bin, so entries from back then carry no breadcrumbs at
     * all. They can only land on the Desktop — and the menu asks first rather
     * than doing it silently.
     */
    it('is false for a legacy entry with no breadcrumbs', () => {
        fs.recycle_fs('song');
        const clone_id = bin_children()[0] ?? '';
        hardDrive.update((d) => {
            const data = d ?? {};
            const clone = data[clone_id];
            if (clone == null) return data;
            const stripped = { ...clone };
            delete stripped.restore_id;
            delete stripped.restore_parent;
            delete stripped.restore_name;
            return { ...data, [clone_id]: stripped };
        });

        expect(fs.restore_origin_known(clone_id)).toBe(false);
    });

    it('is true when the folder is gone but its own clone is in the bin', () => {
        fs.recycle_fs('song');
        fs.recycle_fs('genre');
        expect(fs.restore_origin_known(bin_children()[0] ?? '')).toBe(true);
    });

    it('is false when the folder was destroyed outright', () => {
        fs.recycle_fs('song');
        const clone_id = bin_children()[0] ?? '';
        fs.del_fs('genre');
        expect(fs.restore_origin_known(clone_id)).toBe(false);
    });

    it('is false for an id that is not there', () => {
        expect(fs.restore_origin_known('nope')).toBe(false);
    });

    /* The predicate must agree with what restoring actually does. */
    it('agrees with where the restore lands', () => {
        fs.recycle_fs('song');
        const clone_id = bin_children()[0] ?? '';
        expect(fs.restore_origin_known(clone_id)).toBe(true);
        const restored = fs.restore_fs(clone_id) ?? '';
        expect(drive()[restored]?.parent).toBe('genre');
        expect(drive()[restored]?.parent).not.toBe(desktop_folder);
    });
});

/*
 * WHAT THE VISITOR MAY NOT DELETE.
 *
 * Stated as a list rather than left to whoever edits `protected_items` next.
 * The rule the owner set: the portfolio IS the product, so the entry text and
 * the résumé are his; everything else — the gallery pictures, the certificate
 * PDFs, the other desktop shortcuts — is the visitor's to bin, because those
 * are copies and deleting one costs nothing.
 *
 * The CV was NOT on this list until he asked for it, which meant the one
 * document the whole site exists to hand over could be dragged to the bin —
 * and the re-seed tombstone pass would then keep it deleted forever after.
 */
describe('what protection covers', () => {
    const drive_seed = to_hard_drive(
        JSON.parse(readFileSync('static/json/hard_drive.json', 'utf-8')),
    );
    const guarded = new Set(protected_items);
    const name_of = (id: string): string => drive_seed[id]?.name ?? id;

    it('protects the CV — the file and the desktop icon that opens it', () => {
        for (const id of [RESUME_FILE_ID, my_cv_desktop_exe]) {
            expect(drive_seed[id], `${id} is not in the seed`).toBeDefined();
            expect(guarded.has(id), `${name_of(id)} is deletable`).toBe(true);
        }
    });

    it('protects every portfolio entry and folder', () => {
        const entries = Object.values(drive_seed).filter(
            (i) => i.portfolio_ref != null,
        );
        expect(entries.length).toBeGreaterThan(20);
        for (const entry of entries) {
            expect(guarded.has(entry.id), entry.name).toBe(true);
        }
    });

    it('leaves the visitor their own copies to delete', () => {
        // pictures and credential PDFs are seeded COPIES of assets the entry
        // text renders from profile.json regardless — binning one loses the
        // visitor nothing, and pretending otherwise would make My Pictures a
        // read-only museum
        const deletable = Object.values(drive_seed).filter(
            (i) =>
                (i.id.startsWith('pic') || i.id.startsWith('doc')) &&
                i.id !== DOCUMENTS_FOLDER_ID,
        );
        expect(deletable.length).toBeGreaterThan(50);
        for (const item of deletable) {
            expect(guarded.has(item.id), item.name).toBe(false);
        }
    });
});
