<svelte:options accessors={true} />

<script lang="ts">
    import { file_icon_url } from '../../lib/file_icon';
    import {
        contextMenu,
        selectingItems,
        clipboard,
        hardDrive,
        clipboard_op,
        queueProgram,
    } from '../../lib/store';

    import * as utils from '../../lib/utils';
    import {
        doctypes,
        desktop_folder,
        previewable_exts,
    } from '../../lib/system';
    import * as fs from '../../lib/fs';
    const { click_outside, long_press, double_tap } = utils;
    import { tick } from 'svelte';
    import RecycleBin from '../../lib/components/xp/RecycleBin.svelte';
    import { parse_dir } from '../../lib/dir_parser';
    import Previewable from '../../lib/components/xp/Previewable.svelte';
    import { required } from '../../lib/types';
    import type { FSItemOriginator, VfsItem } from '../../lib/types';
    import { show_no_association_dialog } from '../../lib/no_association';

    const id = desktop_folder;

    $: desktop_item = $hardDrive?.[id] ?? null;
    $: items =
        desktop_item == null
            ? []
            : desktop_item.children
                  .map((child_id) => $hardDrive?.[child_id])
                  .filter((el) => el != null);

    let is_focus = true;
    let item_long_pressed = false;
    let node_ref: HTMLDivElement;
    const cell_size = 80;

    export let renaming = false;

    /** A point with the optional modifier keys of a (possibly synthetic) click. */
    interface MenuTrigger {
        x: number;
        y: number;
        metaKey?: boolean;
        ctrlKey?: boolean;
    }

    // Drag state: shared between rubber-band select and icon repositioning
    type DragStart =
        | {
              x: number;
              y: number;
              on_item: true;
              item_el: HTMLElement;
              item_fs_id: string | null;
              item_tx: number;
              item_ty: number;
          }
        | { x: number; y: number; on_item: false };
    let _drag_start: DragStart | null = null;
    let _drag_moved = false;
    let rb_visible = false;
    let rb_left = 0,
        rb_top = 0,
        rb_width = 0,
        rb_height = 0;

    function parse_translate(str: string) {
        if (!str) return { x: 0, y: 0 };
        const m = str.match(/translate(?:3d)?\(([^,]+)px,\s*([^,)]+)px/);
        return m
            ? { x: parseFloat(m[1] ?? ''), y: parseFloat(m[2] ?? '') }
            : { x: 0, y: 0 };
    }

    function on_mousedown(e: MouseEvent) {
        if (e.button !== 0) return;
        _drag_moved = false;
        const item_el =
            e.target instanceof Element
                ? e.target.closest<HTMLElement>('.fs-item')
                : null;
        if (item_el) {
            const t = parse_translate(item_el.style.transform);
            _drag_start = {
                x: e.clientX,
                y: e.clientY,
                on_item: true,
                item_el,
                item_fs_id: item_el.getAttribute('fs-id'),
                item_tx: t.x,
                item_ty: t.y,
            };
        } else {
            _drag_start = { x: e.clientX, y: e.clientY, on_item: false };
        }
    }

    function on_mousemove(e: MouseEvent) {
        if (!_drag_start) return;
        const dx = e.clientX - _drag_start.x,
            dy = e.clientY - _drag_start.y;
        if (!_drag_moved && dx * dx + dy * dy < 25) return;
        _drag_moved = true;
        if (_drag_start.on_item) {
            _drag_start.item_el.style.transform = `translate(${String(_drag_start.item_tx + dx)}px, ${String(_drag_start.item_ty + dy)}px)`;
        } else {
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
            rb_left = rbc.left - cr.left;
            rb_top = rbc.top - cr.top;
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
    }

    function on_mouseup() {
        if (!_drag_start) return;
        if (_drag_start.on_item && _drag_moved) {
            const fid = _drag_start.item_fs_id;
            if (fid != null && $hardDrive?.[fid] != null) {
                $hardDrive[fid].desktop_css_transform =
                    _drag_start.item_el.style.transform;
            }
        }
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
            open: (id: string) => {
                open(id);
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
        const originator = { id };
        contextMenu.set({ x: ev.x, y: ev.y, type: 'Desktop', originator });
    }

    function clear_selection() {
        $selectingItems = [];
    }

    let _last_open = 0;
    function open(id: string) {
        // debounce: double_tap and dblclick may both fire on mobile
        const now = Date.now();
        if (now - _last_open < 400) return;
        _last_open = now;

        is_focus = false;
        clear_selection();
        const clicked = required($hardDrive?.[id], 'fs item ' + id);
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
            queueProgram.set({
                path: './programs/my_computer.svelte',
                fs_item: fs_item,
            });
        }
    }

    function rename() {
        renaming = true;
        void tick().then(() => {
            const id = required($selectingItems[0], 'renaming selection');
            const el = document.querySelector<HTMLTextAreaElement>(
                `div[fs-id="${id}"] textarea`,
            );
            const end_range = required($hardDrive?.[id], 'fs item ' + id)
                .basename.length;
            if (el != null) el.setSelectionRange(0, end_range);
        });
    }

    function end_renaming(e: Event, item: VfsItem) {
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

    function on_keydown(e: KeyboardEvent) {
        if (!is_focus) return;
        if (renaming) return;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive guard kept from the base (id is a const today)
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
        }
    }

    async function on_drop(e: DragEvent) {
        e.preventDefault();
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- defensive guard kept from the base (id is a const today)
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
</script>

<div
    class="absolute z-0 inset-0 overflow-hidden bg-transparent"
    on:drop={on_drop}
    on:dragover={on_drop_over}
    on:mousedown={on_mousedown}
    on:click={(e) => {
        is_focus = true;
        if (
            e.target instanceof Element &&
            !e.target.closest('.fs-item') &&
            !_drag_moved
        ) {
            $selectingItems = [];
        }
    }}
    use:click_outside
    on:click_outside={() => {
        is_focus = false;
    }}
    on:contextmenu|self={show_void_menu}
    use:long_press
    on:long_press|self={(e: CustomEvent<{ x: number; y: number }>) => {
        if (!item_long_pressed)
            show_void_menu({ x: e.detail.x, y: e.detail.y });
    }}
    bind:this={node_ref}
>
    <!-- eslint-disable @typescript-eslint/no-unnecessary-condition -- defensive guard kept from the base (id is a const today) -->
    <div
        class="top-0 left-0 bottom-0 absolute flex flex-col flex-wrap"
        class:hidden={id == null}
    >
        <!-- eslint-enable @typescript-eslint/no-unnecessary-condition -->
        {#each items as item (item.id)}
            <div
                fs-id={item.id}
                class="relative fs-item w-[150px] flex-shrink-0 flex-grow-0 overflow-hidden m-2 inline-flex flex-col items-center font-MSSS"
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
                use:long_press
                on:long_press={(e: CustomEvent<{ x: number; y: number }>) => {
                    item_long_pressed = true;
                    setTimeout(() => (item_long_pressed = false), 100);
                    on_rightclick({ x: e.detail.x, y: e.detail.y }, item);
                }}
                use:double_tap
                on:double_tap={() => {
                    open(item.id);
                }}
                style:transform={item.desktop_css_transform}
                style:width="{cell_size}px"
                style:height="{cell_size}px"
                style:touch-action="manipulation"
            >
                {#if previewable_exts.includes(item.ext)}
                    <Previewable
                        size={40}
                        default_icon={file_icon_url(item)}
                        fs_id={item.id}
                    ></Previewable>
                {:else}
                    <div
                        class="w-[40px] h-[40px] shrink-0 bg-contain bg-no-repeat bg-center
                        {$clipboard.includes(item.id) && $clipboard_op == 'cut'
                            ? 'opacity-70'
                            : ''}
                        {item.type == 'folder'
                            ? 'bg-[url(/images/xp/icons/FolderClosed.png)]'
                            : 'bg-[url(/images/xp/icons/Default.png)]'} "
                        style:background-image={file_icon_url(item)}
                    ></div>
                {/if}
                <p
                    class="px-1 mx-0.5 text-[11px] break-words line-clamp-2 text-ellipsis leading-tight text-center text-white
                    {$selectingItems.includes(item.id) && is_focus
                        ? 'bg-blue-600 text-slate-50'
                        : ''}"
                    style="text-shadow: 1px 1px 2px black;"
                >
                    {item.executable ? item.basename : item.name}
                </p>
                {#if $selectingItems.includes(item.id) && renaming}
                    <textarea
                        autofocus
                        on:keydown={(e) => {
                            if (e.key == 'Enter') end_renaming(e, item);
                        }}
                        on:blur={(e) => {
                            end_renaming(e, item);
                        }}
                        class="absolute max-h-[40px] left-0 top-[40px] right-0 bottom-0 overflow-hidden
                        outline-none border-1 border-slate-900 text-[11px] font-MSSS z-50 resize-none"
                        >{item.name}</textarea
                    >
                {/if}
            </div>
        {/each}
    </div>

    <RecycleBin style="width: {cell_size}px;height: {cell_size}px;"
    ></RecycleBin>

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
