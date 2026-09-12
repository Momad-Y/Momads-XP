import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    SEED_VERSION,
    merge_on_reseed,
    shouldReseed,
    snapshot_seed_fields,
} from './seed';
import { to_hard_drive } from './types';
import type { HardDrive, VfsItem } from './types';
import { MY_DOCUMENTS_ID, PYTHON_FOLDER_ID } from './generated/vfs_ids';
import { protected_items } from './system';

describe('seed versioning', () => {
    it('exposes a non-empty content-hash version', () => {
        expect(SEED_VERSION).toMatch(/^[a-f0-9]{16,64}$/);
    });

    it('reseeds when nothing is stored', () => {
        expect(shouldReseed(undefined)).toBe(true);
        expect(shouldReseed(null)).toBe(true);
    });

    it('reseeds on version mismatch', () => {
        expect(shouldReseed('0000000000000000')).toBe(true);
    });

    it('does not reseed when versions match', () => {
        expect(shouldReseed(SEED_VERSION)).toBe(false);
    });

    it('SEED_VERSION matches the current hard_drive.json content hash', () => {
        const digest = createHash('sha256')
            .update(readFileSync('static/json/hard_drive.json'))
            .digest('hex')
            .slice(0, 32);
        expect(SEED_VERSION).toBe(digest);
    });
});

const item = (over: Partial<VfsItem> & { id: string }): VfsItem => ({
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
});

const drive = (...items: VfsItem[]): HardDrive =>
    Object.fromEntries(items.map((i) => [i.id, i]));

describe('merge_on_reseed', () => {
    const seed = drive(
        item({ id: 'desktop', type: 'folder', children: ['seeded_exe'] }),
        item({ id: 'seeded_exe', parent: 'desktop', storage_type: 'fake' }),
    );

    it('carries a local desktop file and relinks it into children', () => {
        const cached = drive(
            item({
                id: 'desktop',
                type: 'folder',
                children: ['seeded_exe', 'draw'],
            }),
            item({ id: 'seeded_exe', parent: 'desktop', storage_type: 'fake' }),
            item({ id: 'draw', parent: 'desktop', storage_type: 'local' }),
        );
        const merged = merge_on_reseed(cached, seed);
        expect(merged['draw']).toBeDefined();
        expect(merged['desktop']?.children).toEqual(['seeded_exe', 'draw']);
    });

    it('carries a nested user-folder tree whole (transitive parents)', () => {
        const cached = drive(
            item({ id: 'desktop', type: 'folder', children: ['dir'] }),
            item({
                id: 'dir',
                type: 'folder',
                parent: 'desktop',
                storage_type: 'local',
                children: ['inner'],
            }),
            item({ id: 'inner', parent: 'dir', storage_type: 'local' }),
        );
        const merged = merge_on_reseed(cached, seed);
        expect(merged['dir']?.children).toEqual(['inner']);
        expect(merged['inner']).toBeDefined();
        expect(merged['desktop']?.children).toContain('dir');
    });

    it('drops orphaned locals (parent chain broken everywhere)', () => {
        const cached = drive(
            item({ id: 'lost', parent: 'gone', storage_type: 'local' }),
        );
        expect(merge_on_reseed(cached, seed)['lost']).toBeUndefined();
    });

    it('retires a stale program placeholder (fake AND executable)', () => {
        const cached = drive(
            item({ id: 'desktop', type: 'folder', children: ['old_exe'] }),
            item({
                id: 'old_exe',
                parent: 'desktop',
                storage_type: 'fake',
                executable: true,
            }),
        );
        const merged = merge_on_reseed(cached, seed);
        expect(merged['old_exe']).toBeUndefined();
        expect(merged['desktop']?.children).toEqual(['seeded_exe']);
    });

    // The carry rule is PROVENANCE, not `storage_type`. create_shortcut mints
    // .lnk items as `fake`, so selecting on 'local' silently destroyed every
    // shortcut a visitor made on the next deploy while their uploads survived.
    it('carries a user-created shortcut, which is fake but NOT executable', () => {
        const cached = drive(
            item({ id: 'desktop', type: 'folder', children: ['lnk'] }),
            item({
                id: 'lnk',
                name: 'Shortcut to Projects.lnk',
                ext: '.lnk',
                parent: 'desktop',
                storage_type: 'fake',
                shortcut_target: 'seeded_exe',
            }),
        );
        const merged = merge_on_reseed(cached, seed);
        expect(merged['lnk']?.name).toBe('Shortcut to Projects.lnk');
        expect(merged['desktop']?.children).toContain('lnk');
    });

    it('carries a pasted copy of a seed item', () => {
        const cached = drive(
            item({ id: 'desktop', type: 'folder', children: ['pasted'] }),
            item({ id: 'pasted', parent: 'desktop', storage_type: 'remote' }),
        );
        expect(merge_on_reseed(cached, seed)['pasted']).toBeDefined();
    });

    it('seed always wins for ids it contains', () => {
        const cached = drive(
            item({ id: 'desktop', type: 'folder', children: [] }),
            item({
                id: 'seeded_exe',
                parent: 'desktop',
                storage_type: 'local',
            }),
        );
        const merged = merge_on_reseed(cached, seed);
        expect(merged['seeded_exe']?.storage_type).toBe('fake');
        expect(merged['desktop']?.children).toEqual(['seeded_exe']);
    });

    it('a carried folder keeps its carried children and drops dangling ids', () => {
        const cached = drive(
            item({ id: 'desktop', type: 'folder', children: ['dir'] }),
            item({
                id: 'dir',
                type: 'folder',
                parent: 'desktop',
                storage_type: 'local',
                children: ['copy', 'ghost'],
            }),
            item({ id: 'copy', parent: 'dir', storage_type: 'remote' }),
        );
        // `copy` is the visitor's, so it is carried; `ghost` does not exist in
        // the cached drive at all and must not survive into the merged one
        expect(merge_on_reseed(cached, seed)['dir']?.children).toEqual([
            'copy',
        ]);
    });
});

