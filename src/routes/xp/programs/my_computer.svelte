<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import { unmount } from 'svelte';
    import {
        runningPrograms,
        hardDrive,
        queueProgram,
    } from '../../../lib/store';
    import { recycle_bin_id, icons } from '../../../lib/system';
    import Menu from '../../../lib/components/xp/Menu.svelte';
    import RButton from '../../../lib/components/xp/RButton.svelte';
    import Viewer from './my_computer/viewer.svelte';
    import * as finder from '../../../lib/finder';
    import * as utils from '../../../lib/utils';
    import { favorites } from '../../../lib/favorites';
    import Sidebar from './my_computer/sidebar.svelte';
    import SearchPanel from './my_computer/search_panel.svelte';
    import FoldersTree from './my_computer/folders_tree.svelte';
    import { required } from '../../../lib/types';
    import type {
        MenuBarEntry,
        ProgramInstance,
        VfsItem,
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

    export let viewer: Viewer | undefined = undefined;

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

    $: menu = [
        {
            name: 'File',
            items: [
                [
                    {
                        name: 'Create Shortcut',
                        disabled: true,
                    },
                ],
                [
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
                        disabled: true,
                    },
                    {
                        name: 'Status Bar',
                        disabled: true,
                    },
                    {
                        name: 'Explorer Bar',
                        disabled: true,
                    },
                ],
                view_modes.map((m) => ({
                    name: m,
                    check: view_mode === m,
                    action: () => {
                        view_mode = m;
                    },
                })),
                [
                    {
                        name: 'Choose Details...',
                        disabled: true,
                    },
                    {
                        name: 'Go To',
                        disabled: true,
                    },
                    {
                        name: 'Refresh',
                        disabled: true,
                    },
                ],
            ],
        },
        {
            name: 'Favorites',
            items: [
                [
                    // Favorites are web links (shared with IE); a file Explorer
                    // has no page/URL to favorite, so these are greyed like the
                    // other inert XP controls. The list below still opens each
                    // favorite in IE.
                    {
                        name: 'Add to Favorites...',
                        disabled: true,
                    },
                    {
                        name: 'Organize Favorites',
                        disabled: true,
                    },
                ],
                $favorites.map((fav) => ({
                    name: fav.name,
                    icon: '/images/xp/icons/URL.png',
                    action: () => {
                        open_favorite(fav.url);
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
                        disabled: true,
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
            console.log('found id', id);
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

    function file_icon(item: VfsItem | null | undefined) {
        if (item == null) return null;
        if (item.icon != null) {
            return `url(${item.icon})`;
        }
        if (icons[item.ext] != null) {
            return `url(/images/xp/icons/${icons[item.ext] ?? ''})`;
        }
        if (item.id == recycle_bin_id) {
            return `url(/images/xp/icons/RecycleBinempty.png)`;
        }
        return null;
    }

    export function open(fs_id: string | null | undefined) {
        if (fs_id == history[page_index]) return;
        console.log('open', fs_id);
        console.log(fs_id == null ? undefined : $hardDrive?.[fs_id]);
        history = [...history.slice(0, page_index + 1), fs_id];
        page_index = history.length - 1;
    }

    function back() {
        page_index = Math.max(0, page_index - 1);
    }

    function next() {
        page_index = Math.min(history.length - 1, page_index + 1);
    }

    // Left explorer bar: common tasks (default), search, or folders tree
    let left_panel: 'tasks' | 'search' | 'folders' = 'tasks';
    function toggle_panel(mode: 'search' | 'folders') {
        left_panel = left_panel === mode ? 'tasks' : mode;
    }

    // Back/Forward history dropdowns
    let history_menu: 'back' | 'forward' | null = null;
    function history_label(id: string | null | undefined): string {
        if (id == null) return 'My Computer';
        const item = $hardDrive?.[id];
        return item?.display_name ?? item?.name ?? 'My Computer';
    }
    interface HistoryOption {
        label: string;
        idx: number;
    }
    $: back_options = history
        .slice(0, page_index)
        .map((id, i): HistoryOption => ({ label: history_label(id), idx: i }))
        .reverse();
    $: forward_options = history
        .slice(page_index + 1)
        .map((id, i): HistoryOption => ({
            label: history_label(id),
            idx: page_index + 1 + i,
        }));
    function pick_history(idx: number) {
        history_menu = null;
        page_index = idx;
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

<Window {options} bind:this={window} on_click_close={destroy}>
    <div
        slot="content"
        class="absolute inset-0.5 flex flex-col bg-xp-yellow overflow-hidden"
    >
        <div
            class="shrink-0 w-full border-b border-stone-300 flex flex-row items-center justify-between"
        >
            <Menu {menu}></Menu>
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
                    style:background-image={file_icon(current_history_item)}
                ></div>
            </div>
            <div
                class="w-[30px] h-[20px] bg-[url(/images/xp/icons/Go.png)] bg-center bg-contain bg-no-repeat"
            ></div>
        </div>

        <div class="grow flex flex-row overflow-hidden">
            {#if left_panel === 'search'}
                <SearchPanel my_computer_instance={mc_interface} />
            {:else if left_panel === 'folders'}
                <FoldersTree
                    my_computer_instance={mc_interface}
                    current_id={history[page_index]}
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
                    id={history[page_index]}
                    {view_mode}
                    on:open={(e: CustomEvent<{ id: string | null }>) => {
                        open(e.detail.id);
                    }}
                    my_computer_instance={mc_interface}
                ></Viewer>
            </div>
        </div>
    </div>
</Window>
