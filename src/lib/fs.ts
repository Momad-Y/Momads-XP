import { clipboard, selectingItems, hardDrive, clipboard_op } from './store';
import { protected_items, SortOptions, SortOrders } from './system';
import * as utils from './utils';
import { get } from 'svelte/store';
import short from 'short-uuid';
import * as util from './utils';
import * as idb from 'idb-keyval';
import * as finder from './finder';
import { Buffer } from 'buffer';
import { required } from './types';
import { scoped_ids } from './selection';
import type { HardDrive, VfsItem, VfsItemDraft } from './types';

/** Snapshot the hard drive store, failing fast (as the untyped code did) if unseeded. */
function drive_snapshot(): HardDrive {
    return required(get(hardDrive), 'hard drive');
}

/**
 * `scope` is the ids the acting surface is showing; the selection is narrowed
 * to it (see src/lib/selection.ts). Without it a cut started in one Explorer
 * carried another window's — or the desktop's — items, and paste MOVES them.
 */
/**
 * `scope` is REQUIRED — a caller that genuinely cannot know what it is showing
 * passes `null` explicitly, matching `scoped_ids`. It was optional, so a
 * forgotten argument compiled cleanly and produced a working-looking copy that
 * clipped nothing.
 *
 * An empty narrowing LEAVES THE CLIPBOARD ALONE rather than blanking it. Three
 * surfaces bind window keydown, so two Ctrl+C handlers can fire on one
 * keypress; each now writes its own scope, and whichever legitimately narrows
 * to nothing used to wipe what the other had just copied. Windows treats
 * Ctrl+C with nothing selected as a no-op, not as "empty the clipboard".
 */
function clip(op: 'copy' | 'cut', scope: readonly string[] | null): void {
    let ids = scoped_ids(get(selectingItems), scope, []);
    // The right-click menu hides Cut for protected items, but the KEYBOARD
    // path had no such filter and `del_fs` silently no-ops on them — so
    // Ctrl+X then Ctrl+V cloned the whole portfolio tree and left the original
    // in place, once per repeat.
    if (op === 'cut') {
        ids = ids.filter((id) => !protected_items.includes(id));
    }
    if (ids.length === 0) return;
    clipboard_op.set(op);
    clipboard.set(ids);
}

export function copy(scope: readonly string[] | null): void {
    clip('copy', scope);
}

export function cut(scope: readonly string[] | null): void {
    clip('cut', scope);
}

/**
 * Paste into `id`.
 *
 * There is deliberately NO scope parameter here, unlike `copy`/`cut`. Paste
 * does not read the selection — it reads the clipboard and writes into one
 * named folder — so narrowing a selection buys nothing. The defect that let
 * ONE Ctrl+V paste into two places was a FOCUS defect, and it is fixed where
 * it lives: the desktop's keydown gate (desktop_folder.svelte), which was the
 * only keyboard surface in the app with no z-order awareness.
 */
export function paste(id: string, new_id: string | null = null): void {
    const target = drive_snapshot()[id];
    if (target == null || target.type == 'file') {
        return;
    }

    const batch = get(clipboard);
    if (batch.length == 0) {
        return;
    }
    const was_cut = get(clipboard_op) == 'cut';

    for (const fs_id of batch) {
        // re-check per item: an earlier iteration, or another window, may have
        // removed it since the clipboard was filled
        if (drive_snapshot()[fs_id] == null) continue;
        clone_fs(fs_id, id, new_id);
        if (was_cut) {
            del_fs(fs_id);
        }
    }

    // A cut CONSUMES the clipboard. Leaving the ids behind kept Paste enabled
    // on every void menu, and clicking it threw `required()` on a deleted id
    // out of the menu handler. A copy stays on the clipboard, as in Windows.
    if (was_cut) {
        clipboard.set([]);
        clipboard_op.set('copy');
    }
}

export function del_fs(id: string): void {
    if (protected_items.includes(id)) {
        return;
    }
    const obj = required(drive_snapshot()[id], `fs item ${id}`);

    const child_ids = [...obj.children];
    const parent_id = obj.parent;
    if (parent_id != null && drive_snapshot()[parent_id] != null) {
        hardDrive.update((data) => {
            const parent = required(
                required(data, 'hard drive')[parent_id],
                `fs item ${parent_id}`,
            );
            parent.children = parent.children.filter((el) => el != obj.id);
            parent.date_modified = new Date().getTime();
            return data;
        });
    }

    hardDrive.update((data) => {
        if (data != null) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete data[id];
        }
        return data;
    });

    free_blob(obj);

    for (const child_id of child_ids) {
        del_fs(child_id);
    }
}