/**
 * Phase 3 (plan T3). `merge_on_reseed` rebuilds from `{ ...seed }`, so every id
 * the seed contains is replaced WHOLESALE. Carry-by-provenance rescues items
 * the visitor AUTHORED; until now nothing rescued items the visitor MODIFIED.
 *
 * Production went live 2026-08-23, so the Phase 3 SEED_VERSION bump is the
 * first re-seed against real user data. Every test below was written to FAIL
 * first: revert the carry in `seed.ts` and it goes red.
 */
/**
 * Return a copy of `drive` with `fields` applied to item `id`.
 *
 * Written as a helper because `drive[id]` is possibly-undefined under this
 * repo's strict index-access rules, and `no-non-null-assertion` is an error —
 * so spreading an indexed lookup inline does not typecheck.
 */
function patch(
    drive: HardDrive,
    id: string,
    fields: Partial<VfsItem>,
): HardDrive {
    const current = drive[id];
    if (current == null) throw new Error(`no such item: ${id}`);
    return { ...drive, [id]: { ...current, ...fields } };
}

describe('merge_on_reseed — the visitor edited a SEED item', () => {
    /** A drive with one folder holding one file, as the seed ships it. */
    const seed_drive = (): HardDrive => ({
        folder: item({
            id: 'folder',
            type: 'folder',
            name: 'Docs',
            basename: 'Docs',
            children: ['icon'],
            sort_option: 0,
            sort_order: 0,
            date_modified: 1000,
        }),
        icon: item({
            id: 'icon',
            name: 'My CV.exe',
            basename: 'My CV',
            ext: '.exe',
            parent: 'folder',
            date_modified: 1000,
        }),
    });

    it('keeps a renamed seed item renamed', () => {
        const seed = seed_drive();
        const before = snapshot_seed_fields(seed);
        const cached = patch(seed_drive(), 'icon', {
            name: 'Resume.exe',
            basename: 'Resume',
        });

        const out = merge_on_reseed(cached, seed_drive(), before);
        expect(out.icon?.name).toBe('Resume.exe');
        expect(out.icon?.basename).toBe('Resume');
    });

    it('keeps a dragged desktop icon where the visitor put it', () => {
        // The seed NEVER sets desktop_css_transform (verified: zero
        // occurrences in hard_drive.json), so its presence alone means the
        // visitor dragged the icon — no comparison needed.
        const seed = seed_drive();
        const cached = patch(seed_drive(), 'icon', {
            desktop_css_transform: 'translate(120px, 240px)',
        });

        const out = merge_on_reseed(
            cached,
            seed_drive(),
            snapshot_seed_fields(seed),
        );
        expect(out.icon?.desktop_css_transform).toBe('translate(120px, 240px)');
    });

    it('keeps a per-folder sort setting', () => {
        const seed = seed_drive();
        const cached = patch(seed_drive(), 'folder', {
            sort_option: 2,
            sort_order: 1,
        });

        const out = merge_on_reseed(
            cached,
            seed_drive(),
            snapshot_seed_fields(seed),
        );
        expect(out.folder?.sort_option).toBe(2);
        expect(out.folder?.sort_order).toBe(1);
    });

    it('keeps an image the visitor saved over from Paint', () => {
        // fs.save_file rewrites url + storage_type in place. Reverting them
        // loses the edit AND orphans the idb blob forever, because free_blob
        // only runs from del_fs.
        const seed = seed_drive();
        const cached = patch(seed_drive(), 'icon', {
            url: 'blob-key-42',
            storage_type: 'local',
        });

        const out = merge_on_reseed(
            cached,
            seed_drive(),
            snapshot_seed_fields(seed),
        );
        expect(out.icon?.url).toBe('blob-key-42');
        expect(out.icon?.storage_type).toBe('local');
    });

    it('lets a NEW seed value through when the visitor never touched the field', () => {
        // The inverse of the tests above, and the reason the snapshot exists:
        // carrying blindly would freeze every seed item against future content
        // updates. Comparing against the seed the visitor RECEIVED tells the
        // two cases apart.
        const before = snapshot_seed_fields(seed_drive());
        const cached = seed_drive(); // untouched by the visitor

        const next = patch(seed_drive(), 'icon', {
            name: 'Curriculum Vitae.exe',
        });

        const out = merge_on_reseed(cached, next, before);
        expect(out.icon?.name).toBe('Curriculum Vitae.exe');
    });

    it('carries the visitor edit and the seed update independently, field by field', () => {
        const before = snapshot_seed_fields(seed_drive());
        const cached = patch(seed_drive(), 'icon', { name: 'Mine.exe' }); // visitor renamed
        const next = patch(seed_drive(), 'icon', {
            name: 'New.exe',
            date_modified: 9999,
        }); // seed changed both

        const out = merge_on_reseed(cached, next, before);
        expect(out.icon?.name).toBe('Mine.exe'); // visitor wins where they edited
        expect(out.icon?.date_modified).toBe(9999); // seed wins where they did not
    });
});

