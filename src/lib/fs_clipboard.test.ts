import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Cut/Copy are the other two consumers of the global `selectingItems` store.
 * They read it raw, so a cut started in one Explorer carried another window's
 * — or the desktop's — items, and paste MOVES them.
 */
import { get } from 'svelte/store';
import { clipboard, clipboard_op, hardDrive, selectingItems } from './store';
import type { HardDrive, VfsItem } from './types';

function node(id: string): VfsItem {
    return {
        id,
        type: 'file',
        name: id + '.txt',
        basename: id,
        ext: '.txt',
        children: [],
        parent: 'folder_a',
        date_created: 0,
        date_modified: 0,
        sort_option: 0,
        sort_order: 0,
    };
}

const drive: HardDrive = {
    here: node('here'),
    elsewhere: node('elsewhere'),
};

// finder.ts snapshots the drive at MODULE level, so seed before importing fs
hardDrive.set(structuredClone(drive));
const fs = await import('./fs');

beforeEach(() => {
    hardDrive.set(structuredClone(drive));
    clipboard.set([]);
    selectingItems.set(['here', 'elsewhere']);
});

describe('cut/copy are scoped to the acting surface', () => {
    it('copy takes only what this window is showing', () => {
        fs.copy(['here']);
        expect(get(clipboard)).toEqual(['here']);
        expect(get(clipboard_op)).toBe('copy');
    });

    it('cut takes only what this window is showing', () => {
        fs.cut(['here']);
        // 'elsewhere' belongs to another surface; paste would have MOVED it
        expect(get(clipboard)).toEqual(['here']);
        expect(get(clipboard_op)).toBe('cut');
    });

    it('keeps the whole selection when the surface shows all of it', () => {
        fs.copy(['here', 'elsewhere']);
        expect(get(clipboard)).toEqual(['here', 'elsewhere']);
    });

    it('fails CLOSED on a null scope rather than grabbing everything', () => {
        fs.cut(null);
        expect(get(clipboard)).toEqual([]);
    });

    it('an empty scope clips nothing', () => {
        fs.copy([]);
        expect(get(clipboard)).toEqual([]);
    });

    // Three surfaces bind window keydown, so ONE Ctrl+C can reach two
    // handlers. Each writes its own scope, so the one that legitimately
    // narrows to nothing must not destroy what the other just copied.
    it('an empty narrowing LEAVES an existing clipboard alone', () => {
        fs.copy(['here']);
        expect(get(clipboard)).toEqual(['here']);

        // the other surface fires for the same keypress and sees none of it
        fs.copy(['somewhere_else']);
        expect(get(clipboard)).toEqual(['here']);
        expect(get(clipboard_op)).toBe('copy');
    });

    it('an empty narrowing does not flip the pending operation either', () => {
        fs.cut(['here']);
        expect(get(clipboard_op)).toBe('cut');

        fs.copy(['somewhere_else']);
        // a stray copy must not turn a pending CUT into a copy
        expect(get(clipboard_op)).toBe('cut');
        expect(get(clipboard)).toEqual(['here']);
    });
});