/**
 * Release an uploaded file's bytes once nothing references them.
 *
 * Nothing ever called `idb.del` — `del` was not imported anywhere in `src/` —
 * so every upload leaked its bytes forever. Deleting three 150 MB videos and
 * emptying the Recycle Bin left ~450 MB unreachable, and once the origin hit
 * quota every later `set('hard_drive', …)` rejected and the visitor's files
 * vanished on reload.
 *
 * The reference check is what makes this safe: recycling CLONES an item and
 * the clone keeps the same `url` key, so the bytes must survive until the last
 * item pointing at them is gone.
 */
function free_blob(removed: VfsItem): void {
    const url = removed.url;
    if (removed.storage_type !== 'local' || url == null || url === '') return;
    const still_referenced = Object.values(drive_snapshot()).some(
        (item) => item.url === url,
    );
    if (still_referenced) return;
    // A failed release only costs quota — there is nothing the visitor could
    // do about it and nothing to retry, so it is not surfaced.
    void idb.del(url).catch(() => undefined);
}

function dir_contains_dir(a: string | null, b: string | null): boolean {
    if (a == null || b == null) return false;
    const data = drive_snapshot();
    if (data[a] == null) return false;
    if (data[b] == null) return false;
    if (a == b) return true;

    const paths: string[] = [];
    let current = required(data[b], `fs item ${b}`);
    while (current.parent != null) {
        const parent = current.parent;
        paths.push(parent);
        current = required(data[parent], `fs item ${parent}`);
    }
    return paths.includes(a);
}

/**
 * Create an XP-style shortcut (.lnk) to `target_id` in `parent_id`. Opening
 * the shortcut resolves and opens the target (see viewer/desktop open()).
 */
export function create_shortcut(target_id: string, parent_id: string): void {
    const data = drive_snapshot();
    const target = required(data[target_id], `fs item ${target_id}`);
    const parent = required(data[parent_id], `fs item ${parent_id}`);

    const seed = `Shortcut to ${target.basename}`;
    // Filter (don't throw) on missing children: an offline stale cached drive
    // can carry dangling ids (same reason viewer.svelte filters — red-team #9).
    const existing = parent.children.flatMap((el) => {
        const child = data[el];
        return child == null ? [] : [child.name];
    });
    let basename = seed;
    let appendix = 2;
    while (existing.includes(basename + '.lnk')) {
        basename = `${seed} (${String(appendix)})`;
        appendix++;
    }

    const now = new Date().getTime();
    const shortcut: VfsItem = {
        id: short.generate(),
        type: 'file',
        name: basename + '.lnk',
        basename,
        ext: '.lnk',
        parent: parent_id,
        children: [],
        icon: target.icon,
        storage_type: 'fake',
        size: 1,
        shortcut_target: target_id,
        date_created: now,
        date_modified: now,
        sort_option: SortOptions.NONE,
        sort_order: SortOrders.ASCENDING,
    };

    hardDrive.update((drive) => {
        const d = required(drive, 'hard drive');
        d[shortcut.id] = shortcut;
        const p2 = required(d[parent_id], `fs item ${parent_id}`);
        p2.children = [...p2.children, shortcut.id];
        p2.date_modified = now;
        return d;
    });
}

export function clone_fs(
    obj_current_id: string,
    parent_id: string,
    new_id: string | null = null,
): void {
    if (dir_contains_dir(obj_current_id, parent_id)) {
        return;
    }

    const data = drive_snapshot();
    const obj: VfsItem = {
        ...required(data[obj_current_id], `fs item ${obj_current_id}`),
        // The COPY is the visitor's, whatever the original was. Without this a
        // duplicated program icon keeps `fake` + `executable` and the re-seed
        // merge deletes it as a stale placeholder.
        authored: true,
    };

    if (new_id == null) {
        obj.id = short.generate();
    } else {
        obj.id = new_id;
    }

    obj.parent = parent_id;

    const parent_items_names = [
        ...required(data[parent_id], `fs item ${parent_id}`).children.map(
            (el) => required(data[el], `fs item ${el}`).name,
        ),
    ];
    let appendix = 2;
    let basename = obj.basename;
    while (parent_items_names.includes(basename + obj.ext)) {
        basename = obj.basename + ' ' + String(appendix);
        appendix++;
    }
    obj.basename = basename;
    obj.name = basename + obj.ext;

    //backup children
    const children = [...obj.children];
    obj.children = [];

    //save to hard drive
    hardDrive.update((data) => {
        required(data, 'hard drive')[obj.id] = obj;
        return data;
    });

    hardDrive.update((data) => {
        const parent = required(
            required(data, 'hard drive')[parent_id],
            `fs item ${parent_id}`,
        );
        parent.children.push(obj.id);
        parent.date_modified = new Date().getTime();
        return data;
    });

    //recursively clone child items
    for (const child of [...children]) {
        clone_fs(child, obj.id);
    }
}