describe('merge_on_reseed — the visitor DELETED a seed item', () => {
    const seed_drive = (): HardDrive => ({
        root: item({
            id: 'root',
            type: 'folder',
            children: ['keep', 'gone'],
        }),
        keep: item({ id: 'keep', parent: 'root' }),
        gone: item({ id: 'gone', parent: 'root' }),
    });

    it('does not resurrect it', () => {
        const before = snapshot_seed_fields(seed_drive());
        const cached = patch(seed_drive(), 'root', { children: ['keep'] });
        delete cached.gone;

        const out = merge_on_reseed(cached, seed_drive(), before);
        expect(out.gone).toBeUndefined();
        expect(out.keep).toBeDefined();
    });

    it('also drops it from its parent .children', () => {
        // Folders render from parent.children, never .parent (see seed.ts), so
        // a tombstoned id left in a children array is a dangling reference —
        // the exact shape `properties.svelte` once crashed on.
        const before = snapshot_seed_fields(seed_drive());
        const cached = seed_drive();
        delete cached.gone;

        const out = merge_on_reseed(cached, seed_drive(), before);
        expect(out.root?.children).toEqual(['keep']);
    });

    it('does NOT tombstone an item that is simply NEW in this seed', () => {
        // The failure mode that makes a naive implementation destructive: an
        // id absent from the cached drive is only a deletion if the visitor
        // was ever GIVEN it.
        const before = snapshot_seed_fields(seed_drive());
        const cached = seed_drive();

        const next = patch(seed_drive(), 'root', {
            children: ['keep', 'gone', 'fresh'],
        });
        next.fresh = item({ id: 'fresh', parent: 'root' });

        const out = merge_on_reseed(cached, next, before);
        expect(out.fresh).toBeDefined();
        expect(out.root?.children).toContain('fresh');
    });

    it('infers nothing without a snapshot — legacy drives are untouched', () => {
        // First re-seed after this shipped, or any drive stored before it.
        // Guessing here would DELETE a visitor's files, so the merge falls
        // back to exactly the previous behaviour.
        const cached = seed_drive();
        delete cached.gone;

        const out = merge_on_reseed(cached, seed_drive());
        expect(out.gone).toBeDefined(); // resurrected, as before — deliberately
    });
});

