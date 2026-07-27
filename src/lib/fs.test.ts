import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import { hardDrive } from './store';
import type { HardDrive, VfsItem } from './types';

const folder = (id: string, children: string[] = []): VfsItem => ({
    id,
    type: 'folder',
    name: id,
    basename: id,
    ext: '',
    children,
    date_created: 0,
    date_modified: 0,
    sort_option: 0,
    sort_order: 0,
});

const seed = (): HardDrive => ({ desktop: folder('desktop') });

// fs.ts transitively imports finder.ts, which snapshots the drive store at
// module load — seed the store BEFORE the dynamic import.
let fs: typeof import('./fs');

beforeAll(async () => {
    hardDrive.set(seed());
    fs = await import('./fs');
});

beforeEach(() => {
    hardDrive.set(seed());
});

describe('extension normalization (XP is case-insensitive)', () => {
    it('new_fs_item_raw lowercases the stored ext, name keeps it consistent', async () => {
        const id = await fs.new_fs_item_raw(
            { basename: 'PHOTO', ext: '.PNG' },
            'desktop',
        );
        const item = get(hardDrive)?.[id ?? ''];
        expect(item?.ext).toBe('.png');
        expect(item?.name).toBe('PHOTO.png');
    });

    it('new_fs_item lowercases the ext for created items', async () => {
        const id = await fs.new_fs_item('folder', '.WEIRD', 'Stuff', 'desktop');
        const item = get(hardDrive)?.[id ?? ''];
        expect(item?.ext).toBe('.weird');
    });

    it('defaults a missing ext to empty string', async () => {
        const id = await fs.new_fs_item_raw({ basename: 'plain' }, 'desktop');
        expect(get(hardDrive)?.[id ?? '']?.ext).toBe('');
    });
});
