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
    /**
     * The VISITOR created this item (a paste, a duplicate, a shortcut) rather
     * than the seed shipping it.
     *
     * Exists because provenance cannot be inferred from `storage_type` +
     * `executable`: `clone_fs` copies the source item wholesale, so a pasted
     * copy of a seed program keeps `fake` + `executable: true` and
     * `is_stale_placeholder` classified it as a pruned program and deleted it
     * on every re-seed. That is the visitor's own file.
     */
    authored?: boolean;
    starting_point?: boolean;
    /** Drive / removable-storage only. */
    display_name?: string;
    capacity?: number;
    letter?: string;
    /** Legacy webapp descriptor from the pruned webapp program; never read by kept programs. */
    webapp?: unknown;
    /** Transient CSS transform applied when the user drags a desktop icon. */
    desktop_css_transform?: string;
    /** Generator-stamped pointer from a seeded entry file into profile.json (Phase 2). */
    portfolio_ref?: PortfolioRef;
    /** A shortcut (.lnk): opening resolves and opens this target item's id. */
    shortcut_target?: string;
}

export type PortfolioSection =
    | 'experience'
    | 'projects'
    | 'education'
    | 'skills'
    | 'awards'
    | 'certifications';

/** Stamped only by scripts/generate-vfs.ts; consumed by portfolio_viewer. */
export interface PortfolioRef {
    section: PortfolioSection;
    /** Array index, except `skills` where it is the category name. */
    key: number | string;
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
    /**
     * The launched executable's own VFS item (name/icon source for the
     * placeholder). Distinct from `fs_item`, which is the *argument* some
     * programs open (e.g. the folder my_computer displays).
     */
    exe_item?: Partial<VfsItem>;
    webapp?: unknown;
    /** Page markup for source_viewer (IE's View > Source). */
    source?: { url: string; text: string };
    copying_obj?: CopyTree;
    target_folder_id?: string;
}

/**
 * The `options` prop consumed by Window.svelte / TitleBar.svelte. Programs
 * seed it with their chrome preferences; Window fills in defaults at mount.
 */
export interface WindowOptions {
    title?: string;
    icon?: string | null;
    /** Program instance id (matches the `.program-tile[program-id]` DOM hook). */
    id?: string;
    /** idb-keyval key used to persist the window rect between sessions. */
    exec_path?: string;
    top?: number;
    left?: number;
    width?: number;
    height?: number;
    min_width?: number;
    min_height?: number;
    aspect_ratio?: number;
    background?: string;
    resizable?: boolean;
    draggable?: boolean;
    mobile_maximize?: boolean;
    close_btn?: boolean;
    maximize_btn?: boolean;
    minimize_btn?: boolean;
    close_btn_disabled?: boolean;
    maximize_btn_disabled?: boolean;
    minimize_btn_disabled?: boolean;
}

/** The window-chrome API a mounted program exposes on its `window` property. */
export interface WindowController {
    /** `undefined` until the window has been minimized/maximized once. */
    minimized: boolean | undefined;
    maximized: boolean | undefined;
    options: WindowOptions;
    /** `undefined` until Window.svelte's internal `bind:this` resolves at mount. */
    node_ref: HTMLElement | undefined;
    z_index: number;
    on_click_minimize: () => void;
    on_click_maximize: () => void;
    on_click_close: () => void;
    restore: () => void;
    focus: () => void;
    loose_focus: () => void;
    update_icon: (icon: string) => void;
    update_title: (title: string) => void;
    show_toast: (toast: { theme?: string; message: string }) => void;
}

/**
 * A mounted program component instance (tracked in `runningPrograms`).
 * A type alias (not an interface) so it stays assignable to the
 * `Record<string, any>` parameter of Svelte's `unmount()`.
 */
export type ProgramInstance = {
    /** Program instance id (same value as `options.id`). */
    id?: string;
    /** Undefined until Window.svelte's `bind:this` resolves after mount. */
    window: WindowController | undefined;
    options: WindowOptions;
};