describe('snapshot_seed_fields', () => {
    it('captures only the user-mutable fields', () => {
        const snap = snapshot_seed_fields({
            a: item({
                id: 'a',
                name: 'A.txt',
                basename: 'A',
                ext: '.txt',
                sort_option: 1,
                sort_order: 0,
                date_modified: 77,
            }),
        });
        expect(snap.a).toEqual({
            name: 'A.txt',
            basename: 'A',
            ext: '.txt',
            sort_option: 1,
            sort_order: 0,
            date_modified: 77,
        });
        // type/children/date_created are seed-owned and must not be captured
        expect(snap.a).not.toHaveProperty('type');
        expect(snap.a).not.toHaveProperty('children');
    });

    it('covers every id in the seed', () => {
        const seed = { a: item({ id: 'a' }), b: item({ id: 'b' }) };
        expect(Object.keys(snapshot_seed_fields(seed)).sort()).toEqual([
            'a',
            'b',
        ]);
    });
});

describe('merge_on_reseed — degenerate inputs', () => {
    it('wipes the drive when handed an EMPTY cache and a snapshot', () => {
        // Documents the hazard rather than the desired behaviour: with a
        // snapshot present, every seed id is "absent from cached", so the
        // tombstone pass removes all of them. Pre-Phase-3 an empty cache still
        // yielded the full seed. The guard lives in starting.svelte's
        // usable_cache(), which now discards a zero-key drive — this test
        // pins WHY that guard has to exist.
        const seed = { a: item({ id: 'a' }), b: item({ id: 'b' }) };
        const snapshot = snapshot_seed_fields(seed);
        expect(Object.keys(merge_on_reseed({}, seed, snapshot))).toHaveLength(
            0,
        );
    });

    it('still yields the full seed for an empty cache with NO snapshot', () => {
        // The legacy path, unchanged.
        const seed = { a: item({ id: 'a' }), b: item({ id: 'b' }) };
        expect(Object.keys(merge_on_reseed({}, seed))).toHaveLength(2);
    });
});

describe('merge_on_reseed — provenance of copied program items', () => {
    it('keeps a pasted copy of a seed program', () => {
        // clone_fs copies the source item WHOLESALE, so duplicating a program
        // icon produced `storage_type: 'fake'` + `executable: true` — which
        // looked identical to a pruned-program placeholder, so the merge
        // deleted the visitor's own file on every re-seed. `authored` is the
        // recorded provenance that tells them apart.
        const seed = {
            root: item({ id: 'root', type: 'folder', children: [] }),
        };
        const cached: HardDrive = {
            root: item({ id: 'root', type: 'folder', children: ['copy'] }),
            copy: item({
                id: 'copy',
                parent: 'root',
                storage_type: 'fake',
                executable: true,
                authored: true,
            }),
        };
        const out = merge_on_reseed(cached, seed);
        expect(out.copy, 'the visitor’s duplicate was deleted').toBeDefined();
        expect(out.root?.children).toContain('copy');
    });

    it('still drops a genuine stale placeholder for a pruned program', () => {
        // The behaviour `authored` must not weaken: a `fake` + `executable`
        // item the visitor did NOT create is a program we removed from the
        // seed, and carrying it forward would resurrect a dead icon.
        const seed = {
            root: item({ id: 'root', type: 'folder', children: [] }),
        };
        const cached: HardDrive = {
            root: item({ id: 'root', type: 'folder', children: ['old'] }),
            old: item({
                id: 'old',
                parent: 'root',
                storage_type: 'fake',
                executable: true,
            }),
        };
        expect(merge_on_reseed(cached, seed).old).toBeUndefined();
    });
});

