/**
 * Recursive folder size, shared by the file and disk Properties dialogs.
 *
 * Both had a byte-identical private copy (one of them carrying a stray
 * console.log), so a change to how sizes are counted could land in one and not
 * the other.
 */
import type { HardDrive, VfsItem } from './types';
import { required } from './types';

function item_of(drive: HardDrive, id: string): VfsItem {
    return required(drive[id], 'fs item ' + id);
}

/** Sum of every descendant FILE's size, in KB. Folders contribute nothing. */
export function folder_size(drive: HardDrive, item_id: string): number {
    const node = drive[item_id];
    if (node == null) return 0;

    let total = 0;
    for (const child_id of node.children) {
        const child = drive[child_id];
        if (child == null) continue; // stale id on a cached drive
        if (child.type === 'file') {
            total += child.size ?? 0;
        } else {
            total += folder_size(drive, child_id);
        }
    }
    return total;
}

/** Kept for callers that still want the throwing lookup the dialogs used. */
export function drive_item(drive: HardDrive, item_id: string): VfsItem {
    return item_of(drive, item_id);
}
