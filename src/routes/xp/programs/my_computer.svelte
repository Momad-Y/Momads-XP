<svelte:options accessors={true} />

<script lang="ts">
    import { file_icon_url } from '../../../lib/file_icon';
    import Window from '../../../lib/components/xp/Window.svelte';
    import { unmount, mount } from 'svelte';
    import {
        runningPrograms,
        hardDrive,
        queueProgram,
        selectingItems,
        zIndex,
        contextMenu,
    } from '../../../lib/store';
    import { recycle_bin_id, protected_items } from '../../../lib/system';
    import * as fs from '../../../lib/fs';
    import {
        is_permanent_delete,
        delete_prompt_icon,
        delete_prompt_message,
    } from '../../../lib/delete_prompt';
    import Dialog from '../../../lib/components/xp/Dialog.svelte';
    import Menu from '../../../lib/components/xp/Menu.svelte';
    import RButton from '../../../lib/components/xp/RButton.svelte';
    import Viewer from './my_computer/viewer.svelte';
    import * as finder from '../../../lib/finder';
    import * as utils from '../../../lib/utils';
    import {
        favorites,
        favorite_icon,
        is_shell_favorite,
    } from '../../../lib/favorites';
    import type { Favorite } from '../../../lib/favorites';
    import { status_info } from '../../../lib/status_bar';
    import { scoped_ids } from '../../../lib/selection';
    import { default_details_columns } from '../../../lib/details_columns';
    import type { DetailsColumnKey } from '../../../lib/details_columns';
    import Sidebar from './my_computer/sidebar.svelte';
    import SearchPanel from './my_computer/search_panel.svelte';
    import FoldersTree from './my_computer/folders_tree.svelte';
    import FavoritesPanel from './my_computer/favorites_panel.svelte';
    import HistoryPanel from './my_computer/history_panel.svelte';
    import ChooseDetails from './my_computer/choose_details.svelte';
    import { required } from '../../../lib/types';
    import type {
        HistoryEntry,
        MenuBarEntry,
        ProgramInstance,
        MountedComponent,
        VfsItem,
        ViewerController,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    export let id: string; //this is the program id, don' confuse with file/folder id
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;
    export let exec_path: string;

    export let fs_item: Partial<VfsItem> | undefined = undefined; //fs: file system, i.e, files and folder
    // widened back from the `undefined` initializer: eslint's TS service
    // narrows `export let` props to their default in top-level flow (Svelte
    // injects the real prop value before this code runs)
    const initial_item = fs_item as Partial<VfsItem> | undefined;
    let history: (string | null | undefined)[] = [initial_item?.id];
    let page_index = 0;
    $: url = finder.to_url(history[page_index]) || 'My Computer';
    $: current_history_id = history[page_index];
    $: current_history_item =
        current_history_id == null
            ? null
            : ($hardDrive?.[current_history_id] ?? null);
    $: {
        const curr_id = history[page_index];

        if (curr_id == null) {
            window?.update_icon('/images/xp/icons/MyComputer.png');
            window?.update_title('My Computer');
        } else if (curr_id == recycle_bin_id) {
            window?.update_icon('/images/xp/icons/RecycleBinempty.png');
            window?.update_title('Recycle Bin');
        } else {
            const curr_item = $hardDrive?.[curr_id];
            if (curr_item) {
                if (curr_item.icon) {
                    window?.update_icon(curr_item.icon);
                } else {
                    window?.update_icon('/images/xp/icons/FolderClosed.png');
                }
                window?.update_title(curr_item.name);
            }
        }
    }

    export let viewer: ViewerController | undefined = undefined;
    /** Ids the viewer is currently rendering (bound below). */
    let viewer_visible_ids: string[] = [];

    // File view mode (§ View menu / Views toolbar dropdown)
    type ViewMode = 'Thumbnails' | 'Tiles' | 'Icons' | 'List' | 'Details';
    let view_mode: ViewMode = 'Icons';
    const view_modes: ViewMode[] = [
        'Thumbnails',
        'Tiles',
        'Icons',
        'List',
        'Details',
    ];
    let views_menu = false;

    /**
     * The My Computer ROOT renders a fixed two-section layout (drives, then
     * folders) rather than the item grid, so Thumbnails/Tiles/Icons/List/Details
     * change nothing there. Grey them rather than let the user click an inert
     * control — every other location, the Recycle Bin included, is a normal
     * folder and honours them.
     */
    $: views_available = current_history_id != null;
    // never leave the dropdown open on a view that cannot use it
    $: if (!views_available) views_menu = false;

    // ── View menu chrome (§ Toolbars / Status Bar / Choose Details) ────────
    // Each toolbar row is toggled independently, exactly as XP's View >
    // Toolbars submenu does. State is per WINDOW — two Explorers can disagree
    // about their chrome, which is why none of this lives in a store.
    let show_standard_buttons = true;
    let show_address_bar = true;
    let show_links = false;
    let show_status_bar = true;
    /** Which Details columns this window shows (View > Choose Details...). */
    let details_visible: DetailsColumnKey[] = [...default_details_columns];
    let show_choose_details = false;

    /** XP's Links toolbar is the web half of the Favorites list. */
    $: link_favorites = $favorites.filter((fav) => !is_shell_favorite(fav));

    function focused(): boolean {
        return window?.z_index === $zIndex;
    }

    /** XP closes an open dropdown on Escape, and refreshes the folder on F5. */
    function on_keydown(event: KeyboardEvent) {
        if (!focused()) return; // focused window only
        if (event.key === 'F5') {
            event.preventDefault();
            // A modal owns the keyboard: don't refresh the list underneath it.
            // Checks the DOM, not one boolean — the delete confirmation and
            // the File Transfer guide mount straight into this window and set
            // no flag, so guarding only `show_choose_details` left two
            // siblings uncovered.
            if (
                !show_choose_details &&
                window?.node_ref?.querySelector('.dialog') == null
            )
                refresh();
            return;
        }
        if (event.key !== 'Escape') return;
        if ($contextMenu != null) return;
        if (show_choose_details) {
            show_choose_details = false;
            return;
        }
        if (views_menu) {
            views_menu = false;
            return;
        }
        // the bars advertise dismissal with a ✕, so Escape should do it too
        if (left_panel !== 'tasks') close_explorer_bar();
    }

    // ── File menu ────────────────────────────────────────────
    // Real XP's Explorer File menu is selection-driven: Open / Create Shortcut
    // / Delete / Rename grey out together when nothing is selected, which is
    // what makes the greying read as contextual rather than broken. Actions
    // reuse the same fs calls as the right-click menu.
    // `selectingItems` is ONE global store shared by the desktop and every
    // Explorer window, so it must be filtered to the ids this window is
    // actually showing. Without this, an Explorer sitting on C:\ would happily
    // Delete/Rename/Shortcut an item selected on the desktop — which was a
    // real, reproducible data-loss path (red-team CRITICAL).
    $: selected_items = scoped_ids($selectingItems, viewer_visible_ids)
        .map((sid) => $hardDrive?.[sid])
        .filter((it): it is VfsItem => it != null);
    $: single_selected = selected_items.length === 1 ? selected_items[0] : null;
    // eligible for shortcutting: lives in a real folder, isn't already a .lnk
    $: shortcut_targets = selected_items.filter(
        (it) =>
            it.parent != null &&
            it.parent != recycle_bin_id &&
            it.ext != '.lnk',
    );
    $: deletable = selected_items.filter(
        (it) => !protected_items.includes(it.id),
    );
    $: renamable =
        single_selected != null &&
        !protected_items.includes(single_selected.id) &&
        single_selected.parent != recycle_bin_id
            ? single_selected
            : null;
    // "New ▸" targets the folder we are browsing. Gate on the item actually
    // being a container: Explorer must never create a child under a FILE node,
    // which corrupted the persisted tree (red-team H1).
    $: new_parent =
        current_history_id != null &&
        current_history_id != recycle_bin_id &&
        current_history_item != null &&
        (current_history_item.type === 'folder' ||
            current_history_item.type === 'drive' ||
            current_history_item.type === 'removable_storage')
            ? current_history_id
            : null;
    // Properties falls back to the folder itself, like XP
    $: properties_target = single_selected ?? current_history_item;
    /**
     * Add to Favorites targets whatever is SELECTED — a file just as much as a
     * folder — and otherwise the folder the window is showing, which is XP's
     * default. Opening a file favourite launches it in its associated program,
     * the same as double-clicking would.
     */
    $: favorite_target = single_selected ?? current_history_item;

    function make_shortcuts() {
        for (const it of shortcut_targets) {
            fs.create_shortcut(
                it.id,
                required(it.parent, 'parent of ' + it.id),
            );
        }
    }

    function delete_selected() {
        const batch = [...deletable];
        const first = batch[0];
        if (first == null) return;
        // Per ITEM, never per batch: collapsing this to one verdict is what
        // permanently destroyed a live file when a batch spanned the Recycle
        // Bin and the desktop (red-team CRITICAL). The prompt only claims
        // permanence when every item is already binned.
        const all_permanent = batch.every((it) =>
            is_permanent_delete(it.parent, recycle_bin_id),
        );
        // Wording lives in src/lib/delete_prompt.ts (unit-tested).
        const dialog: MountedComponent = mount(Dialog, {
            target: window?.node_ref ?? document.body,
            props: {
                title: 'Confirm Delete File',
                icon: delete_prompt_icon(all_permanent),
                message: delete_prompt_message(
                    first.name,
                    batch.length,
                    all_permanent,
                ),
                get_self: () => dialog,
                buttons: [
                    {
                        name: 'OK',
                        focus: true,
                        action: () => {
                            for (const it of batch) {
                                // re-check per item; a folder deleted earlier
                                // in this loop may have taken a descendant
                                // with it, so skip ids that are already gone
                                if ($hardDrive?.[it.id] == null) continue;
                                if (
                                    !is_permanent_delete(
                                        it.parent,
                                        recycle_bin_id,
                                    )
                                ) {
                                    fs.clone_fs(it.id, recycle_bin_id, null);
                                }
                                fs.del_fs(it.id);
                            }
                            void unmount(dialog);
                        },
                    },
                    {
                        name: 'Cancel',
                        action: () => {
                            void unmount(dialog);
                        },
                    },
                ],
            },
        });
    }

    function open_properties() {
        const target = properties_target;
        if (target == null) {
            // My Computer root: XP opens System Properties here (same dialog
            // as right-clicking My Computer / the sidebar's "View System
            // Information"), so the root's File menu is never fully dead.
            queueProgram.set({
                path: './programs/system_properties.svelte',
            });
            return;
        }
        queueProgram.set({
            path:
                target.type == 'drive' || target.type == 'removable_storage'
                    ? './programs/disk_properties.svelte'
                    : './programs/properties.svelte',
            fs_item: target,
        });
    }

    /** XP's File > New ▸ — same entries as the folder-background menu. */
    $: new_submenu =
        new_parent == null
            ? []
            : [
                  {
                      name: 'Folder',
                      icon: '/images/xp/icons/FolderClosed.png',
                      action: () => {
                          void fs.new_fs_item(
                              'folder',
                              '',
                              'New Folder',
                              new_parent,
                          );
                      },
                  },
                  {
                      name: 'Shortcut',
                      icon: '/images/xp/icons/Shortcutoverlay.png',
                      disabled: true,
                  },
                  {
                      name: 'Briefcase',
                      icon: '/images/xp/icons/Briefcase.png',
                      disabled: true,
                  },
                  {
                      name: 'Bitmap Image',
                      icon: '/images/xp/icons/Bitmap.png',
                      action: () => {
                          void fs.new_fs_item(
                              'file',
                              '.bmp',
                              'New Bitmap Image',
                              new_parent,
                          );
                      },
                  },
                  {
                      name: 'Text Document',
                      icon: '/images/xp/icons/TXT.png',
                      action: () => {
                          void fs.new_fs_item(
                              'file',
                              '.txt',
                              'New Text Document',
                              new_parent,
                          );
                      },
                  },
                  {
                      name: 'Wave Sound',
                      icon: '/images/xp/icons/WMV.png',
                      action: () => {
                          void fs.new_fs_item(
                              'file',
                              '.wav',
                              'New Sound',
                              new_parent,
                          );
                      },
                  },
                  {
                      name: 'Compressed (zipped) Folder',
                      icon: '/images/xp/icons/Zipfolder.png',
                      disabled: true,
                  },
              ];

    /** XP's View > Explorer Bar submenu, in XP's order. */
    interface ExplorerBarEntry {
        name: string;
        mode: Exclude<LeftPanel, 'tasks'>;
    }
    const explorer_bars: ExplorerBarEntry[] = [
        { name: 'Search', mode: 'search' },
        { name: 'Favorites', mode: 'favorites' },
        { name: 'History', mode: 'history' },
        { name: 'Folders', mode: 'folders' },
    ];

    /**
     * View > Go To ▸ — the toolbar's three navigation buttons plus the trail
     * itself, with the current stop ticked (XP lists visited folders here).
     */
    $: go_to_submenu = [
        { name: 'Back', disabled: page_index === 0, action: back },
        {
            name: 'Forward',
            disabled: page_index === history.length - 1,
            action: next,
        },
        {
            name: 'Up One Level',
            disabled: current_history_id == null,
            action: up,
        },
        // Capped: the flyout has no scroll and the window clips it, so an
        // uncapped trail pushed the oldest stops out of reach after ~8 hops.
        ...history_entries.slice(-8).map((entry) => ({
            name: entry.label,
            check: entry.idx === page_index,
            // via pick_history, NOT an inline `page_index = …`: an assignment
            // inside a reactive statement makes it a producer of that variable
            // and the compiler then sees a cycle (url → page_index → url).
            action: () => {
                pick_history(entry.idx);
            },
        })),
    ];

    $: menu = [
        {
            name: 'File',
            items: [
                [
                    {
                        name: 'Open',
                        disabled: single_selected == null,
                        action: () => {
                            // viewer.open_item, NOT this component's navigate-only
                            // open() — that sent Explorer *inside* files.
                            if (single_selected != null)
                                viewer?.open_item(single_selected.id);
                        },
                    },
                    {
                        // the Send To targets live on the right-click menu; XP
                        // shows it here too, inert like our other stubs
                        name: 'Send To',
                        disabled: true,
                        items: [],
                    },
                ],
                [
                    {
                        name: 'New',
                        disabled: new_submenu.length === 0,
                        items: new_submenu,
                    },
                ],
                [
                    {
                        name: 'Create Shortcut',
                        disabled: shortcut_targets.length === 0,
                        action: make_shortcuts,
                    },
                    {
                        name: 'Delete',
                        disabled: deletable.length === 0,
                        action: delete_selected,
                    },
                    {
                        name: 'Rename',
                        disabled: renamable == null,
                        action: () => {
                            viewer?.rename();
                        },
                    },
                ],
                [
                    {
                        // never inert: falls back to System Properties at the
                        // My Computer root, exactly like XP
                        name: 'Properties',
                        action: open_properties,
                    },
                    {
                        name: 'Close',
                        action: () => {
                            destroy();
                        },
                    },
                ],
            ],
        },

        {
            name: 'View',
            items: [
                [
                    {
                        name: 'Toolbars',
                        items: [
                            {
                                name: 'Standard Buttons',
                                check: show_standard_buttons,
                                action: () => {
                                    show_standard_buttons =
                                        !show_standard_buttons;
                                },
                            },
                            {
                                name: 'Address Bar',
                                check: show_address_bar,
                                action: () => {
                                    show_address_bar = !show_address_bar;
                                },
                            },
                            {
                                name: 'Links',
                                check: show_links,
                                action: () => {
                                    show_links = !show_links;
                                },
                            },
                        ],
                    },
                    {
                        name: 'Status Bar',
                        check: show_status_bar,
                        action: () => {
                            show_status_bar = !show_status_bar;
                        },
                    },
                    {
                        name: 'Explorer Bar',
                        items: explorer_bars.map((bar) => ({
                            name: bar.name,
                            check: left_panel === bar.mode,
                            action: () => {
                                toggle_panel(bar.mode);
                            },
                        })),
                    },
                ],
                view_modes.map((m) => ({
                    name: m,
                    check: view_mode === m,
                    disabled: !views_available,
                    action: () => {
                        view_mode = m;
                    },
                })),
                [
                    {
                        // only the item list has columns; the fixed root layout
                        // has none, so it greys with the view modes
                        name: 'Choose Details...',
                        disabled: !views_available,
                        action: () => {
                            show_choose_details = true;
                        },
                    },
                    {
                        name: 'Go To',
                        items: go_to_submenu,
                    },
                    {
                        name: 'Refresh',
                        action: refresh,
                    },
                ],
            ],
        },
        {
            name: 'Favorites',
            items: [
                [
                    // XP keeps ONE Favorites list for Explorer and IE, and
                    // Explorer favourites the folder you are looking at.
                    {
                        name: 'Add to Favorites...',
                        // a selected folder wins over the open one; only the
                        // bare My Computer root has nothing to offer
                        disabled: favorite_target == null,
                        action: add_to_favorites,
                    },
                    {
                        name: 'Organize Favorites',
                        action: organize_favorites,
                    },
                ],
                $favorites.map((fav) => ({
                    name: fav.name,
                    icon: favorite_icon(fav, $hardDrive),
                    // A shell favourite goes through the viewer's opener, which
                    // navigates folders and launches files in their associated
                    // program — the same as double-clicking. Web favourites
                    // still hand off to IE.
                    action: () => {
                        open_favorite_entry(fav);
                    },
                })),
            ],
        },
        {
            name: 'Tools',
            items: [
                [
                    {
                        name: 'Map Network Drive...',
                        disabled: true,
                    },
                    {
                        name: 'Disconnect Network Drive...',
                        disabled: true,
                    },
                    {
                        name: 'Synchronize...',
                        disabled: true,
                    },
                ],
                [
                    {
                        name: 'Folder Options...',
                        action: () => {
                            queueProgram.set({
                                path: './programs/folder_options.svelte',
                            });
                        },
                    },
                ],
            ],
        },
        {
            name: 'Help',
            items: [
                [
                    {
                        name: 'Help and Support Center',
                        action: () => {
                            open_link('/help.html');
                        },
                    },
                    {
                        name: 'Is this copy legal?',
                        action: () => {
                            open_link('/help.html#legal');
                        },
                    },
                ],
                [
                    {
                        name: 'About Windows',
                        action: () => {
                            open_link('/help.html#about');
                        },
                    },
                ],
            ],
        },
    ] satisfies MenuBarEntry[];

    $: mc_interface = { window, up, open };

    function on_user_input(e: KeyboardEvent) {
        const target = e.target;
        if (!(target instanceof HTMLInputElement)) return;
        if (e.key == 'Enter') {
            let id = finder.to_id(target.value);

            if (id == null) {
                id = finder.to_id_nocase(target.value);
            }
            if (id) {
                open(id);
                target.blur();
            }
        }
    }

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'my computer instance'));
    }

    export let options: WindowOptions = {
        title: 'My Computer',
        min_width: 500,
        min_height: 400,
        width: 700,
        height: 500,
        icon: '/images/xp/icons/MyComputer.png',
        id: id,
        exec_path,
    };

    export function open(fs_id: string | null | undefined) {
        if (fs_id == history[page_index]) return;
        history = [...history.slice(0, page_index + 1), fs_id];
        page_index = history.length - 1;
    }

    function back() {
        page_index = Math.max(0, page_index - 1);
    }

    function next() {
        page_index = Math.min(history.length - 1, page_index + 1);
    }

    // Left explorer bar (View > Explorer Bar): common tasks by default, else
    // one of XP's four bars.
    type LeftPanel = 'tasks' | 'search' | 'folders' | 'favorites' | 'history';
    let left_panel: LeftPanel = 'tasks';
    function toggle_panel(mode: Exclude<LeftPanel, 'tasks'>) {
        left_panel = left_panel === mode ? 'tasks' : mode;
    }

    /** View > Refresh, and F5. */
    function refresh() {
        viewer?.refresh();
    }

    function close_explorer_bar() {
        left_panel = 'tasks';
    }

    function apply_details(next: DetailsColumnKey[]) {
        details_visible = next;
    }

    function close_choose_details() {
        show_choose_details = false;
    }

    // Back/Forward history dropdowns
    let history_menu: 'back' | 'forward' | null = null;
    function history_label(id: string | null | undefined): string {
        if (id == null) return 'My Computer';
        const item = $hardDrive?.[id];
        return item?.display_name ?? item?.name ?? 'My Computer';
    }
    function history_icon(id: string | null | undefined): string {
        if (id == null) return '/images/xp/icons/MyComputer.png';
        const item = $hardDrive?.[id];
        if (item?.icon != null && item.icon !== '') return item.icon;
        return '/images/xp/icons/FolderClosed.png';
    }
    /** The whole trail — the Go To menu and the History bar both walk it. */
    $: history_entries = history.map((hid, i): HistoryEntry => ({
        label: history_label(hid),
        idx: i,
        icon: history_icon(hid),
    }));
    $: back_options = history_entries.slice(0, page_index).reverse();
    $: forward_options = history_entries.slice(page_index + 1);
    function pick_history(idx: number) {
        history_menu = null;
        page_index = idx;
    }

    // ── Status bar ────────────────────────────────────────────────────────
    // Counts what THIS window is showing. `viewer_visible_ids` is the same
    // filter the File menu uses, so a selection made in another window or on
    // the desktop can never be counted here.
    $: shown_items = viewer_visible_ids
        .map((vid) => $hardDrive?.[vid])
        .filter((it): it is VfsItem => it != null);
    $: status = status_info(shown_items, selected_items);

    /** Opens a favourite the way both Favorites surfaces do. */
    function open_favorite_entry(fav: Favorite) {
        if (fav.fs_id == null || fav.fs_id === '') {
            open_favorite(fav.url);
            return;
        }
        // A favourite outlives its target: deleting to the Recycle Bin mints a
        // NEW id for the clone and drops the original, and nothing prunes the
        // Favorites list. `viewer.open_item` resolves through `required()`, so
        // a stale id THREW out of the click handler. IE degrades to My
        // Computer here, so Explorer does the same.
        if ($hardDrive?.[fav.fs_id] == null) {
            open(null);
            return;
        }
        viewer?.open_item(fav.fs_id);
    }

    function add_to_favorites() {
        if (favorite_target == null) return;
        queueProgram.set({
            path: './programs/add_to_favorites.svelte',
            fs_item: favorite_target,
        });
    }

    function organize_favorites() {
        queueProgram.set({ path: './programs/organize_favorites.svelte' });
    }

    export function up() {
        const current_id = required(history[page_index], 'current folder id');
        const parent_id = required(
            $hardDrive?.[current_id],
            'fs item ' + current_id,
        ).parent;
        open(parent_id);
    }

    function open_favorite(url: string) {
        queueProgram.set({
            path: './programs/internet_explorer.svelte',
            fs_item: { url },
        });
    }

    function open_link(link: string) {
        queueProgram.set({
            path: './programs/internet_explorer.svelte',
            fs_item: { url: link },
        });
    }