describe('merge_on_reseed — carried fields are type-checked', () => {
    const seed_drive = (): HardDrive => ({
        f: item({
            id: 'f',
            name: 'A.txt',
            basename: 'A',
            ext: '.txt',
            sort_option: 0,
            sort_order: 0,
            date_modified: 100,
        }),
    });

    it('ignores a corrupted value instead of writing it onto the seed item', () => {
        // Every other step of the boot path validates persisted data; this one
        // wrote whatever the store held straight onto a fresh seed item and
        // persisted it, defeating usable_cache's discard-if-malformed
        // contract rather than being caught by it.
        const before = snapshot_seed_fields(seed_drive());
        const cached = seed_drive();
        const corrupt = cached.f;
        if (corrupt == null) throw new Error('fixture');
        // Deliberately wrong types, as a damaged IndexedDB record would hold.
        Object.assign(corrupt, { name: 42, sort_option: null });

        const out = merge_on_reseed(cached, seed_drive(), before);
        expect(out.f?.name).toBe('A.txt');
        expect(out.f?.sort_option).toBe(0);
    });

    it('still carries a well-typed edit', () => {
        const before = snapshot_seed_fields(seed_drive());
        const cached = patch(seed_drive(), 'f', { name: 'Renamed.txt' });
        expect(merge_on_reseed(cached, seed_drive(), before).f?.name).toBe(
            'Renamed.txt',
        );
    });
});

describe('My Documents \\ Python (the REPL save folder)', () => {
    const drive = to_hard_drive(
        JSON.parse(readFileSync('static/json/hard_drive.json', 'utf-8')),
    );

    it('exists, is linked both ways, and sits under C:', () => {
        const docs = drive[MY_DOCUMENTS_ID];
        const python = drive[PYTHON_FOLDER_ID];
        expect(docs?.name).toBe('My Documents');
        expect(python?.name).toBe('Python');
        // Both directions, because the generator's dangling-child check only
        // proves the ids resolve, not that the tree agrees with itself.
        expect(drive['cTbkbrM4qjwF3UfmCoFkEK']?.children).toContain(
            MY_DOCUMENTS_ID,
        );
        expect(docs?.children).toContain(PYTHON_FOLDER_ID);
        expect(python?.parent).toBe(MY_DOCUMENTS_ID);
        expect(docs?.parent).toBe('cTbkbrM4qjwF3UfmCoFkEK');
    });

    it('protects the Python folder from deletion, but not its contents', () => {
        // Deleting it is UNRECOVERABLE: the host saves by id, and seed.ts's
        // tombstone pass would keep it deleted through every future re-seed.
        expect(protected_items).toContain(PYTHON_FOLDER_ID);
        expect(protected_items).toContain(MY_DOCUMENTS_ID);
    });

    it('starts empty, so nothing ships inside it', () => {
        expect(drive[PYTHON_FOLDER_ID]?.children).toEqual([]);
    });
});

/*
 * Reaping items a NEW SEED DROPPED.
 *
 * Before this, only a pruned program (`fake` + `executable`) could ever leave a
 * returning visitor's drive. Everything else absent from a new seed was carried
 * forever. That held while seed content only grew; it breaks the moment a seed
 * folder is curated, which is exactly what the music library does — renaming a
 * track, moving it between genres, or renaming a genre folder mints new ids and
 * would strand the old ones pointing at URLs that 404.
 */
