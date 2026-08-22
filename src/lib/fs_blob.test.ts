import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Uploaded files keep their bytes in IndexedDB under `item.url`. Nothing ever
 * released them — `idb.del` was not called anywhere in `src/` — so deleting an
 * upload leaked its bytes forever, and once the origin hit quota every drive
 * write rejected and the visitor's files vanished on reload.
 *
 * The reference check is the part that has to be right: recycling CLONES an
 * item and the clone keeps the SAME `url`, so the bytes must survive until the
 * last item pointing at them is gone.
 */
const del = vi.fn(() => Promise.resolve());
vi.mock('idb-keyval', () => ({
    get: vi.fn(() => Promise.resolve(undefined)),
    set: vi.fn(() => Promise.resolve()),
    del,
}));

import { get as store_get } from 'svelte/store';
import { hardDrive } from './store';
import type { HardDrive, VfsItem } from './types';

function node(id: string, over: Partial<VfsItem> = {}): VfsItem {
    return {
        id,
        type: 'file',
        name: id + '.txt',
        basename: id,
        ext: '.txt',
        children: [],
        parent: 'root',
        date_created: 0,
        date_modified: 0,
        sort_option: 0,
        sort_order: 0,
        ...over,
    };
}

const drive: HardDrive = {
    root: node('root', { type: 'folder', parent: undefined, children: ['up'] }),
    up: node('up', { storage_type: 'local', url: 'blob-key-1' }),
};

hardDrive.set(structuredClone(drive));
const fs = await import('./fs');

beforeEach(() => {
    hardDrive.set(structuredClone(drive));
    del.mockClear();
});

describe('free_blob', () => {
    it('releases an upload’s bytes when the last reference goes', () => {
        fs.del_fs('up');
        expect(del).toHaveBeenCalledWith('blob-key-1');
    });

    it('KEEPS the bytes while a recycled clone still points at them', () => {
        // this is what recycling does: clone first, then delete the original
        hardDrive.update((d) => {
            if (d != null) {
                d['binned'] = node('binned', {
                    storage_type: 'local',
                    url: 'blob-key-1',
                    parent: 'root',
                });
            }
            return d;
        });
        fs.del_fs('up');
        expect(del).not.toHaveBeenCalled();
        expect(store_get(hardDrive)?.['binned']).toBeDefined();

        // …and released once that clone is emptied from the bin too
        fs.del_fs('binned');
        expect(del).toHaveBeenCalledWith('blob-key-1');
    });

    it('does not touch storage for a seeded item, which owns no blob', () => {
        hardDrive.update((d) => {
            if (d != null) {
                d['seeded'] = node('seeded', {
                    storage_type: 'remote',
                    url: 'https://example.com/x.txt',
                    parent: 'root',
                });
            }
            return d;
        });
        fs.del_fs('seeded');
        expect(del).not.toHaveBeenCalled();
    });
});
