/**
 * VFS seed versioning (SPECIFICATION.md §6.7).
 *
 * The base repo fetched `static/json/hard_drive.json` once, stored it in
 * IndexedDB, and never refreshed it — so seed edits (pruned programs, new
 * portfolio content) would never reach returning visitors. The boot path
 * compares the stored version with SEED_VERSION and re-seeds on mismatch.
 *
 * SEED_VERSION is the sha256 (hex, first 32 chars) of static/json/hard_drive.json.
 * Recompute after ANY seed edit:
 *     sha256sum static/json/hard_drive.json | cut -c1-32
 * (Phase 2 replaces this hand stamp with the generate-vfs build step.)
 */
import type { HardDrive } from './types';

export const SEED_VERSION = '29365afea2023187083d902c0a225831';

export function shouldReseed(stored: string | null | undefined): boolean {
    return stored !== SEED_VERSION;
}

/**
 * Re-seed merge (Phase 2 spec D3): the new seed owns every id it contains;
 * the visitor's `storage_type:'local'` items are carried when their parent
 * resolves in seed ∪ carried (transitively), then relinked into their seed
 * parent's `children` (folders render from `parent.children`, not `.parent`).
 * Non-`local` cached extras (copies, stale placeholder exes) are dropped.
 */
export function merge_on_reseed(cached: HardDrive, seed: HardDrive): HardDrive {
    const candidates = Object.values(cached).filter(
        (i) => i.storage_type === 'local' && seed[i.id] == null,
    );
    const carried = new Set<string>();
    let grew = true;
    while (grew) {
        grew = false;
        for (const c of candidates) {
            if (carried.has(c.id)) continue;
            const p = c.parent;
            if (p != null && (seed[p] != null || carried.has(p))) {
                carried.add(c.id);
                grew = true;
            }
        }
    }

    const result: HardDrive = { ...seed };
    for (const id of carried) {
        const c = cached[id];
        if (c == null) continue;
        result[id] = {
            ...c,
            children: c.children.filter((child) => carried.has(child)),
        };
    }
    for (const id of carried) {
        const c = cached[id];
        const p = c?.parent;
        if (c == null || p == null || seed[p] == null) continue;
        const parent = result[p];
        if (parent != null && !parent.children.includes(id)) {
            result[p] = { ...parent, children: [...parent.children, id] };
        }
    }
    return result;
}
