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
    // Never drop something the visitor made. `clone_fs` stamps `authored` for
    // exactly this: it copies the source wholesale, so a pasted copy of a seed
    // program keeps `fake` + `executable: true` and looked identical to a
    // pruned program. Provenance has to be RECORDED, not inferred — the same
    // lesson as `storage_type`, one level down.
    if (item.authored === true) return false;
    return item.storage_type === 'fake' && item.executable === true;
}

/**
 * The fields on a SEED item that the visitor can change from the UI.
 *
 * WHY THIS EXISTS: `merge_on_reseed` rebuilds from `{ ...seed }`, so every id
 * the seed contains is replaced WHOLESALE. Carry-by-provenance (below) rescues
 * items the visitor AUTHORED; it does nothing for items the visitor MODIFIED.
 * Before this, a re-seed silently reset all five desktop icon positions, every
 * per-folder sort setting, every rename of a seed item, and restored anything
 * the visitor had deleted. Production went live 2026-08-23, so the Phase 3
 * bump is the first re-seed against real user data.
 *
 * Verified write sites, one per field:
 *   name/basename/ext      desktop_folder.svelte:328-332, viewer.svelte:482-486
 *   desktop_css_transform  desktop_folder.svelte:158
 *   sort_option/sort_order CMFSVoid.ts:60,78
 *   date_modified          fs.ts:114,223,280,363,400,446,491,556
 *   url/storage_type       fs.ts:486-494 (save_file — Paint saving over a seed image)
 */
export type SeedUserFields = Partial<
    Pick<
        VfsItem,
        | 'name'
        | 'basename'
        | 'ext'
        | 'sort_option'
        | 'sort_order'
        | 'date_modified'
        | 'url'
        | 'storage_type'
        | 'desktop_css_transform'
    >
>;

/** Snapshot of the user-mutable fields of every seed item, keyed by id. */
export type SeedFieldSnapshot = Record<string, SeedUserFields>;

const USER_FIELDS = [
    'name',
    'basename',
    'ext',
    'sort_option',
    'sort_order',
    'date_modified',
    'url',
    'storage_type',
    'desktop_css_transform',
] as const;

/**
 * Project a seed into the field snapshot persisted alongside it.
 *
 * Storing this (a few KB against the seed's own tens of KB) is
 * what makes the carry UNAMBIGUOUS. Without it we cannot tell "the visitor
 * renamed this" from "a later seed renamed it" — and guessing wrong either
 * discards the visitor's edit or freezes the item against future content
 * updates. Comparing against the seed the visitor actually received answers it
 * exactly.
 */
export function snapshot_seed_fields(seed: HardDrive): SeedFieldSnapshot {
    const out: SeedFieldSnapshot = {};
    for (const [id, item] of Object.entries(seed)) {
        const fields: SeedUserFields = {};
        for (const key of USER_FIELDS) {
            const v = item[key];
            if (v !== undefined) Object.assign(fields, { [key]: v });
        }
        out[id] = fields;
    }
    return out;
}

/**
 * Fields the visitor changed on `id` since the seed they were given.
 *
 * `desktop_css_transform` is special-cased: the seed never sets it (verified —
 * zero occurrences in `static/json/hard_drive.json`), so its mere presence in
 * the cached drive means the visitor dragged the icon.
 */
/** The carried fields that must be numbers; the rest are strings. */
const NUMERIC_FIELDS = new Set<string>([
    'sort_option',
    'sort_order',
    'date_modified',
]);

function user_edits(
    cached: VfsItem,
    previous: SeedUserFields | undefined,
): SeedUserFields {
    const edits: SeedUserFields = {};
    if (previous == null) return edits;
    for (const key of USER_FIELDS) {
        const now = cached[key];
        if (now === undefined) continue;
        // TYPE-CHECK before carrying. Every other step of the boot path
        // validates persisted data (migrate_files_format, usable_cache,
        // parse_from_runtime); this one wrote whatever the store held straight
        // onto a fresh seed item and persisted it, so a corrupted record
        // (`name: 42`, `sort_option: null`) defeated usable_cache's
        // discard-if-malformed contract instead of being caught by it.
        const expected = NUMERIC_FIELDS.has(key) ? 'number' : 'string';
        if (typeof now !== expected) continue;
        if (key === 'desktop_css_transform') {
            Object.assign(edits, { [key]: now });
            continue;
        }
        if (now !== previous[key]) Object.assign(edits, { [key]: now });
    }
    return edits;
}

