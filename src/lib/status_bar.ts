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

/**
 * KB → the shortest unit XP would print it in.
 *
 * Rounds BEFORE choosing the unit: comparing the unrounded value while
 * printing the rounded one made 1023.6 KB render as "1024 KB" instead of
 * rolling over to 1.00 MB.
 */
export function format_size(kb: number): string {
    if (!Number.isFinite(kb) || kb <= 0) return '0 bytes';
    const whole_kb = Math.round(kb);
    if (whole_kb < 1024) return `${String(whole_kb)} KB`;
    const mb = whole_kb / 1024;
    if (Math.round(mb * 100) / 100 < 1024) return `${mb.toFixed(2)} MB`;
    return `${(mb / 1024).toFixed(2)} GB`;
}

/**
 * Sum of the FILE sizes in a list, in KB. A non-finite `size` on one item
 * contributes 0 rather than turning the whole folder's total into NaN, which
 * rendered as "0 bytes" and hid every other file in the folder.
 */
export function total_size(items: readonly VfsItem[]): number {
    return items.reduce((sum, it) => {
        if (it.type !== 'file') return sum;
        const size = it.size ?? 0;
        return sum + (Number.isFinite(size) ? size : 0);
    }, 0);
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
    const counted = selected.length > 0 ? selected : shown;
    return {
        objects:
            selected.length > 0
                ? `${plural(selected.length)} selected`
                : plural(shown.length),
        // A container has no size of its own, so a folder- or drive-only
        // selection gets a BLANK pane, as XP does. Printing "0 bytes" for a
        // 26 GB drive was a false statement sitting in the same pane that
        // correctly reads "3.94 MB" elsewhere.
        size: counted.some((it) => it.type === 'file')
            ? format_size(total_size(counted))
            : '',
    };
}
