/**
 * The columns of Explorer's Details view, and the rules behind XP's
 * "View > Choose Details..." dialog.
 *
 * Kept out of the component so the column set, the cell text and the
 * show/hide rules are unit-testable — the viewer only renders what these
 * return. `Name` is deliberately not optional: XP greys its checkbox because
 * a list with no name column is unusable.
 */
import type { VfsItem } from './types';

export type DetailsColumnKey =
    'name' | 'size' | 'type' | 'date_modified' | 'date_created';

export interface DetailsColumn {
    key: DetailsColumnKey;
    label: string;
    /** Fixed width in px. `name` is the flexible column and has none. */
    width?: number;
    align?: 'left' | 'right';
}

/**
 * Canonical order — XP always renders the columns in this order regardless of
 * the order they were ticked in, so every helper here normalises back to it.
 */
export const details_columns: readonly DetailsColumn[] = [
    { key: 'name', label: 'Name' },
    { key: 'size', label: 'Size', width: 70, align: 'right' },
    { key: 'type', label: 'Type', width: 90 },
    { key: 'date_modified', label: 'Date Modified', width: 120 },
    { key: 'date_created', label: 'Date Created', width: 120 },
];

/** XP's out-of-the-box selection for a file folder. */
export const default_details_columns: readonly DetailsColumnKey[] = [
    'name',
    'size',
    'type',
    'date_modified',
];

/** "File Folder" / "Local Disk" / "PDF File" — the Type cell. */
export function type_label(item: VfsItem): string {
    if (item.type === 'folder') return 'File Folder';
    if (item.type === 'drive') return 'Local Disk';
    if (item.type === 'removable_storage') return 'Removable Disk';
    return item.ext !== '' ? `${item.ext.slice(1).toUpperCase()} File` : 'File';
}

/** The Size cell. Folders show nothing, exactly like XP. */
export function size_label(item: VfsItem): string {
    if (item.type !== 'file') return '';
    return `${String(item.size ?? 0)} KB`;
}

/**
 * `8/16/2026 3:04 PM`. Hand-rolled rather than `toLocaleString` so the text is
 * identical in every locale the site is opened in — E2E asserts exact strings.
 */
export function date_label(ms: number | undefined): string {
    if (ms == null || !Number.isFinite(ms) || ms <= 0) return '';
    const d = new Date(ms);
    const hours = d.getHours();
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const meridiem = hours < 12 ? 'AM' : 'PM';
    return `${String(d.getMonth() + 1)}/${String(d.getDate())}/${String(
        d.getFullYear(),
    )} ${String(hour12)}:${minutes} ${meridiem}`;
}

/** The text of one cell. */
export function column_value(item: VfsItem, key: DetailsColumnKey): string {
    switch (key) {
        case 'name':
            return item.name;
        case 'size':
            return size_label(item);
        case 'type':
            return type_label(item);
        case 'date_modified':
            return date_label(item.date_modified);
        case 'date_created':
            return date_label(item.date_created);
    }
}

/**
 * Ticking/unticking one checkbox in Choose Details, immutably. Returns a NEW
 * array in canonical order; `Name` can never be removed and is re-added if a
 * caller hands us a set without it.
 */
export function toggle_column(
    visible: readonly DetailsColumnKey[],
    key: DetailsColumnKey,
): DetailsColumnKey[] {
    const next = visible.includes(key)
        ? visible.filter((k) => k !== key)
        : [...visible, key];
    return normalize_columns(next);
}

/** Canonical order + a guaranteed `name`, without mutating the input. */
export function normalize_columns(
    visible: readonly DetailsColumnKey[],
): DetailsColumnKey[] {
    const wanted = new Set<DetailsColumnKey>(visible);
    wanted.add('name');
    return details_columns.map((c) => c.key).filter((key) => wanted.has(key));
}

/** The column descriptors to render, in canonical order. */
export function visible_columns(
    visible: readonly DetailsColumnKey[],
): DetailsColumn[] {
    const wanted = new Set<DetailsColumnKey>(normalize_columns(visible));
    return details_columns.filter((c) => wanted.has(c.key));
}