/**
 * An item that came from an OLDER seed and the new seed dropped.
 *
 * WHY THIS EXISTS: `is_stale_placeholder` reaps exactly one shape — a pruned
 * program (`fake` + `executable`). Everything else absent from a new seed is
 * carried forever, and there was no way to reap it. That was survivable while
 * seed content only ever grew. It stops being survivable the moment a seed
 * folder is CURATED: the music library is discovered from disk, so renaming a
 * track, moving it between genres, or renaming a genre folder mints new ids and
 * strands the old ones in every returning visitor's drive, pointing at URLs
 * that 404. A shape-based predicate cannot fix that — a renamed genre folder is
 * a plain `type: 'folder'` with no `storage_type` and no `executable` at all.
 *
 * So this asks PROVENANCE instead, which `is_stale_placeholder`'s own header
 * argues for: `previous` records an entry for every id the seed the visitor
 * ACTUALLY RECEIVED contained (`snapshot_seed_fields`). An id in there, absent
 * from the new seed, was dropped deliberately by us — not authored by them.
 *
 * It is the mirror of the tombstone block below, which uses the same snapshot
 * to infer the opposite direction, and it shares that block's fallback: with no
 * `previous` — a legacy drive, or the first re-seed after this shipped —
 * nothing is inferred and behaviour is exactly as before.
 *
 * Two things it must never reap:
 *   - an id `previous` never held, which is the visitor's own item. This is
 *     what protects an mp3 they upload into a genre folder, and it protects it
 *     WITHOUT relying on `authored` — `new_fs_item_raw` does not stamp that.
 *   - a seed item they overwrote with their own bytes. `save_file` flips
 *     `url`/`storage_type` on a SEED id when Paint saves over a wallpaper, so a
 *     changed `storage_type` means their bytes are in there and it is theirs.
 */
function is_dropped_seed_item(
    item: VfsItem,
    previous: SeedFieldSnapshot | undefined,
): boolean {
    if (previous == null) return false;
    const was = previous[item.id];
    if (was == null) return false;
    if (item.authored === true) return false;
    if (
        was.storage_type !== undefined &&
        item.storage_type !== was.storage_type
    ) {
        return false;
    }
    return true;
}

/**
 * Ancestry-walk bound. A drive is a tree a few levels deep; anything past this
 * is a cycle in corrupt cached data, and boot must not spin on it.
 */
