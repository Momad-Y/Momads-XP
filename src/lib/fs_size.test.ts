import { describe, it, expect } from 'vitest';
import { folder_size, drive_item } from './fs_size';
import type { HardDrive, VfsItem } from './types';

function node(
    id: string,
    type: VfsItem['type'],
    children: string[] = [],
    size?: number,
): VfsItem {
    return {
        id,
        type,
        name: id,
        basename: id,
        ext: '',
        children,
        date_created: 0,
        date_modified: 0,
        sort_option: 0,
        sort_order: 0,
        ...(size != null ? { size } : {}),
    };
}

const drive: HardDrive = {
    root: node('root', 'folder', ['a', 'sub', 'ghost']),
    a: node('a', 'file', [], 10),
    sub: node('sub', 'folder', ['b', 'deep']),
    b: node('b', 'file', [], 5),
    deep: node('deep', 'folder', ['c']),
    c: node('c', 'file', [], 2),
    // 'ghost' is referenced by root but missing from the drive
};

describe('folder_size', () => {
    it('sums files recursively through nested folders', () => {
        expect(folder_size(drive, 'root')).toBe(17);
        expect(folder_size(drive, 'sub')).toBe(7);
        expect(folder_size(drive, 'deep')).toBe(2);
    });

    it('counts an empty folder as zero', () => {
        expect(folder_size({ e: node('e', 'folder') }, 'e')).toBe(0);
    });

    it('treats a file with no recorded size as zero rather than NaN', () => {
        const d: HardDrive = {
            f: node('f', 'folder', ['x']),
            x: node('x', 'file'),
        };
        expect(folder_size(d, 'f')).toBe(0);
    });

    // a cached drive can carry ids that no longer resolve; the old copies
    // would throw on those
    it('skips dangling child ids instead of throwing', () => {
        expect(() => folder_size(drive, 'root')).not.toThrow();
    });

    it('returns zero for an unknown id', () => {
        expect(folder_size(drive, 'nope')).toBe(0);
    });
});

describe('drive_item', () => {
    it('returns the item', () => {
        expect(drive_item(drive, 'a').id).toBe('a');
    });

    it('throws for a missing id, as the dialogs relied on', () => {
        expect(() => drive_item(drive, 'nope')).toThrow();
    });
});
