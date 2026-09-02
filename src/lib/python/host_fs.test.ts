import { beforeEach, describe, expect, it, vi } from 'vitest';
import { get } from 'svelte/store';

const deleted: string[] = [];
const saved: { id: string; text: string }[] = [];
const created: Record<string, unknown>[] = [];

vi.mock('idb-keyval', () => ({
    del: (key: string) => {
        deleted.push(key);
        return Promise.resolve();
    },
}));

vi.mock('../fs', () => ({
    // Mirrors the real one: it mints a FRESH blob key and repoints the item,
    // which is exactly why the previous key is orphaned and has to be freed.
    save_file: async (id: string, blob: Blob) => {
        saved.push({ id, text: await blob.text() });
        const { hardDrive: store } = await import('../store');
        store.update((drive) => {
            const item = drive?.[id];
            if (item != null) item.url = `blob-new-${String(saved.length)}`;
            return drive;
        });
    },
    new_fs_item_raw: (item: Record<string, unknown>, parent: string) => {
        created.push({ ...item, __parent: parent });
        return Promise.resolve('new-id');
    },
}));

const { hardDrive } = await import('../store');
const { apply_save, create_save_gate } = await import('./host_fs');
const { LIMITS } = await import('./save_limits');
const { PYTHON_FOLDER_ID } = await import('../generated/vfs_ids');

const folder = (children: string[]) => ({
    id: PYTHON_FOLDER_ID,
    type: 'folder' as const,
    name: 'Python',
    basename: 'Python',
    ext: '',
    children,
    date_created: 0,
    date_modified: 0,
    sort_option: 0,
    sort_order: 0,
});

const file = (id: string, name: string, url = `blob-${id}`) => ({
    id,
    type: 'file' as const,
    name,
    basename: name.split('.')[0] ?? name,
    ext: '.py',
    children: [],
    parent: PYTHON_FOLDER_ID,
    storage_type: 'local' as const,
    url,
    date_created: 0,
    date_modified: 0,
    sort_option: 0,
    sort_order: 0,
});

beforeEach(() => {
    deleted.length = 0;
    saved.length = 0;
    created.length = 0;
    hardDrive.set({ [PYTHON_FOLDER_ID]: folder([]) });
});

describe('apply_save', () => {
    it('creates a new file in the folder the HOST chose', () => {
        const gate = create_save_gate();
        return apply_save({ files: [{ name: 'a.py', text: 'x' }] }, gate).then(
            (out) => {
                expect(out.lines).toEqual([]);
                expect(created).toHaveLength(1);
                // The parent is an argument the runtime never supplies.
                expect(created[0]?.__parent).toBe(PYTHON_FOLDER_ID);
                expect(created[0]?.name).toBe('a.py');
                expect(created[0]?.authored).toBe(true);
                // Not the executable icon new_fs_item_raw would default to.
                expect(String(created[0]?.icon)).toContain('ScriptComponent');
            },
        );
    });

    it('OVERWRITES an existing name instead of making "a 2.py"', async () => {
        hardDrive.set({
            [PYTHON_FOLDER_ID]: folder(['old']),
            old: file('old', 'a.py'),
        });
        await apply_save(
            { files: [{ name: 'a.py', text: 'v2' }] },
            create_save_gate(),
        );
        expect(created).toHaveLength(0);
        expect(saved).toEqual([{ id: 'old', text: 'v2' }]);
    });

    it('finds the existing file by DERIVING it, so a reload cannot lose it', async () => {
        // A remembered map would be empty here; the drive is not.
        hardDrive.set({
            [PYTHON_FOLDER_ID]: folder(['old']),
            old: file('old', 'a.py'),
        });
        await apply_save(
            { files: [{ name: 'a.py', text: 'again' }] },
            create_save_gate(),
        );
        expect(saved.map((s) => s.id)).toEqual(['old']);
    });

    it('matches the NORMALISED name, so NOTES.TXT does not re-save forever', async () => {
        hardDrive.set({
            [PYTHON_FOLDER_ID]: folder(['old']),
            old: { ...file('old', 'NOTES.txt'), ext: '.txt' },
        });
        await apply_save(
            { files: [{ name: 'NOTES.TXT', text: 'x' }] },
            create_save_gate(),
        );
        expect(created).toHaveLength(0);
        expect(saved.map((s) => s.id)).toEqual(['old']);
    });

    it('frees the previous blob, which save_file never does', async () => {
        // save_file mints a fresh key and leaves the old bytes orphaned;
        // without this every re-save leaks up to 256 KB Explorer cannot show.
        hardDrive.set({
            [PYTHON_FOLDER_ID]: folder(['old']),
            old: file('old', 'a.py', 'blob-original'),
        });
        await apply_save(
            { files: [{ name: 'a.py', text: 'v2' }] },
            create_save_gate(),
        );
        expect(deleted).toEqual(['blob-original']);
    });

    it('reports every rejection and saves nothing for it', async () => {
        const out = await apply_save(
            { files: [{ name: '../evil.py', text: 'x' }] },
            create_save_gate(),
        );
        expect(created).toHaveLength(0);
        expect(out.lines[0]).toContain('../evil.py');
    });

    it('refuses past the file cap, and says which file', async () => {
        const ids = Array.from({ length: LIMITS.max_files }, (_, i) =>
            String(i),
        );
        hardDrive.set({
            [PYTHON_FOLDER_ID]: folder(ids),
            ...Object.fromEntries(ids.map((id) => [id, file(id, `f${id}.py`)])),
        });
        const out = await apply_save(
            { files: [{ name: 'new.py', text: 'x' }] },
            create_save_gate(),
        );
        expect(created).toHaveLength(0);
        expect(out.lines[0]).toContain('full');
    });

    it('refuses a second save inside the rate window, without touching the store', async () => {
        const gate = create_save_gate();
        await apply_save({ files: [{ name: 'a.py', text: 'x' }] }, gate);
        const before = get(hardDrive);
        const out = await apply_save(
            { files: [{ name: 'b.py', text: 'x' }] },
            gate,
        );
        expect(created).toHaveLength(1);
        expect(out.lines[0]).toContain('too fast');
        expect(out.terminate).toBe(false);
        expect(get(hardDrive)).toBe(before);
    });

    it('asks for termination once the budget is spent', async () => {
        const gate = create_save_gate();
        for (let i = 0; i < LIMITS.max_per_runtime; i++) gate.allow(i * 1e6);
        const out = await apply_save(
            { files: [{ name: 'a.py', text: 'x' }] },
            gate,
        );
        expect(out.terminate).toBe(true);
        expect(out.lines[0]).toContain('restart Python');
        expect(created).toHaveLength(0);
    });

    it('says so when the drive has not been seeded yet', async () => {
        hardDrive.set(null);
        const out = await apply_save(
            { files: [{ name: 'a.py', text: 'x' }] },
            create_save_gate(),
        );
        expect(created).toHaveLength(0);
        expect(out.lines[0]).toContain('starting up');
    });
});
