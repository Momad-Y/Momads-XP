import { describe, it, expect } from 'vitest';
import {
    column_value,
    date_label,
    default_details_columns,
    details_columns,
    normalize_columns,
    size_label,
    toggle_column,
    type_label,
    visible_columns,
} from './details_columns';
import type { DetailsColumnKey } from './details_columns';
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

describe('type_label', () => {
    it('names each container kind the way XP does', () => {
        expect(type_label(item({ id: 'a', type: 'folder' }))).toBe(
            'File Folder',
        );
        expect(type_label(item({ id: 'b', type: 'drive' }))).toBe('Local Disk');
        expect(type_label(item({ id: 'c', type: 'removable_storage' }))).toBe(
            'Removable Disk',
        );
    });

    it('uppercases the extension for files', () => {
        expect(type_label(item({ id: 'd', ext: '.pdf' }))).toBe('PDF File');
    });

    it('falls back to "File" when there is no extension', () => {
        expect(type_label(item({ id: 'e' }))).toBe('File');
    });
});

describe('size_label', () => {
    it('shows KB for files', () => {
        expect(size_label(item({ id: 'a', size: 12 }))).toBe('12 KB');
    });

    it('treats a missing size as zero', () => {
        expect(size_label(item({ id: 'b' }))).toBe('0 KB');
    });

    it('shows nothing for folders', () => {
        expect(size_label(item({ id: 'c', type: 'folder', size: 9 }))).toBe('');
    });
});

describe('date_label', () => {
    it('formats as XP does, locale-independently', () => {
        // built from local parts so the assertion holds in any TZ
        const d = new Date(2026, 7, 16, 15, 4);
        expect(date_label(d.getTime())).toBe('8/16/2026 3:04 PM');
    });

    it('uses 12 rather than 0 for midnight', () => {
        const d = new Date(2026, 0, 2, 0, 7);
        expect(date_label(d.getTime())).toBe('1/2/2026 12:07 AM');
    });

    it('is blank for unset/invalid stamps', () => {
        expect(date_label(0)).toBe('');
        expect(date_label(undefined)).toBe('');
        expect(date_label(Number.NaN)).toBe('');
        expect(date_label(-1)).toBe('');
    });
});

describe('column_value', () => {
    const it_ = item({
        id: 'x',
        name: 'notes.txt',
        ext: '.txt',
        size: 3,
        date_modified: new Date(2026, 7, 16, 15, 4).getTime(),
        date_created: new Date(2026, 7, 1, 9, 30).getTime(),
    });

    it('renders every column', () => {
        expect(column_value(it_, 'name')).toBe('notes.txt');
        expect(column_value(it_, 'size')).toBe('3 KB');
        expect(column_value(it_, 'type')).toBe('TXT File');
        expect(column_value(it_, 'date_modified')).toBe('8/16/2026 3:04 PM');
        expect(column_value(it_, 'date_created')).toBe('8/1/2026 9:30 AM');
    });
});

describe('toggle_column', () => {
    it('adds a column in canonical order, not append order', () => {
        expect(toggle_column(['name', 'type'], 'size')).toEqual([
            'name',
            'size',
            'type',
        ]);
    });

    it('removes a ticked column', () => {
        expect(toggle_column(['name', 'size', 'type'], 'size')).toEqual([
            'name',
            'type',
        ]);
    });

    it('never removes Name — XP greys that checkbox', () => {
        expect(toggle_column(['name', 'size'], 'name')).toEqual([
            'name',
            'size',
        ]);
    });

    it('does not mutate the array it was given', () => {
        const before: DetailsColumnKey[] = ['name', 'size'];
        const after = toggle_column(before, 'type');
        expect(before).toEqual(['name', 'size']);
        expect(after).not.toBe(before);
    });
});

describe('normalize_columns', () => {
    it('re-adds a missing Name', () => {
        expect(normalize_columns(['type'])).toEqual(['name', 'type']);
    });

    it('drops duplicates and re-orders', () => {
        expect(
            normalize_columns(['date_created', 'size', 'size', 'name']),
        ).toEqual(['name', 'size', 'date_created']);
    });
});

describe('visible_columns', () => {
    it('returns the descriptors for the ticked keys, in order', () => {
        expect(visible_columns(['type', 'name']).map((c) => c.label)).toEqual([
            'Name',
            'Type',
        ]);
    });

    it('defaults match XP: Name, Size, Type, Date Modified', () => {
        expect(visible_columns(default_details_columns).map((c) => c.label)) //
            .toEqual(['Name', 'Size', 'Type', 'Date Modified']);
    });

    it('every declared column has a label and only Name flexes', () => {
        for (const col of details_columns) {
            expect(col.label.length).toBeGreaterThan(0);
            expect(col.width == null).toBe(col.key === 'name');
        }
    });
});