const MAX_TREE_DEPTH = 64;

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
export function merge_on_reseed(
    cached: HardDrive,
    seed: HardDrive,
    previous?: SeedFieldSnapshot,
): HardDrive {
    const candidates = Object.values(cached).filter(
        (i) =>
            seed[i.id] == null &&
            !is_stale_placeholder(i) &&
            !is_dropped_seed_item(i, previous),
    );
    const carried = new Set<string>();
    /** Carry every candidate whose parent resolves, transitively. */
    const carry_transitively = (): void => {
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
    };
    carry_transitively();

    /*
     * ── ORPHANS: the visitor's own items whose FOLDER the new seed dropped ──
     *
     * The pass above carries an item only when its parent survives, so a file
     * the visitor put inside a seed folder that we later removed matched
     * nothing and was deleted — silently, on boot, with no bin copy. That
     * directly contradicts the contract `is_dropped_seed_item` states in its
     * own header ("it protects an mp3 they upload into a genre folder"): the
     * protection was real for the item and absent for its container.
     *
     * Found by the red team on the Certifications+Awards merge, which drops
     * `C:\\Awards` — but it was reachable the day the music library started
     * discovering genres from disk, and `help.html` invites visitors to drop
     * files into any folder.
     *
     * Re-home instead of dropping: put the orphan in the nearest folder of its
     * own ancestry that still exists, the same rule Recycle Bin restore uses.
     * Only CANDIDATES are re-homed, and candidates exclude everything
     * `previous` proves came from a seed — so seed content still dies with its
     * folder (a renamed genre takes its seeded tracks with it, as before) and
     * only the visitor's own work is rescued.
     *
     * SHALLOWEST FIRST, then carry again: a visitor's folder-inside-a-dropped-
     * folder must be re-homed before the files inside it are considered, or
     * whichever the arbitrary object order reached first would win and their
     * own folder structure would flatten. Re-homing the folder and re-running
     * the carry pass keeps the children where the visitor put them.
     */
    const depth_in_cache = (item: VfsItem): number => {
        let depth = 0;
        let cur: VfsItem | undefined = item;
        // bounded: a corrupt drive must not spin here
        while (cur?.parent != null && depth <= MAX_TREE_DEPTH) {
            cur = cached[cur.parent];
            depth += 1;
        }
        return depth;
    };
    const rehomed = new Map<string, string>();
    const by_depth = [...candidates].sort(
        (a, b) => depth_in_cache(a) - depth_in_cache(b),
    );
    for (const c of by_depth) {
        if (carried.has(c.id)) continue;
        // its own parent is gone by construction (the carry pass would have
        // taken it otherwise), so start the search one level up
        let ancestor = c.parent == null ? undefined : cached[c.parent];
        let hops = 0;
        while (ancestor != null && hops <= MAX_TREE_DEPTH) {
            if (seed[ancestor.id] != null || carried.has(ancestor.id)) {
                rehomed.set(c.id, ancestor.id);
                carried.add(c.id);
                break;
            }
            ancestor =
                ancestor.parent == null ? undefined : cached[ancestor.parent];
            hops += 1;
        }
    }
    carry_transitively();

    const result: HardDrive = { ...seed };

    // ── TOMBSTONES ───────────────────────────────────────────────────────────
    // An id that was in the seed the visitor RECEIVED and is absent from their
    // cached drive can only have been deleted by them. Without this, `{...seed}`
    // resurrects it — and because recycling is clone-then-delete (`clone_fs`
    // mints a NEW id, `del_fs` removes the original), the bin copy is ALSO
    // carried, so the visitor ends up with the file in two places at once.
    //
    // Derived, not tracked: this needs no hook in `del_fs`, so there is no call
    // site to forget. When `previous` is absent — the first re-seed after this
    // shipped, or a legacy drive — no tombstones are inferred and behaviour is
    // exactly as before. That is deliberate: guessing here would delete a
    // visitor's files.
    const tombstoned: string[] = [];
    if (previous != null) {
        for (const id of Object.keys(previous)) {
            if (cached[id] == null && result[id] != null) {
                tombstoned.push(id);
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete result[id];
            }
        }
        // Folders render from `parent.children`, never `.parent` (see above),
        // so a tombstoned id left in a children array is a dangling reference.
        for (const [id, item] of Object.entries(result)) {
            if (item.children.some((c) => tombstoned.includes(c))) {
                result[id] = {
                    ...item,
                    children: item.children.filter(
                        (c) => !tombstoned.includes(c),
                    ),
                };
            }
        }
    }

    // ── CARRY THE VISITOR'S EDITS ONTO SURVIVING SEED ITEMS ──────────────────
    // `{ ...seed }` above replaced each of these wholesale. Anything the
    // visitor changed relative to the seed they were given is restored on top.
    // Anything they did NOT change keeps the new seed's value, so content
    // updates still reach them.
    if (previous != null) {
        for (const [id, seed_item] of Object.entries(result)) {
            const before = cached[id];
            if (before == null) continue;
            const edits = user_edits(before, previous[id]);
            if (Object.keys(edits).length > 0) {
                result[id] = { ...seed_item, ...edits };
            }
        }
    }

    for (const id of carried) {
        const c = cached[id];
        if (c == null) continue;
        result[id] = {
            ...c,
            // a re-homed orphan's own `parent` pointed at a folder that is
            // gone; folders render from `children`, but a stale `parent`
            // breaks every path walk (CMD `cd ..`, the Python mirror, restore)
            parent: rehomed.get(id) ?? c.parent,
            children: c.children.filter((child) => carried.has(child)),
        };
    }
    for (const id of carried) {
        const c = result[id];
        const p = c?.parent;
        if (c == null || p == null) continue;
        // `result[p]`, not `seed[p]`: a carried item's parent may itself be a
        // carried folder, and a re-homed orphan's new parent is a seed folder
        const parent = result[p];
        if (parent != null && !parent.children.includes(id)) {
            result[p] = { ...parent, children: [...parent.children, id] };
        }
    }
    return result;
}
