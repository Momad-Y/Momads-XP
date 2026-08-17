<svelte:options accessors={true} />

<script lang="ts">
    import { file_icon_url } from '../../../../lib/file_icon';
    import {
        contextMenu,
        selectingItems,
        zIndex,
        clipboard,
        hardDrive,
        clipboard_op,
        queueProgram,
    } from '../../../../lib/store';

    import * as utils from '../../../../lib/utils';
    import {
        doctypes,
        my_computer,
        hidden_items,
        recycle_bin_id,
        previewable_exts,
    } from '../../../../lib/system';
    import * as fs from '../../../../lib/fs';
    const { long_press, double_tap } = utils;
    import { createEventDispatcher, tick, mount } from 'svelte';
    import { get, set } from 'idb-keyval';
    import { parse_dir } from '../../../../lib/dir_parser';
    import {
        column_value,
        default_details_columns,
        visible_columns,
    } from '../../../../lib/details_columns';
    import type { DetailsColumnKey } from '../../../../lib/details_columns';
    import { required } from '../../../../lib/types';
    import { show_no_association_dialog } from '../../../../lib/no_association';
    import type {
        FSItemOriginator,
        MountedComponent,
        MyComputerInstance,
        VfsItem,
    } from '../../../../lib/types';
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- legacy component-event dispatcher kept as-is; migrating to callback props is a behavior change outside the type-only conversion
    const dispatch = createEventDispatcher<{ open: { id: string | null } }>();
    import Previewable from '../../../../lib/components/xp/Previewable.svelte';
    import hash_sum from 'hash-sum';

    export let self: MountedComponent | undefined = undefined;
    export let my_computer_instance: MyComputerInstance;
    export let id: string | null | undefined = null;
    export let view_mode:
        'Thumbnails' | 'Tiles' | 'Icons' | 'List' | 'Details' = 'Icons';

    // Per-mode layout classes for the item box, icon and label.
    $: item_box = {
        Thumbnails: 'w-[120px] flex-col items-center m-2 text-center',
        Tiles: 'w-[220px] flex-row items-center m-1',
        Icons: 'w-[150px] flex-row items-center m-2',
        List: 'w-[180px] flex-row items-center mx-2 my-0.5',
        Details: 'w-full flex-row items-center mx-1 my-0.5',
    }[view_mode];
    $: icon_box = {
        Thumbnails: 'w-[80px] h-[80px]',
        Tiles: 'w-[32px] h-[32px]',
        Icons: 'w-[50px] h-[50px]',
        List: 'w-[16px] h-[16px]',
        Details: 'w-[16px] h-[16px]',
    }[view_mode];

    /**
     * Which Details columns to render (View > Choose Details...). Name is
     * always shown — it is the item label itself — so only the REST are laid
     * out as columns beside it.
     */
    export let details: readonly DetailsColumnKey[] = default_details_columns;
    $: extra_columns = visible_columns(details).filter((c) => c.key !== 'name');

    /** A point with the optional modifier keys of a (possibly synthetic) click. */
    interface MenuTrigger {
        x: number;
        y: number;
        metaKey?: boolean;
        ctrlKey?: boolean;
    }

    /** Message posted back by the sort worker (sort.js). */
    interface SortMessage {
        type: string;
        id: string | null;
        sorted_items: VfsItem[];
    }

    $: current_folder = id == null ? null : ($hardDrive?.[id] ?? null);
    $: items =
        current_folder == null
            ? []
            : current_folder.children
                  .map((child_id) => $hardDrive?.[child_id])
                  .filter((el) => el != null)
                  .filter((el) => !hidden_items.includes(el.id));

    let sorted_items: VfsItem[] | null;
    $: sorted_items = id ? null : null; //reset sorted_items every time id changes
    // Clear on EVERY navigation. The old `if (id !== undefined)` guard missed
    // the My Computer root, whose id is literally `undefined`, so a one-hop
    // Back left a phantom selection actionable (red-team H3).
    $: clear_on_navigate(id);

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the param exists purely so the reactive statement re-runs when `id` changes
    function clear_on_navigate(_id: string | null | undefined) {
        $selectingItems = [];
    }

    /**
     * Ids this window is actually showing right now. The File menu filters the
     * global `selectingItems` through this so it can never act on an item that
     * lives in another window or on the desktop (red-team CRITICAL).
     */
    export let visible_ids: string[] = [];
    $: visible_ids =
        id == null ? computer.map((el) => el.id) : items.map((el) => el.id);
    const worker = new Worker(new URL('./sort.js', import.meta.url), {
        type: 'module',
    });
    worker.onmessage = ({ data }: MessageEvent<SortMessage>) => {
        if (data.type == 'sorted' && data.id == id) {
            sorted_items = data.sorted_items;
        }
    };

    /**
     * Bumped by `refresh()` so the sort is re-run even though nothing about
     * the folder changed. It rides in the hash because the worker memoises on
     * that hash — without it, a refresh would be answered from the cache and
     * the user would see no evidence anything happened.
     */
    let refresh_nonce = 0;

    /** View > Refresh (and F5): re-read the folder and re-sort it. */
    export function refresh() {
        sorted_items = null;
        refresh_nonce++;
    }

    let last_sort_tx_hash: string | null | undefined;
    $: {
        if (current_folder) {
            const hash_object = {
                id,
                items,
                refresh_nonce,
                sort_option: current_folder.sort_option,
                sort_order: current_folder.sort_order,
            };

            const hash = hash_sum(hash_object);
            if (hash != last_sort_tx_hash) {
                // eslint-disable-next-line no-useless-assignment -- read on the next run of this reactive block
                last_sort_tx_hash = hash;
                worker.postMessage({ type: 'sort', hash, ...hash_object });
            }
        } else {
            // eslint-disable-next-line no-useless-assignment -- read on the next run of this reactive block
            last_sort_tx_hash = null;
        }
    }

    $: is_focus = $zIndex == my_computer_instance.window?.z_index;
    // Filter (don't throw) on missing ids: an offline stale cached drive may
    // predate newer seeded entries in the list (Phase 2 red-team M1).
    // Reactive, not a one-shot const: the root list used to be frozen at mount,
    // so a drive renamed elsewhere never updated and View > Refresh had nothing
    // to re-derive here.
    $: computer = my_computer.flatMap((el) => {
        const item = $hardDrive?.[el];
        return item == null ? [] : [item];
    });

    let node_ref: HTMLDivElement;
    $: {
        if (id != null && $hardDrive?.[id] == null) {
            dispatch('open', { id: null });
        }
        void show_guide();
    }

    export let renaming = false;

    // Drag state for rubber-band select
    let _drag_start: { x: number; y: number } | null = null;
    let _drag_moved = false;
    let _item_long_pressed = false;
    let rb_visible = false;
    let rb_left = 0,
        rb_top = 0,
        rb_width = 0,
        rb_height = 0;

    function on_mousedown(e: MouseEvent) {
        if (e.button !== 0) return;
        _drag_moved = false;
        if (e.target instanceof Element && !e.target.closest('.fs-item')) {
            _drag_start = { x: e.clientX, y: e.clientY };
        }
    }

    function on_mousemove(e: MouseEvent) {
        if (!_drag_start) return;
        const dx = e.clientX - _drag_start.x,
            dy = e.clientY - _drag_start.y;
        if (!_drag_moved && dx * dx + dy * dy < 25) return;
        _drag_moved = true;
        rb_visible = true;
        const cr = node_ref.getBoundingClientRect();
        const [sx, sy, cx, cy] = [
            _drag_start.x,
            _drag_start.y,
            e.clientX,
            e.clientY,
        ];
        const rbc = {
            left: Math.min(sx, cx),
            right: Math.max(sx, cx),
            top: Math.min(sy, cy),
            bottom: Math.max(sy, cy),
        };
        rb_left = rbc.left - cr.left + node_ref.scrollLeft;
        rb_top = rbc.top - cr.top + node_ref.scrollTop;
        rb_width = rbc.right - rbc.left;
        rb_height = rbc.bottom - rbc.top;
        const sel: string[] = [];
        for (const el of node_ref.querySelectorAll('.fs-item')) {
            const r = el.getBoundingClientRect();
            if (
                r.left < rbc.right &&
                r.right > rbc.left &&
                r.top < rbc.bottom &&
                r.bottom > rbc.top
            ) {
                const fid = el.getAttribute('fs-id');
                if (fid != null && $hardDrive?.[fid] != null) sel.push(fid);
            }
        }
        $selectingItems = sel;
    }

    function on_mouseup() {
        if (!_drag_start) return;
        rb_visible = false;
        _drag_start = null;
    }

    function on_rightclick(ev: MenuTrigger, item: VfsItem) {
        const selected = $selectingItems.includes(item.id);
        if (!selected) {
            if (ev.metaKey || ev.ctrlKey) {
                $selectingItems = [...$selectingItems, item.id];
            } else {
                $selectingItems = [item.id];
            }
        }

        contextMenu.set(null);

        const originator: FSItemOriginator = {
            item,
            my_computer_instance,
            open: (item_id: string) => {
                open(item_id);
            },
            rename: () => {
                rename();
            },
        };

        contextMenu.set({
            x: ev.x,
            y: ev.y,
            type: 'FSItem',
            originator: originator,
        });
    }

    function show_void_menu(ev: MenuTrigger) {
        contextMenu.set({
            x: ev.x,
            y: ev.y,
            type: 'FSVoid',
            originator: { id: required(id, 'viewer folder id') },
        });
    }

    function clear_selection() {
        $selectingItems = [];
    }

    let _last_open = 0;
    function open(item_id: string) {
        const now = Date.now();
        if (now - _last_open < 400) return;
        _last_open = now;
        clear_selection();
        const clicked = required($hardDrive?.[item_id], 'fs item ' + item_id);
        if (clicked.parent == recycle_bin_id) return;
        // .lnk shortcut: resolve to its target before opening
        let fs_item = clicked;
        if (clicked.shortcut_target != null) {
            const target = $hardDrive?.[clicked.shortcut_target];
            if (target == null) {
                show_no_association_dialog(clicked.name);
                return;
            }
            fs_item = target;
        }

        const handlers = doctypes[fs_item.ext.toLowerCase()];
        if (fs_item.type == 'file') {
            if (fs_item.executable) {
                queueProgram.set({
                    path: fs_item.url,
                    webapp: fs_item.webapp,
                    exe_item: fs_item,
                });
            } else if (handlers != null) {
                queueProgram.set({
                    path: required(
                        handlers[0],
                        'doctype handler for ' + fs_item.ext,
                    ).path,
                    fs_item: fs_item,
                });
            } else {
                show_no_association_dialog(fs_item.name);
            }
        } else {
            dispatch('open', { id: fs_item.id });
        }
    }

    /**
     * The File menu's Open. Routes through THIS function — the one that
     * resolves .lnk targets, launches executables and dispatches doctypes —
     * rather than my_computer's navigate-only `open()`, which used to send
     * Explorer *inside* a file (red-team H1).
     */
    export function open_item(item_id: string) {
        open(item_id);
    }

    // exported so the Explorer File menu can trigger it too (accessors={true});
    // requires a selection — callers must gate on $selectingItems
    export function rename() {
        renaming = true;
        void tick().then(() => {
            const item_id = required($selectingItems[0], 'renaming selection');
            const el = document.querySelector<HTMLTextAreaElement>(
                `div[fs-id="${item_id}"] textarea`,
            );
            const end_range = required(
                $hardDrive?.[item_id],
                'fs item ' + item_id,
            ).basename.length;
            if (el != null) el.setSelectionRange(0, end_range);
        });
    }

    let rename_cancelled = false;

    function end_renaming(e: Event, item: VfsItem) {
        // Escape abandoned the edit: swallow the blur that tearing down the
        // textarea triggers, so the typed value is never committed.
        if (rename_cancelled) {
            rename_cancelled = false;
            renaming = false;
            return;
        }
        const target = e.target;
        if (!(target instanceof HTMLTextAreaElement)) return;
        const name = utils.sanitize_filename(target.value);

        const ext = utils.extname(name);
        const seedname = utils.basename(name, ext);
        let basename = seedname;

        item.ext = ext.toLowerCase();

        if (basename.trim() == '') {
            renaming = false;
            return;
        }

        const parent_id = required(item.parent, 'parent of ' + item.id);
        const parent_items_names = [
            ...required($hardDrive?.[parent_id], 'fs item ' + parent_id)
                .children.filter((el) => el != item.id)
                .map((el) => required($hardDrive?.[el], 'fs item ' + el).name),
        ];
        let appendix = 2;
        while (parent_items_names.includes(basename + item.ext)) {
            basename = seedname + ' ' + String(appendix);
            appendix++;
        }
        const item_id = item.id;
        if ($hardDrive?.[item_id] != null) {
            $hardDrive[item_id].basename = basename;
            $hardDrive[item_id].ext = item.ext;
            $hardDrive[item_id].name = basename + item.ext;
        }

        renaming = false;
    }

    /**
     * XP's Escape during an inline rename ABANDONS the edit. Without this the
     * textarea's blur handler committed whatever had been typed — and PR #81
     * taught users that Escape dismisses things, making the muscle memory
     * destructive on exactly this surface (red-team M1).
     */
    function cancel_renaming() {
        rename_cancelled = true;
        renaming = false;
    }

    function on_keydown(e: KeyboardEvent) {
        if (my_computer_instance.window?.z_index != $zIndex) return;
        if (renaming) return;
        if (id == null) return;

        if (!(e.ctrlKey || e.metaKey)) return;
        if (e.key == 'c') {
            fs.copy();
        } else if (e.key == 'x') {
            fs.cut();
        } else if (e.key == 'v') {
            fs.paste(id);
        } else if (e.key == 'a') {
            $selectingItems = items.map((el) => el.id);
        } else if (e.key == 'ArrowUp') {
            e.preventDefault();
            my_computer_instance.up();
        }
    }

    async function on_drop(e: DragEvent) {
        e.preventDefault();
        if (id == null) return;

        const copying_obj = await parse_dir({ dataTransfer: e.dataTransfer });
        queueProgram.set({
            path: './programs/copier.svelte',
            copying_obj,
            target_folder_id: id,
        });
    }

    function on_drop_over(e: DragEvent) {
        e.preventDefault();
    }

    async function show_guide() {
        const read_transfer_guide = await get<boolean>(
            'my_computer::read_transfer_guide',
        );

        if (!read_transfer_guide && id != null && window.innerWidth >= 640) {
            const Dialog = (
                await import('../../../../lib/components/xp/Dialog.svelte')
            ).default;
            const buttons = [
                {
                    name: 'OK',
                    action: () => {
                        dialog.destroy();
                    },
                    focus: true,
                },
            ];
            const dialog: { destroy: () => void } = mount(Dialog, {
                target: required(
                    my_computer_instance.window?.node_ref,
                    'my computer window element',
                ),
                props: {
                    title: 'File Transfer',
                    message:
                        'You can drag and drop files or folders from your computer into any folder here to copy them into Windows XP.',
                    buttons,
                    button_align: 'center',
                    get_self: () => dialog,
                },
            });
            void set('my_computer::read_transfer_guide', true);
        }
    }

    /** Root-view items (folders/drives) mirror the grid's selection rules. */
    function select_root_item(e: MouseEvent, item_id: string) {
        if (e.ctrlKey || e.metaKey) {
            $selectingItems = $selectingItems.includes(item_id)
                ? $selectingItems.filter((id) => id !== item_id)
                : [...$selectingItems, item_id];
        } else {
            $selectingItems = [item_id];
        }
    }