</script>

<svelte:window on:keydown={on_keydown} />

<Window {options} bind:this={window} on_click_close={destroy}>
    <div
        slot="content"
        class="absolute inset-0.5 flex flex-col bg-xp-yellow overflow-hidden"
    >
        <div
            class="shrink-0 w-full border-b border-stone-300 flex flex-row items-center justify-between"
        >
            <Menu {menu} focused={window?.z_index === $zIndex}></Menu>
            <div
                class="w-[40px] h-full bg-slate-50 flex items-center justify-center"
            >
                <div
                    class="w-[20px] h-[20px] bg-[url(/images/ms.png)] bg-contain bg-center bg-no-repeat"
                ></div>
            </div>
        </div>
        <div
            class="shrink-0 flex flex-row items-center border-b border-stone-300"
            class:hidden={!show_standard_buttons}
        >
            <div class="relative">
                <RButton
                    icon="/images/xp/icons/Back.png"
                    title="Back"
                    on_click={back}
                    expandable={true}
                    disabled={page_index == 0}
                    on_expand={() => {
                        history_menu = history_menu === 'back' ? null : 'back';
                    }}
                    tooltip_message="Back to Previous"
                ></RButton>
                {#if history_menu === 'back'}
                    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                    <div
                        use:utils.click_outside
                        on:click_outside={() => (history_menu = null)}
                        class="absolute left-0 top-full z-30 min-w-[160px] border border-slate-400 bg-slate-50 shadow text-[11px]"
                    >
                        {#each back_options as opt (opt.idx)}
                            <div
                                class="px-3 py-1 hover:bg-blue-600 hover:text-slate-50 cursor-pointer"
                                on:click={() => {
                                    pick_history(opt.idx);
                                }}
                            >
                                {opt.label}
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
            <div class="relative">
                <RButton
                    icon="/images/xp/icons/Forward.png"
                    on_click={next}
                    expandable={true}
                    disabled={page_index == history.length - 1}
                    on_expand={() => {
                        history_menu =
                            history_menu === 'forward' ? null : 'forward';
                    }}
                ></RButton>
                {#if history_menu === 'forward'}
                    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                    <div
                        use:utils.click_outside
                        on:click_outside={() => (history_menu = null)}
                        class="absolute left-0 top-full z-30 min-w-[160px] border border-slate-400 bg-slate-50 shadow text-[11px]"
                    >
                        {#each forward_options as opt (opt.idx)}
                            <div
                                class="px-3 py-1 hover:bg-blue-600 hover:text-slate-50 cursor-pointer"
                                on:click={() => {
                                    pick_history(opt.idx);
                                }}
                            >
                                {opt.label}
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>

            <RButton
                icon="/images/xp/icons/Up.png"
                on_click={up}
                disabled={history[page_index] == null}
            ></RButton>

            <div class="w-[1px] h-full py-1">
                <div class=" w-full h-full border-l border-stone-300"></div>
            </div>

            <RButton
                icon="/images/xp/icons/Search.png"
                title="Search"
                on_click={() => {
                    toggle_panel('search');
                }}
                tooltip_message="Search"
            ></RButton>
            <RButton
                icon="/images/xp/icons/FolderView.png"
                title="Folders"
                on_click={() => {
                    toggle_panel('folders');
                }}
                tooltip_message="Folders"
            ></RButton>

            <div class="w-[1px] h-full py-1">
                <div class=" w-full h-full border-l border-stone-300"></div>
            </div>

            <div class="relative">
                <RButton
                    icon="/images/xp/icons/FolderView-Classic.png"
                    expandable={true}
                    disabled={!views_available}
                    on_click={() => (views_menu = !views_menu)}
                    on_expand={() => (views_menu = !views_menu)}
                    tooltip_message="Views"
                ></RButton>
                {#if views_menu}
                    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
                    <div
                        use:utils.click_outside
                        on:click_outside={() => (views_menu = false)}
                        class="absolute right-0 top-full z-30 min-w-[120px] border border-slate-400 bg-slate-50 shadow text-[11px]"
                    >
                        {#each view_modes as m (m)}
                            <div
                                class="px-3 py-1 flex flex-row items-center gap-1 hover:bg-blue-600 hover:text-slate-50 cursor-pointer"
                                on:click={() => {
                                    view_mode = m;
                                    views_menu = false;
                                }}
                            >
                                <span class="w-3 text-[9px]"
                                    >{view_mode === m ? '●' : ''}</span
                                >
                                {m}
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
        <div
            class="shrink-0 flex flex-row items-center border-b border-stone-300 text-[11px] items-center"
            class:hidden={!show_address_bar}
        >
            <span class="px-2 text-slate-800">Address</span>
            <div class="grow h-[25px] relative">
                <input
                    class="absolute inset-0 pl-7 outline-none"
                    type="text"
                    on:click={(e) => {
                        e.currentTarget.select();
                    }}
                    on:keyup={on_user_input}
                    value={url}
                />
                <div
                    class="w-[17px] h-[17px] absolute top-[4px] left-[4px]
                    {history[page_index] == null
                        ? 'bg-[url(/images/xp/icons/MyComputer.png)]'
                        : 'bg-[url(/images/xp/icons/FolderClosed.png)]'} bg-contain"
                    style:background-image={file_icon_url(current_history_item)}
                ></div>
            </div>
            <div
                class="w-[30px] h-[20px] bg-[url(/images/xp/icons/Go.png)] bg-center bg-contain bg-no-repeat"
            ></div>
        </div>

        <!-- XP's Links toolbar: the web half of the shared Favorites list -->
        <div
            class="shrink-0 flex flex-row items-center gap-1 px-2 py-1 border-b border-stone-300 text-[11px] overflow-x-auto"
            class:hidden={!show_links}
        >
            <span class="shrink-0 text-slate-800">Links</span>
            {#if link_favorites.length === 0}
                <span class="text-slate-500 italic">no links yet</span>
            {/if}
            {#each link_favorites as fav, i (i)}
                <button
                    type="button"
                    class="shrink-0 flex flex-row items-center px-1 hover:bg-blue-100"
                    on:click={() => {
                        open_favorite(fav.url);
                    }}
                >
                    <span
                        class="w-4 h-4 mr-1 bg-contain bg-no-repeat bg-center"
                        style:background-image="url({favorite_icon(
                            fav,
                            $hardDrive,
                        )})"
                    ></span>
                    {fav.name}
                </button>
            {/each}
        </div>

        <div class="grow flex flex-row overflow-hidden">
            {#if left_panel === 'search'}
                <SearchPanel
                    my_computer_instance={mc_interface}
                    on_close={close_explorer_bar}
                />
            {:else if left_panel === 'folders'}
                <FoldersTree
                    my_computer_instance={mc_interface}
                    current_id={history[page_index]}
                    on_close={close_explorer_bar}
                />
            {:else if left_panel === 'favorites'}
                <FavoritesPanel
                    can_add={favorite_target != null}
                    on_open={open_favorite_entry}
                    on_add={add_to_favorites}
                    on_organize={organize_favorites}
                    on_close={close_explorer_bar}
                />
            {:else if left_panel === 'history'}
                <HistoryPanel
                    entries={history_entries}
                    current_idx={page_index}
                    on_pick={pick_history}
                    on_close={close_explorer_bar}
                />
            {:else}
                <Sidebar
                    my_computer_instance={mc_interface}
                    id={history[page_index]}
                ></Sidebar>
            {/if}
            <div class="grow relative bg-blue-100">
                <Viewer
                    bind:this={viewer}
                    bind:visible_ids={viewer_visible_ids}
                    id={history[page_index]}
                    {view_mode}
                    details={details_visible}
                    on:open={(e: CustomEvent<{ id: string | null }>) => {
                        open(e.detail.id);
                    }}
                    my_computer_instance={mc_interface}
                ></Viewer>
            </div>
        </div>

        <!-- XP's status bar: object count, size, and the security zone -->
        <div
            class="shrink-0 flex flex-row items-center border-t border-stone-300 bg-xp-yellow text-[11px] text-slate-800"
            class:hidden={!show_status_bar}
        >
            <span class="grow px-2 py-0.5 truncate">{status.objects}</span>
            <span
                class="w-[110px] shrink-0 px-2 py-0.5 border-l border-stone-300 truncate"
                >{status.size}</span
            >
            <span
                class="w-[110px] shrink-0 px-2 py-0.5 border-l border-stone-300 truncate"
                >My Computer</span
            >
        </div>

        {#if show_choose_details}
            <ChooseDetails
                visible={details_visible}
                on_apply={apply_details}
                on_close={close_choose_details}
            />
        {/if}
    </div>
</Window>