describe('merge_on_reseed reaps items the new seed dropped', () => {
    const music = 'my_music';
    const old_seed = drive(
        item({ id: music, type: 'folder', children: ['old_track'] }),
        item({
            id: 'old_track',
            parent: music,
            storage_type: 'remote',
            url: '/audio/music/old.mp3',
        }),
    );
    const new_seed = drive(
        item({ id: music, type: 'folder', children: ['genre'] }),
        item({ id: 'genre', type: 'folder', parent: music, children: [] }),
    );
    const previous = snapshot_seed_fields(old_seed);

    it('drops a track the new seed no longer contains', () => {
        const merged = merge_on_reseed(old_seed, new_seed, previous);
        expect(merged['old_track']).toBeUndefined();
        expect(merged[music]?.children).toEqual(['genre']);
    });

    it('drops a renamed genre folder AND the tracks inside it', () => {
        // a folder has no storage_type and no executable flag, so no
        // shape-based predicate could ever have reached this case
        const cached = drive(
            item({ id: music, type: 'folder', children: ['old_genre'] }),
            item({
                id: 'old_genre',
                type: 'folder',
                parent: music,
                children: ['t1'],
            }),
            item({ id: 't1', parent: 'old_genre', storage_type: 'remote' }),
        );
        const merged = merge_on_reseed(
            cached,
            new_seed,
            snapshot_seed_fields(cached),
        );
        expect(merged['old_genre']).toBeUndefined();
        expect(merged['t1']).toBeUndefined();
    });

    it('KEEPS a file the visitor put there themselves', () => {
        // never in any seed, so `previous` has no entry — this is what protects
        // an upload, and it does NOT depend on `authored`, which
        // new_fs_item_raw never stamps
        const cached = drive(
            item({
                id: music,
                type: 'folder',
                children: ['old_track', 'mine'],
            }),
            item({ id: 'old_track', parent: music, storage_type: 'remote' }),
            item({ id: 'mine', parent: music, storage_type: 'local' }),
        );
        const merged = merge_on_reseed(cached, new_seed, previous);
        expect(merged['old_track']).toBeUndefined();
        expect(merged['mine']).toBeDefined();
        expect(merged[music]?.children).toContain('mine');
    });

    it('KEEPS a seed item the visitor overwrote with their own bytes', () => {
        // save_file flips url/storage_type on a SEED id when Paint saves over a
        // wallpaper; those are the visitor's bytes now
        const cached = drive(
            item({ id: music, type: 'folder', children: ['old_track'] }),
            item({
                id: 'old_track',
                parent: music,
                storage_type: 'local',
                url: 'blob:theirs',
            }),
        );
        const merged = merge_on_reseed(cached, new_seed, previous);
        expect(merged['old_track']).toBeDefined();
    });

    it('KEEPS an explicitly authored item', () => {
        const cached = drive(
            item({ id: music, type: 'folder', children: ['old_track'] }),
            item({
                id: 'old_track',
                parent: music,
                storage_type: 'remote',
                authored: true,
            }),
        );
        const merged = merge_on_reseed(cached, new_seed, previous);
        expect(merged['old_track']).toBeDefined();
    });

    it('infers NOTHING without a snapshot, exactly like the tombstone block', () => {
        // a legacy drive, or the first re-seed after this shipped
        const merged = merge_on_reseed(old_seed, new_seed);
        expect(merged['old_track']).toBeDefined();
    });
});

/*
 * A DROPPED FOLDER MUST NOT TAKE THE VISITOR'S OWN FILES WITH IT.
 *
 * `is_dropped_seed_item`'s header promises "it protects an mp3 they upload into
 * a genre folder". That promise held for the file and not for its container:
 * the carry pass required a surviving parent, so an upload inside a folder the
 * new seed removed matched nothing and was deleted on boot, with no bin copy
 * and no way to get it back.
 *
 * Found red-teaming the Certifications+Awards merge, which drops `C:\Awards` —
 * but it has been reachable since the music library started discovering genres
 * from disk, and `help.html` tells visitors to drop files into any folder.
 */