</script>

<div
    class="absolute inset-0 overflow-auto bg-slate-50"
    on:drop={on_drop}
    on:dragover={on_drop_over}
    bind:this={node_ref}
    on:mousedown={on_mousedown}
    on:click={(e) => {
        if (
            e.target instanceof Element &&
            !e.target.closest('.fs-item') &&
            !_drag_moved
        ) {
            $selectingItems = [];
        }
    }}
>
    <div
        class="w-full min-h-[90%]"
        class:hidden={id == null}
        on:contextmenu|self={show_void_menu}
        on:click|self={() => {
            if (!_drag_moved) clear_selection();
        }}
        use:long_press
        on:long_press|self={(e: CustomEvent<{ x: number; y: number }>) => {
            if (!_item_long_pressed)
                show_void_menu({ x: e.detail.x, y: e.detail.y });
        }}
    >
        {#if sorted_items}
            {#if view_mode === 'Details'}
                <div
                    class="flex flex-row items-center border-b border-stone-300 bg-[#f1f0e8] text-[11px] font-bold text-slate-700 px-1 sticky top-0"
                >
                    <span class="w-[16px] shrink-0"></span>
                    <span class="grow px-1 mx-0.5">Name</span>
                    {#each extra_columns as col (col.key)}
                        <span
                            class="shrink-0 truncate {col.align === 'right'
                                ? 'text-right pr-2'
                                : ''}"
                            style:width="{col.width ?? 90}px">{col.label}</span
                        >
                    {/each}
                </div>
            {/if}
            {#each sorted_items as item (item.id)}
                <div
                    fs-id={item.id}
                    class="fs-item {item_box} overflow-hidden inline-flex font-MSSS relative align-top
                    {$clipboard.includes(item.id) && $clipboard_op == 'cut'
                        ? 'opacity-70'
                        : ''}"
                    on:dblclick={() => {
                        open(item.id);
                    }}
                    on:contextmenu={(e) => {
                        on_rightclick(e, item);
                    }}
                    on:click={(e) => {
                        if (_drag_moved) return;
                        const fs_id = e.currentTarget.getAttribute('fs-id');
                        if (fs_id == null) return;
                        if (e.ctrlKey || e.metaKey) {
                            $selectingItems = $selectingItems.includes(fs_id)
                                ? $selectingItems.filter((id) => id !== fs_id)
                                : [...$selectingItems, fs_id];
                        } else {
                            $selectingItems = [fs_id];
                        }
                    }}
                    use:double_tap
                    on:double_tap={() => {
                        open(item.id);
                    }}
                    use:long_press
                    on:long_press={(
                        e: CustomEvent<{ x: number; y: number }>,
                    ) => {
                        _item_long_pressed = true;
                        setTimeout(() => (_item_long_pressed = false), 100);
                        on_rightclick({ x: e.detail.x, y: e.detail.y }, item);
                    }}
                >
                    {#if previewable_exts.includes(item.ext)}
                        <div class="{icon_box} shrink-0">
                            <Previewable
                                default_icon={file_icon_url(item)}
                                fs_id={item.id}
                            ></Previewable>
                        </div>
                    {:else}
                        <div
                            class="{icon_box} shrink-0 bg-contain bg-no-repeat bg-center
                        {item.type == 'folder'
                                ? 'bg-[url(/images/xp/icons/FolderClosed.png)]'
                                : 'bg-[url(/images/xp/icons/Default.png)]'} "
                            style:background-image={file_icon_url(item)}
                        ></div>
                    {/if}
                    <p
                        class="px-1 mx-0.5 text-[11px] {view_mode === 'List' ||
                        view_mode === 'Details'
                            ? 'truncate grow'
                            : 'break-words line-clamp-2 text-ellipsis'} leading-tight
                        {$selectingItems.includes(item.id) && is_focus
                            ? 'bg-blue-600 text-slate-50'
                            : ''}"
                    >
                        {item.name}
                    </p>
                    {#if view_mode === 'Details'}
                        {#each extra_columns as col (col.key)}
                            <span
                                class="shrink-0 text-[11px] text-slate-600 truncate {col.align ===
                                'right'
                                    ? 'text-right pr-2'
                                    : ''}"
                                style:width="{col.width ?? 90}px"
                                >{column_value(item, col.key)}</span
                            >
                        {/each}
                    {/if}
                    {#if $selectingItems.includes(item.id) && renaming}
                        <textarea
                            autofocus
                            on:keydown={(e) => {
                                if (e.key == 'Enter') end_renaming(e, item);
                                else if (e.key == 'Escape') cancel_renaming();
                            }}
                            on:blur={(e) => {
                                end_renaming(e, item);
                            }}
                            class="absolute max-h-[40px] right-0 top-2 left-[50px] overflow-hidden
                            outline-none border border-slate-900 text-[11px] font-MSSS z-50 resize-none"
                            >{item.name}</textarea
                        >
                    {/if}
                </div>
            {/each}
        {:else}
            <p class="text-center text-sm font-Trebuchet my-2 text-slate-500">
                working on it...
            </p>
        {/if}
    </div>

    <div class="w-full" class:hidden={id != null}>
        <p class="ml-2 mt-0.5 font-MSSS text-black text-[11px] font-bold">
            Files Stored on This Computer
        </p>
        <div
            class="mb-4 w-[300px] h-[2px] bg-gradient-to-r from-blue-500 to-slate-50"
        ></div>
        <!-- eslint-disable-next-line svelte/require-each-key -- inherited unkeyed each; keying changes DOM reuse semantics -->
        {#each computer.filter((el) => el.type == 'folder') as item}
            <div
                class="fs-item w-[150px] ml-4 mr-8 overflow-hidden inline-flex flex-row items-center font-MSSS"
                on:click={(e) => {
                    select_root_item(e, item.id);
                }}
                on:dblclick={() => {
                    open(item.id);
                }}
                on:contextmenu={(e) => {
                    on_rightclick(e, item);
                }}
                use:double_tap
                on:double_tap={() => {
                    open(item.id);
                }}
                use:long_press
                on:long_press={(e: CustomEvent<{ x: number; y: number }>) => {
                    _item_long_pressed = true;
                    setTimeout(() => (_item_long_pressed = false), 100);
                    on_rightclick({ x: e.detail.x, y: e.detail.y }, item);
                }}
            >
                <div
                    class="w-[50px] h-[50px] shrink-0 bg-[url(/images/xp/icons/FolderClosed.png)] bg-contain bg-no-repeat bg-center"
                    style:background-image={item.icon == null
                        ? ''
                        : `url(${item.icon})`}
                ></div>
                <div
                    class="px-1 text-[11px] line-clamp-2 text-ellipsis leading-tight {$selectingItems.includes(
                        item.id,
                    ) && is_focus
                        ? 'bg-blue-600 text-slate-50'
                        : ''}"
                >
                    {item.display_name != null ? item.display_name : item.name}
                </div>
            </div>
        {/each}

        <p class="ml-2 mt-4 font-MSSS text-black text-[11px] font-bold">
            Hard Disk Drives
        </p>
        <div
            class="mb-4 w-[300px] h-[2px] bg-gradient-to-r from-blue-500 to-slate-50"
        ></div>
        <!-- eslint-disable-next-line svelte/require-each-key -- inherited unkeyed each; keying changes DOM reuse semantics -->
        {#each computer.filter((el) => el.type == 'drive') as item}
            <div
                class="fs-item w-[150px] ml-4 mr-8 overflow-hidden inline-flex flex-row items-center font-MSSS"
                on:click={(e) => {
                    select_root_item(e, item.id);
                }}
                on:dblclick={() => {
                    open(item.id);
                }}
                on:contextmenu={(e) => {
                    on_rightclick(e, item);
                }}
                use:double_tap
                on:double_tap={() => {
                    open(item.id);
                }}
                use:long_press
                on:long_press={(e: CustomEvent<{ x: number; y: number }>) => {
                    _item_long_pressed = true;
                    setTimeout(() => (_item_long_pressed = false), 100);
                    on_rightclick({ x: e.detail.x, y: e.detail.y }, item);
                }}
            >
                <div
                    class="w-[50px] h-[50px] shrink-0 bg-[url(/images/xp/icons/LocalDisk.png)] bg-contain bg-no-repeat bg-center"
                ></div>
                <div
                    class="px-1 text-[11px] line-clamp-2 text-ellipsis leading-tight {$selectingItems.includes(
                        item.id,
                    ) && is_focus
                        ? 'bg-blue-600 text-slate-50'
                        : ''}"
                >
                    {item.display_name != null ? item.display_name : item.name}
                </div>
            </div>
        {/each}

        <p class="ml-2 mt-4 font-MSSS text-black text-[11px] font-bold">
            Devices with Removable Storage
        </p>
        <div
            class="mb-4 w-[300px] h-[2px] bg-gradient-to-r from-blue-500 to-slate-50"
        ></div>
        <!-- eslint-disable-next-line svelte/require-each-key -- inherited unkeyed each; keying changes DOM reuse semantics -->
        {#each computer.filter((el) => el.type == 'removable_storage') as item}
            <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
            <div
                class="fs-item w-[150px] ml-4 mr-8 overflow-hidden inline-flex flex-row items-center font-MSSS"
                on:click={(e) => {
                    select_root_item(e, item.id);
                }}
                on:dblclick={() => {
                    open(item.id);
                }}
                on:contextmenu={(e) => {
                    on_rightclick(e, item);
                }}
                use:double_tap
                on:double_tap={() => {
                    open(item.id);
                }}
                use:long_press
                on:long_press={(e: CustomEvent<{ x: number; y: number }>) => {
                    _item_long_pressed = true;
                    setTimeout(() => (_item_long_pressed = false), 100);
                    on_rightclick({ x: e.detail.x, y: e.detail.y }, item);
                }}
            >
                <div
                    class="w-[50px] h-[50px] shrink-0 bg-[url(/images/xp/icons/RemovableMedia.png)] bg-contain bg-no-repeat bg-center"
                ></div>
                <div
                    class="px-1 text-[11px] line-clamp-2 text-ellipsis leading-tight {$selectingItems.includes(
                        item.id,
                    ) && is_focus
                        ? 'bg-blue-600 text-slate-50'
                        : ''}"
                >
                    {item.display_name != null ? item.display_name : item.name}
                </div>
            </div>
        {/each}
    </div>

    {#if rb_visible}
        <div
            class="absolute pointer-events-none border border-blue-500 bg-blue-500/20"
            style:left="{rb_left}px"
            style:top="{rb_top}px"
            style:width="{rb_width}px"
            style:height="{rb_height}px"
        ></div>
    {/if}
</div>
<svelte:window
    on:keydown={on_keydown}
    on:mousemove={on_mousemove}
    on:mouseup={on_mouseup}
/>
