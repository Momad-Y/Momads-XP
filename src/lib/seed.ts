/**
 * VFS seed versioning (SPECIFICATION.md §6.7).
 *
 * The base repo fetched `static/json/hard_drive.json` once, stored it in
 * IndexedDB, and never refreshed it — so seed edits (pruned programs, new
 * portfolio content) would never reach returning visitors. The boot path
 * compares the stored version with SEED_VERSION and re-seeds on mismatch.
 *
 * SEED_VERSION is a content hash written by `npm run generate:vfs`
 * (scripts/generate-vfs.ts) — never hand-edited; CI enforces freshness.
 */
import type { HardDrive, VfsItem } from './types';

export { SEED_VERSION } from './generated/seed_version';
import { SEED_VERSION } from './generated/seed_version';

export function shouldReseed(stored: string | null | undefined): boolean {
    return stored !== SEED_VERSION;
}

/**
 * Items the visitor did not author, which a re-seed is free to drop: stale
 * placeholders for programs that no longer exist in the seed. `fake` is the
 * marker for "this item points at a `./programs/*.svelte` path", so a cached
 * `fake` item absent from the new seed is a program we pruned.
 *
 * Everything else the visitor has in their drive is theirs.
 */
function is_stale_placeholder(item: VfsItem): boolean {
    return item.storage_type === 'fake' && item.executable === true;
}

/**
 * Re-seed merge (Phase 2 spec D3): the new seed owns every id it contains; the
 * visitor's OWN items are carried when their parent resolves in seed ∪ carried
 * (transitively), then relinked into their seed parent's `children` (folders
 * render from `parent.children`, not `.parent`).
 *
 * Carry is by PROVENANCE, not by `storage_type`. That field says where an
 * item's bytes live — it was never a statement about who authored the item.
 * Selecting on `storage_type === 'local'` carried uploads and silently dropped
 * every other user-authored artefact: `create_shortcut` mints `.lnk` items as
 * `fake`, so a visitor's shortcuts vanished on the next deploy while their
 * uploads survived — the worst possible signal. Pasted copies of seed items
 * had the same problem, and so would the next item kind anyone adds.
 */
export function merge_on_reseed(cached: HardDrive, seed: HardDrive): HardDrive {
    const candidates = Object.values(cached).filter(
        (i) => seed[i.id] == null && !is_stale_placeholder(i),
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