describe('merge_on_reseed re-homes orphans instead of deleting them', () => {
    const C = 'c_drive';
    const old_seed = drive(
        item({ id: C, type: 'folder', children: ['awards'] }),
        item({ id: 'awards', type: 'folder', parent: C, children: ['entry'] }),
        item({ id: 'entry', parent: 'awards', storage_type: 'remote' }),
    );
    const new_seed = drive(
        item({ id: C, type: 'folder', children: ['merged'] }),
        item({ id: 'merged', type: 'folder', parent: C, children: [] }),
    );
    const previous = snapshot_seed_fields(old_seed);

    /** The visitor's drive: they dropped a file into `C:\Awards`. */
    const with_upload = (): HardDrive =>
        drive(
            item({ id: C, type: 'folder', children: ['awards'] }),
            item({
                id: 'awards',
                type: 'folder',
                parent: C,
                children: ['entry', 'mine'],
            }),
            item({ id: 'entry', parent: 'awards', storage_type: 'remote' }),
            item({
                id: 'mine',
                name: 'holiday.jpg',
                parent: 'awards',
                storage_type: 'local',
            }),
        );

    it('keeps a file the visitor put in a folder the new seed removed', () => {
        const merged = merge_on_reseed(with_upload(), new_seed, previous);
        expect(merged['mine']).toBeDefined();
        expect(merged['mine']?.name).toBe('holiday.jpg');
    });

    it('puts it in the nearest folder that still exists, and links it there', () => {
        const merged = merge_on_reseed(with_upload(), new_seed, previous);
        expect(merged['mine']?.parent).toBe(C);
        expect(merged[C]?.children).toContain('mine');
        // and the folder it used to live in is still gone
        expect(merged['awards']).toBeUndefined();
        expect(merged[C]?.children).not.toContain('awards');
    });

    it('still drops the SEED items that lived in that folder', () => {
        // the whole point of reaping: `entry` came from a seed, so it dies
        // with its folder exactly as before
        const merged = merge_on_reseed(with_upload(), new_seed, previous);
        expect(merged['entry']).toBeUndefined();
    });

    it("keeps the visitor's own folder structure, however deep", () => {
        const cached = drive(
            item({ id: C, type: 'folder', children: ['awards'] }),
            item({
                id: 'awards',
                type: 'folder',
                parent: C,
                children: ['their_folder'],
            }),
            item({
                id: 'their_folder',
                name: 'Trophies',
                type: 'folder',
                parent: 'awards',
                children: ['deep'],
            }),
            item({ id: 'deep', parent: 'their_folder', storage_type: 'local' }),
        );
        const merged = merge_on_reseed(cached, new_seed, previous);
        // the folder is re-homed; the file inside it stays inside it rather
        // than being flattened into C: alongside its own folder
        expect(merged['their_folder']?.parent).toBe(C);
        expect(merged['deep']?.parent).toBe('their_folder');
        expect(merged['their_folder']?.children).toContain('deep');
        expect(merged[C]?.children).toContain('their_folder');
        expect(merged[C]?.children).not.toContain('deep');
    });

    it('drops an orphan with no surviving ancestor at all', () => {
        // nothing to re-home it to is not an excuse to invent a parent
        const cached = drive(
            item({ id: 'gone', type: 'folder', children: ['mine'] }),
            item({ id: 'mine', parent: 'gone', storage_type: 'local' }),
        );
        const merged = merge_on_reseed(cached, new_seed, previous);
        expect(merged['mine']).toBeUndefined();
    });

    it('does not spin on a cycle in a corrupt cached drive', () => {
        const cached = drive(
            item({ id: 'a', type: 'folder', parent: 'b', children: ['mine'] }),
            item({ id: 'b', type: 'folder', parent: 'a', children: ['a'] }),
            item({ id: 'mine', parent: 'a', storage_type: 'local' }),
        );
        expect(() => merge_on_reseed(cached, new_seed, previous)).not.toThrow();
    });
});