/**
 * Loose handle for anything returned by Svelte's `mount()` — used for the
 * `get_self` self-reference props that modal/panel components expose so they
 * can `unmount()` themselves.
 */
export type MountedComponent = Record<string, unknown>;

/** One button of a Dialog.svelte prompt. */
export interface DialogButton {
    name: string;
    /** The event is optional: Escape invokes Cancel with no click behind it. */
    action: (event?: MouseEvent) => void;
    focus?: boolean;
}

/** One top-level entry of a window menu bar (Menu.svelte). */
export interface MenuBarEntry {
    name: string;
    /** Groups of dropdown entries; groups render separated by rules. */
    items?: MenuItem[][];
}

/**
 * viewer.svelte's public API (`accessors={true}`), used by my_computer.svelte's
 * File menu. Mirrors the WindowController pattern: an explicit interface rather
 * than the component type, so calls are typed instead of `any`.
 */
export interface ViewerController {
    rename: () => void;
    /** Opens an item the way a double-click does (resolves .lnk, launches). */
    open_item: (item_id: string) => void;
    /** View > Refresh / F5: re-reads and re-sorts the current folder. */
    refresh: () => void;
}

/**
 * One stop on an Explorer window's navigation trail — shared by the
 * Back/Forward dropdowns, the Go To menu and the History Explorer Bar, which
 * all walk the same `history` array.
 */
export interface HistoryEntry {
    label: string;
    /** Index into the window's `history` array. */
    idx: number;
    icon: string;
}

/** Originator for folder-scoped menus (Desktop, FSVoid): the folder's VFS id. */
export interface FolderOriginator {
    id: string;
}

/**
 * The navigation interface my_computer.svelte exposes to its sidebar/viewer
 * children and to FSItem context menus (`mc_interface` in my_computer.svelte).
 */
export interface MyComputerInstance {
    window: WindowController | undefined;
    up: () => void;
    open: (fs_id: string | null | undefined) => void;
}

/** Originator for file/folder/drive item menus (FSItem). */
export interface FSItemOriginator {
    item: VfsItem;
    open: (id: string) => void;
    rename: () => void;
    my_computer_instance?: MyComputerInstance;
    /**
     * The ids the surface that opened this menu is showing. `selectingItems`
     * is ONE global store shared by the desktop and every Explorer window, so
     * destructive actions must narrow to this or they act on another
     * surface's selection. Absent means "unknown" — callers fail closed onto
     * `item` alone rather than trusting the raw store.
     */
    visible_ids?: string[];
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

/** One "Save as type" entry offered by SaveModal / Viewer3 (see paint.svelte). */
export interface SaveAsFiletype {
    name: string;
    mime: string;
    value?: string;
    ext: string;
}

/** Payload of Viewer3's / SaveModal's `on_save` callback. */
export interface SaveAsSelection {
    parent_id: string;
    filename: string;
    selected_filetype: SaveAsFiletype;
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

/** True when a launch-request `fs_item` payload carries every required field. */
export function is_full_vfs_item(item: Partial<VfsItem>): item is VfsItem {
    return (
        item.id != null &&
        item.type != null &&
        item.name != null &&
        item.basename != null &&
        item.ext != null &&
        item.children != null &&
        item.date_created != null &&
        item.date_modified != null &&
        item.sort_option != null &&
        item.sort_order != null
    );
}

/**
 * Narrow a `ProgramLaunchRequest.fs_item` payload to a full `VfsItem` at the
 * work_space → program boundary. Programs other than my_computer always
 * receive full items (the untyped base crashed later on partial ones; this
 * fails fast at launch instead).
 */
export function full_vfs_item(
    item: Partial<VfsItem> | undefined,
): VfsItem | undefined {
    if (item == null) return undefined;
    if (!is_full_vfs_item(item)) {
        throw new Error('Program launch requires a full fs item');
    }
    return item;
}
