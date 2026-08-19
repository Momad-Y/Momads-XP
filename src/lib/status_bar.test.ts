import { describe, it, expect } from 'vitest';
import { format_size, status_info, total_size } from './status_bar';
import type { VfsItem } from './types';

function item(over: Partial<VfsItem> & { id: string }): VfsItem {
    return {
        type: 'file',
        name: over.id,
        basename: over.id,
        ext: '',
        children: [],
        date_created: 0,
        date_modified: 0,
        sort_option: 0,
        sort_order: 0,
        ...over,
    };
}

describe('format_size', () => {
    it('prints KB below a megabyte', () => {
        expect(format_size(512)).toBe('512 KB');
        expect(format_size(1023)).toBe('1023 KB');
    });

    it('switches to MB and GB', () => {
        expect(format_size(1024)).toBe('1.00 MB');
        expect(format_size(4034)).toBe('3.94 MB');
        expect(format_size(1024 * 1024)).toBe('1.00 GB');
    });

    it('rounds fractional KB', () => {
        expect(format_size(12.4)).toBe('12 KB');
    });

    it('rolls over at the unit boundary after rounding, not before', () => {
        // 1023.6 rounded is 1024 KB, which must read as 1.00 MB
        expect(format_size(1023.6)).toBe('1.00 MB');
        expect(format_size(1024 * 1024 - 1)).toBe('1.00 GB');
    });

    it('says "0 bytes" for empty, negative or non-finite sizes', () => {
        expect(format_size(0)).toBe('0 bytes');
        expect(format_size(-5)).toBe('0 bytes');
        expect(format_size(Number.NaN)).toBe('0 bytes');
    });
});

describe('total_size', () => {
    it('adds file sizes and ignores folders', () => {
        expect(
            total_size([
                item({ id: 'a', size: 10 }),
                item({ id: 'b', size: 5 }),
                item({ id: 'c', type: 'folder', size: 999 }),
            ]),
        ).toBe(15);
    });

    it('treats a missing size as zero', () => {
        expect(total_size([item({ id: 'a' })])).toBe(0);
    });

    it('one non-finite size does not poison the whole folder total', () => {
        expect(
            total_size([
                item({ id: 'a', size: 10 }),
                item({ id: 'b', size: Number.NaN }),
            ]),
        ).toBe(10);
    });

    it('is zero for an empty folder', () => {
        expect(total_size([])).toBe(0);
    });
});

describe('status_info', () => {
    const first = item({ id: 'a', size: 10 });
    const shown = [
        first,
        item({ id: 'b', size: 6 }),
        item({ id: 'c', type: 'folder' }),
    ];

    it('counts everything on show when nothing is selected', () => {
        expect(status_info(shown, [])).toEqual({
            objects: '3 objects',
            size: '16 KB',
        });
    });

    it('describes the selection once there is one', () => {
        expect(status_info(shown, [first])).toEqual({
            objects: '1 object selected',
            size: '10 KB',
        });
    });

    it('pluralises correctly', () => {
        expect(status_info([first], []).objects).toBe('1 object');
        expect(status_info(shown, shown.slice(0, 2)).objects).toBe(
            '2 objects selected',
        );
    });

    it('reports an empty folder as 0 objects with a blank size', () => {
        expect(status_info([], [])).toEqual({ objects: '0 objects', size: '' });
    });

    it('leaves the size BLANK for a container-only selection', () => {
        // "0 bytes" for a 26 GB drive is a false statement, not a missing one
        const drive = item({ id: 'c', type: 'drive', capacity: 26_214_400 });
        expect(status_info([drive], [drive])).toEqual({
            objects: '1 object selected',
            size: '',
        });
        const folder = item({ id: 'd', type: 'folder' });
        expect(status_info([folder], []).size).toBe('');
    });
});
