/**
 * Shared type contracts for the XP shell.
 *
 * `VfsItem` mirrors the seed data in static/json/hard_drive.json plus the
 * transient fields the runtime adds. The remaining interfaces describe the
 * cross-module contracts (program launching, context menus, window chrome)
 * that were previously implicit in the untyped base code.
 */

export interface VfsItem {
    id: string;
    type: 'file' | 'folder' | 'drive' | 'removable_storage';
    name: string;
    basename: string;
    ext: string;
    children: string[];
    date_created: number;
    date_modified: number;
    sort_option: number;
    sort_order: number;
    parent?: string;
    icon?: string;
    /**
     * Meaning depends on `storage_type`: a remote URL (`remote`), an
     * idb-keyval key (`local`), or a `./programs/x.svelte` path for
     * executables (`fake`).
     */
    url?: string;
    path?: string;
    storage_type?: 'local' | 'remote' | 'fake';
    /** File size in KB. */
    size?: number;
    level?: number;
    executable?: boolean;
    starting_point?: boolean;
    /** Drive / removable-storage only. */
    display_name?: string;
    capacity?: number;
    letter?: string;
    /** Legacy webapp descriptor from the pruned webapp program; never read by kept programs. */
    webapp?: unknown;
}

/** The whole virtual file system, keyed by `VfsItem.id`. */
export type HardDrive = Record<string, VfsItem>;

/**
 * A partially-specified `VfsItem` handed to `new_fs_item_raw`, which fills in
 * the missing required fields before inserting it into the hard drive.
 */
export interface VfsItemDraft extends Partial<VfsItem> {
    basename: string;
    /** Transient upload payload persisted to idb-keyval, then removed. */
    file?: File | null;
}

/** A launchable program (see `doctypes` in system.ts). */
export interface ProgramDescriptor {
    path: string;
    icon: string;
    name: string;
}

/** Result of dir_parser's `parse_dir`: nested folders ending in `File` leaves. */
export interface CopyTree {
    [name: string]: File | CopyTree;
}

/**
 * Payload of the `queueProgram` store, consumed by work_space.svelte's
 * `launch()`. `fs_item` may be a partial item (e.g. `{url}` for links).
 */
export interface ProgramLaunchRequest {
    path?: string;
    name?: string;
    icon?: string;
    fs_item?: Partial<VfsItem>;
    webapp?: unknown;
    copying_obj?: CopyTree;
    target_folder_id?: string;
}

/** The window-chrome API a mounted program exposes on its `window` property. */
export interface WindowController {
    minimized: boolean;
    maximized: boolean;
    options: { resizable: boolean; title?: string };
    node_ref: HTMLElement;
    on_click_minimize: () => void;
    on_click_maximize: () => void;
    on_click_close: () => void;
    restore: () => void;
}

/** A mounted program component instance (tracked in `runningPrograms`). */
export interface ProgramInstance {
    window: WindowController;
}

/** Originator for folder-scoped menus (Desktop, FSVoid): the folder's VFS id. */
export interface FolderOriginator {
    id: string;
}

/** Originator for file/folder/drive item menus (FSItem). */
export interface FSItemOriginator {
    item: VfsItem;
    open: (id: string) => void;
    rename: () => void;
    my_computer_instance?: ProgramInstance;
    /** Read by CMFSItem but never populated by current callers. */
    type?: string;
}

/** Payload of the `contextMenu` store, consumed by ContextMenu.svelte. */
export type ContextMenuRequest =
    | { x: number; y: number; type: 'ProgramTile'; originator: ProgramInstance }
    | { x: number; y: number; type: 'Desktop'; originator: FolderOriginator }
    | { x: number; y: number; type: 'FSItem'; originator: FSItemOriginator }
    | { x: number; y: number; type: 'FSVoid'; originator: FolderOriginator }
    | { x: number; y: number; type: 'RecycleBin'; originator: null };

/** One entry of a context menu; `null` inside `items` renders a separator. */
export interface MenuItem {
    name: string;
    action?: () => void | Promise<void>;
    disabled?: boolean;
    font?: string;
    icon?: string;
    icon_size?: number;
    icon_type?: string;
    check?: boolean;
    value?: number;
    items?: (MenuItem | null)[];
}

/** What each context_menu/*.ts `make()` factory returns. */
export interface ContextMenuSpec {
    required_width: number;
    required_height: number;
    menu: MenuItem[][];
}

/** Detail of the `load_page` events dispatched by boot/shutdown components. */
export interface LoadPageEvent {
    url: string;
}

/**
 * Narrow a nullable value at a boundary. The untyped base code dereferenced
 * these values directly (throwing a TypeError when absent); this keeps the
 * same fail-fast semantics with a clearer message.
 */
export function required<T>(value: T | null | undefined, what: string): T {
    if (value == null) {
        throw new Error(`Missing required value: ${what}`);
    }
    return value;
}
