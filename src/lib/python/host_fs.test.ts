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
const { apply_save, reset_save_gate, save_gate } = await import('./host_fs');
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
    // The gate is a per-TAB singleton, so tests must reset it or they leak
    // into each other — which is also the property that makes three terminal
    // windows share one rate limit.
    reset_save_gate();
    deleted.length = 0;
    saved.length = 0;
    created.length = 0;
    hardDrive.set({ [PYTHON_FOLDER_ID]: folder([]) });
});

describe('apply_save', () => {
    it('creates a new file in the folder the HOST chose', () => {
        const gate = save_gate();
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
            save_gate(),
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
            save_gate(),
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
            save_gate(),
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
            save_gate(),
        );
        expect(deleted).toEqual(['blob-original']);
    });

    it('reports every rejection and saves nothing for it', async () => {
        const out = await apply_save(
            { files: [{ name: '../evil.py', text: 'x' }] },
            save_gate(),
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
            save_gate(),
        );
        expect(created).toHaveLength(0);
        expect(out.lines[0]).toContain('full');
    });

    it('refuses a second save inside the rate window, without touching the store', async () => {
        const gate = save_gate();
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
        const gate = save_gate();
        for (let i = 0; i < LIMITS.max_per_runtime; i++) gate.allow(i * 1e6);
        const out = await apply_save(
            { files: [{ name: 'a.py', text: 'x' }] },
            gate,
        );
        expect(out.terminate).toBe(true);
        expect(out.lines[0]).toContain('restarting the interpreter');
        expect(created).toHaveLength(0);
    });

    it('says so when the drive has not been seeded yet', async () => {
        hardDrive.set(null);
        const out = await apply_save(
            { files: [{ name: 'a.py', text: 'x' }] },
            save_gate(),
        );
        expect(created).toHaveLength(0);
        expect(out.lines[0]).toContain('starting up');
    });
});

describe('gate-6 regressions', () => {
    it('is ONE gate per tab, not one per terminal window', () => {
        // Three Command Prompts each with their own gate could each save at
        // the permitted rate, keep desktop.svelte's 1000ms whole-drive persist
        // re-armed for ever, and the drive would never reach IndexedDB — with
        // no hostile code at all.
        expect(save_gate()).toBe(save_gate());
    });

    it('stores a dotless name unchanged', async () => {
        // `lastIndexOf('.')` is -1 and `slice(-1)` is the LAST CHARACTER, so
        // README became READMe with ext "e", never matched again, and
        // duplicated on every save to the file cap.
        await apply_save(
            { files: [{ name: 'README', text: 'x' }] },
            save_gate(),
        );
        expect(created[0]?.name).toBe('README');
        expect(created[0]?.basename).toBe('README');
        expect(created[0]?.ext).toBe('');
    });

    it('does not settle a rate-limited save, so it is retried', async () => {
        const gate = save_gate();
        await apply_save({ files: [{ name: 'a.py', text: 'x' }] }, gate);
        const out = await apply_save(
            { files: [{ name: 'b.py', text: 'x' }] },
            gate,
        );
        // Settling it would make it permanently unsavable: the file is
        // unchanged, so it never appears in a later scan.
        expect(out.settled).toEqual([]);
    });

    it('DOES settle a refusal that retrying cannot fix', async () => {
        const out = await apply_save(
            { files: [{ name: '../evil.py', text: 'x' }] },
            save_gate(),
        );
        // Otherwise the same refusal prints after every statement, for ever.
        expect(out.settled).toEqual(['../evil.py']);
    });

    it('settles a successful save', async () => {
        const out = await apply_save(
            { files: [{ name: 'a.py', text: 'x' }] },
            save_gate(),
        );
        expect(out.settled).toEqual(['a.py']);
    });

    it('terminates on a flood of REFUSALS, not just accepted saves', async () => {
        // A flood is made entirely of refusals, so a budget counting accepted
        // saves alone could never end one.
        const gate = save_gate();
        let terminated = false;
        for (let i = 0; i < LIMITS.max_refusals + 2; i++) {
            const out = await apply_save(
                { files: [{ name: `f${String(i)}.py`, text: 'x' }] },
                gate,
            );
            terminated ||= out.terminate;
        }
        expect(terminated).toBe(true);
    });

    it('asks to terminate ONCE, then stays quiet', async () => {
        // Resetting the gate when we kill a flooder would hand it a fresh
        // budget every cycle: terminate, reset, one more file, terminate. Only
        // ending the session deliberately clears it.
        const gate = save_gate();
        let terminations = 0;
        let noisy = 0;
        for (let i = 0; i < LIMITS.max_refusals + 20; i++) {
            const out = await apply_save(
                { files: [{ name: `f${String(i)}.py`, text: 'x' }] },
                gate,
            );
            if (out.terminate) terminations += 1;
            if (out.lines.length > 0) noisy += 1;
        }
        expect(terminations).toBe(1);
        // And it stops printing a refusal line per message, which was one
        // unthrottled terminal write per forged message on the UI thread.
        expect(noisy).toBeLessThan(LIMITS.max_refusals + 5);
    });

    it('keeps `size` honest when a file grows', async () => {
        hardDrive.set({
            [PYTHON_FOLDER_ID]: folder(['old']),
            old: { ...file('old', 'a.py'), size: 1 },
        });
        await apply_save(
            { files: [{ name: 'a.py', text: 'y'.repeat(5000) }] },
            save_gate(),
        );
        expect(get(hardDrive)?.old?.size).toBe(5);
    });

    it('never hands a FOLDER to save_file', async () => {
        // Explorer > New > Folder named `main.py` inside the Python folder
        // would otherwise get `url` and `storage_type` stamped onto it.
        hardDrive.set({
            [PYTHON_FOLDER_ID]: folder(['dir']),
            dir: { ...folder([]), id: 'dir', name: 'main.py' },
        });
        await apply_save(
            { files: [{ name: 'main.py', text: 'x' }] },
            save_gate(),
        );
        expect(saved).toHaveLength(0);
        expect(created).toHaveLength(1);
    });
});