export async function new_fs_item(
    type: 'file' | 'folder' | null,
    ext: string,
    seedname: string | null,
    parent_id: string | null,
    file: File | null = null,
): Promise<string | undefined> {
    // XP is case-insensitive about extensions; doctype/icon lookups key on
    // lowercase — normalize here so uploads like PHOTO.PNG stay openable
    ext = ext.toLowerCase();
    if (type == null || seedname == null || parent_id == null) {
        return;
    }

    const now = new Date().getTime();
    const item: VfsItem = {
        id: short.generate(),
        type: type,
        path: '',
        name: '',
        storage_type: 'local',
        url: short.generate(),
        ext: ext,
        level: 0,
        parent: parent_id,
        size: 1,
        children: [],
        basename: '',
        date_created: now,
        date_modified: now,
        sort_option: SortOptions.NONE,
        sort_order: SortOrders.ASCENDING,
    };

    const data = drive_snapshot();
    const children = required(
        data[parent_id],
        `fs item ${parent_id}`,
    ).children.map((el) => required(data[el], `fs item ${el}`));

    const parent_items_names = [...children.map((el) => el.name)];

    let appendix = 2;
    seedname = utils.sanitize_filename(seedname);
    let basename = seedname;
    while (parent_items_names.includes(basename + ext)) {
        basename = seedname + ' ' + String(appendix);
        appendix++;
    }
    item.basename = basename;
    item.name = basename + item.ext;

    if (file != null) {
        await idb.set(required(item.url, 'new fs item url'), file);
        item.size = Math.ceil(file.size / 1024);
    } else if (type == 'file') {
        file = await file_from_url(`/empty/empty${item.ext}`, item.name);
        await idb.set(required(item.url, 'new fs item url'), file);
        item.size = Math.ceil(file.size / 1024);
    } else {
        item.url = '';
    }

    hardDrive.update((data) => {
        required(data, 'hard drive')[item.id] = item;
        return data;
    });
    hardDrive.update((data) => {
        const parent = required(
            required(data, 'hard drive')[parent_id],
            `fs item ${parent_id}`,
        );
        parent.children.push(item.id);
        parent.date_modified = now;
        return data;
    });

    return item.id;
}

export async function new_fs_item_raw(
    item: VfsItemDraft,
    parent_id: string | null,
): Promise<string | undefined> {
    if (parent_id == null) {
        return;
    }
    item.id = short.generate();
    item.parent = parent_id;

    const container_types: readonly string[] = ['file', 'folder'];
    if (item.type == null || !container_types.includes(item.type)) {
        item.type = 'file';
    }
    if (item.storage_type == null) {
        item.storage_type = 'local';
    }
    if (item.ext == null) {
        item.ext = '';
    } else {
        item.ext = item.ext.toLowerCase();
    }
    if (item.icon == null) {
        item.icon = '/images/xp/icons/ApplicationWindow.png';
    }
    if (item.children == null) {
        item.children = [];
    }
    const now = new Date().getTime();
    item.date_created = now;
    item.date_modified = now;
    item.sort_option = SortOptions.NONE;
    item.sort_order = SortOrders.ASCENDING;

    const data = drive_snapshot();
    const children = required(
        data[parent_id],
        `fs item ${parent_id}`,
    ).children.map((el) => required(data[el], `fs item ${el}`));

    const parent_items_names = [...children.map((el) => el.name)];

    let appendix = 2;
    const seedname = utils.sanitize_filename(item.basename);
    let basename = seedname;
    while (parent_items_names.includes(basename + item.ext)) {
        basename = seedname + ' ' + String(appendix);
        appendix++;
    }
    item.basename = basename;
    item.name = basename + item.ext;

    if (item.file != null) {
        item.url = short.generate();
        await idb.set(item.url, item.file);
        item.size = Math.ceil(item.file.size / 1024);
        delete item.file;
    }

    const complete = item;
    if (!is_complete_item(complete)) {
        // Unreachable: every required field was populated above. Kept for type
        // narrowing without an unsafe assertion.
        throw new Error('incomplete fs item draft');
    }

    hardDrive.update((data) => {
        required(data, 'hard drive')[complete.id] = complete;
        return data;
    });
    hardDrive.update((data) => {
        const parent = required(
            required(data, 'hard drive')[parent_id],
            `fs item ${parent_id}`,
        );
        parent.children.push(complete.id);
        parent.date_modified = now;
        return data;
    });

    return complete.id;
}

