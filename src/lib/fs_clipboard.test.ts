import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Cut/Copy are the other two consumers of the global `selectingItems` store.
 * They read it raw, so a cut started in one Explorer carried another window's
 * — or the desktop's — items, and paste MOVES them.
 */
import { get } from 'svelte/store';
import { clipboard, clipboard_op, hardDrive, selectingItems } from './store';
import { protected_items } from './system';
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
    // no `parent` on the folders: node() defaults every item's parent to
    // 'folder_a', which would make folder_a its own parent and send the clone
    // walk into an infinite loop
    folder_a: {
        ...node('folder_a'),
        type: 'folder',
        parent: undefined,
        children: ['here', 'elsewhere'],
    },
    folder_b: {
        ...node('folder_b'),
        type: 'folder',
        parent: undefined,
        children: [],
    },
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

describe('a cut CONSUMES the clipboard', () => {
    it('clears the clipboard after a cut+paste, so Paste stops being offered', () => {
        selectingItems.set(['here']);
        fs.cut(['here']);
        expect(get(clipboard)).toEqual(['here']);

        fs.paste('folder_b');
        // the ids are gone — leaving them behind kept Paste enabled on every
        // void menu, and clicking it threw required() on a deleted id
        expect(get(clipboard)).toEqual([]);
        expect(get(clipboard_op)).toBe('copy');
    });

    it('a COPY stays on the clipboard, as in Windows', () => {
        selectingItems.set(['here']);
        fs.copy(['here']);
        fs.paste('folder_b');
        expect(get(clipboard)).toEqual(['here']);
    });

    it('skips an id another window already deleted instead of throwing', () => {
        selectingItems.set(['here', 'elsewhere']);
        fs.copy(['here', 'elsewhere']);
        // 'elsewhere' disappears between filling the clipboard and pasting
        hardDrive.update((d) => {
            if (d != null) delete d['elsewhere'];
            return d;
        });
        expect(() => {
            fs.paste('folder_b');
        }).not.toThrow();
    });
});

describe('cut refuses protected items', () => {
    it('drops them, so Ctrl+X/Ctrl+V cannot clone the portfolio tree', () => {
        // del_fs silently no-ops on protected ids, so a cut that kept them
        // cloned the tree and left the original in place, once per repeat
        const protected_id = protected_items[0] ?? '';
        expect(protected_id).not.toBe('');
        selectingItems.set([protected_id, 'here']);
        fs.cut([protected_id, 'here']);
        expect(get(clipboard)).toEqual(['here']);
    });

    it('a cut of ONLY protected items writes nothing at all', () => {
        fs.copy(['here']); // something already on the clipboard
        const protected_id = protected_items[0] ?? '';
        selectingItems.set([protected_id]);
        fs.cut([protected_id]);
        expect(get(clipboard)).toEqual(['here']);
        expect(get(clipboard_op)).toBe('copy');
    });
});
