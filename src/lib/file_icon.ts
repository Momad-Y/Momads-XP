/**
 * One resolver for "which icon does this VFS item show".
 *
 * This logic was copy-pasted into six components and had already drifted —
 * my_computer's copy grew a Recycle Bin branch the other five never got. The
 * shared version is the superset, so no call site loses a case.
 */
import { icons, recycle_bin_id } from './system';
import type { VfsItem } from './types';

/**
 * Returns a CSS `url(...)` value, or null when the item has no icon of its own
 * and no registered one for its extension (callers fall back to their own
 * default, e.g. a generic folder or file glyph).
 */
export function file_icon_url(item: VfsItem | null | undefined): string | null {
    if (item == null) return null;
    if (item.icon != null && item.icon !== '') {
        return `url(${item.icon})`;
    }
    // lowercase to match how `doctypes` is looked up when OPENING a file, so
    // an item can never be openable-but-iconless
    const registered = icons[item.ext.toLowerCase()];
    if (registered != null && registered !== '') {
        return `url(/images/xp/icons/${registered})`;
    }
    if (item.id === recycle_bin_id) {
        return 'url(/images/xp/icons/RecycleBinempty.png)';
    }
    return null;
}