function is_complete_item(
    draft: VfsItemDraft,
): draft is VfsItemDraft & VfsItem {
    return (
        draft.id != null &&
        draft.type != null &&
        draft.name != null &&
        draft.ext != null &&
        draft.children != null &&
        draft.date_created != null &&
        draft.date_modified != null &&
        draft.sort_option != null &&
        draft.sort_order != null
    );
}

export function get_path(id: string): string | null {
    return finder.to_url(id);
}

export async function save_file(
    fs_id: string,
    file: File | Blob,
): Promise<void> {
    const item = drive_snapshot()[fs_id];
    if (item == null) {
        return;
    }
    const url = short.generate();
    await idb.set(url, file);

    const parent_id = required(item.parent, `parent of ${fs_id}`);
    const now = new Date().getTime();
    hardDrive.update((data) => {
        const items = required(data, 'hard drive');
        const target = required(items[fs_id], `fs item ${fs_id}`);
        target.url = url;
        target.storage_type = 'local';
        target.date_modified = now;
        required(items[parent_id], `fs item ${parent_id}`).date_modified = now;
        return data;
    });
}

export async function save_file_as(
    basename: string,
    ext: string,
    file: File | Blob,
    parent_id: string,
    new_id: string | null = null,
): Promise<void> {
    ext = ext.toLowerCase();
    if (util.extname(basename) == ext) {
        basename = util.basename(basename, ext);
    }

    const url = short.generate();
    await idb.set(url, file);

    if (new_id == null) {
        new_id = short.generate();
    }

    const now = new Date().getTime();
    const obj: VfsItem = {
        id: new_id,
        type: 'file',
        path: '',
        name: basename + ext,
        storage_type: 'local',
        url: url,
        ext: ext,
        level: 0,
        parent: parent_id,
        size: Math.round(file.size / 1024),
        children: [],
        basename: basename,
        date_created: now,
        date_modified: now,
        sort_option: SortOptions.NONE,
        sort_order: SortOrders.ASCENDING,
    };

    const data = drive_snapshot();
    const parent_items_names = [
        ...required(data[parent_id], `fs item ${parent_id}`).children.map(
            (el) => required(data[el], `fs item ${el}`).name,
        ),
    ];
    let appendix = 2;
    basename = obj.basename;
    while (parent_items_names.includes(basename + obj.ext)) {
        basename = obj.basename + ' ' + String(appendix);
        appendix++;
    }
    obj.basename = basename;
    obj.name = basename + obj.ext;

    hardDrive.update((data) => {
        const items = required(data, 'hard drive');
        items[obj.id] = obj;
        const parent = required(items[parent_id], `fs item ${parent_id}`);
        parent.children.push(obj.id);
        parent.date_modified = now;
        return data;
    });
}

export async function get_file(id: string): Promise<File> {
    const fs_item = required(drive_snapshot()[id], `fs item ${id}`);
    let file: File | undefined;
    if (fs_item.storage_type == 'remote') {
        file = await file_from_url(required(fs_item.url, `url of ${id}`));
    } else if (fs_item.storage_type == 'local') {
        file = await idb.get<File>(required(fs_item.url, `url of ${id}`));
    }
    const payload = required(file, `file payload of ${id}`);
    return new File([payload], fs_item.name, { type: payload.type });
}

export async function get_url(id: string): Promise<string | undefined> {
    const fs_item = required(drive_snapshot()[id], `fs item ${id}`);

    if (fs_item.storage_type == 'remote') {
        return fs_item.url;
    } else if (fs_item.storage_type == 'local') {
        const file = required(
            await idb.get<Blob>(required(fs_item.url, `url of ${id}`)),
            `file payload of ${id}`,
        );
        return URL.createObjectURL(file);
    }
    return undefined;
}

export async function file_from_url(
    url: string,
    name?: string,
    defaultType = 'image/jpeg',
): Promise<File> {
    try {
        const response = await fetch(url);
        const data = await response.blob();
        return new File([data], String(name), {
            type: data.type || defaultType,
        });
    } catch {
        return new File([''], 'empty.txt', {
            type: 'text/plain',
        });
    }
}

export async function array_buffer_from_url(url: string): Promise<ArrayBuffer> {
    const file = await file_from_url(url);
    return await file.arrayBuffer();
}

export async function buffer_from_url(url: string): Promise<Buffer> {
    const array_buffer = await array_buffer_from_url(url);
    return Buffer.from(array_buffer);
}
