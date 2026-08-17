/**
 * Explorer's status bar text (XP's "View > Status Bar").
 *
 * XP shows the object count on the left and the size of what is being counted
 * on the right — and both switch to describing the SELECTION the moment one
 * exists. Folders never contribute to the size, only files do.
 */
import type { VfsItem } from './types';

export interface StatusInfo {
    /** Left pane, e.g. `5 objects` / `2 objects selected`. */
    objects: string;
    /** Right pane, e.g. `3.94 MB`. */
    size: string;
}

/** KB → the shortest unit XP would print it in. */
export function format_size(kb: number): string {
    if (!Number.isFinite(kb) || kb <= 0) return '0 bytes';
    if (kb < 1024) return `${String(Math.round(kb))} KB`;
    const mb = kb / 1024;
    if (mb < 1024) return `${mb.toFixed(2)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
}

/** Sum of the FILE sizes in a list, in KB. */
export function total_size(items: readonly VfsItem[]): number {
    return items.reduce(
        (sum, it) => sum + (it.type === 'file' ? (it.size ?? 0) : 0),
        0,
    );
}

function plural(count: number): string {
    return `${String(count)} object${count === 1 ? '' : 's'}`;
}

/**
 * `selected` is expected to already be filtered to items this window shows —
 * `selectingItems` is one global store shared with the desktop, so a status
 * bar fed the raw store would count another window's selection.
 */
export function status_info(
    shown: readonly VfsItem[],
    selected: readonly VfsItem[],
): StatusInfo {
    if (selected.length > 0) {
        return {
            objects: `${plural(selected.length)} selected`,
            size: format_size(total_size(selected)),
        };
    }
    return {
        objects: plural(shown.length),
        size: format_size(total_size(shown)),
    };
}
