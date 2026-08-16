<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import { onMount, unmount } from 'svelte';
    import {
        favorites,
        add_favorite,
        remove_favorite,
        is_shell_favorite,
        favorite_icon,
    } from '../../../lib/favorites';
    import {
        runningPrograms,
        zIndex,
        queueProgram,
        hardDrive,
    } from '../../../lib/store';
    import Menu from '../../../lib/components/xp/Menu.svelte';
    import RButton from '../../../lib/components/xp/RButton.svelte';
    import ProgressBar from '../../../lib/components/xp/ProgressBar.svelte';
    import buildUrl from 'build-url';
    import isURL from 'is-valid-http-url';
    import * as fs from '../../../lib/fs';
    import { desktop_folder } from '../../../lib/system';
    import * as utils from '../../../lib/utils';
    import * as finder from '../../../lib/finder';
    import { required } from '../../../lib/types';
    import type {
        MenuBarEntry,
        ProgramInstance,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    export let id: string;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;
    export let url: string | null | undefined = undefined;
    export let exec_path: string;

    let iframe: HTMLIFrameElement | undefined;
    let address_input: HTMLInputElement;
    // widened back from the `undefined` initializer: eslint's TS service
    // narrows `export let` props to their default in top-level flow (Svelte
    // injects the real prop value before this code runs)
    const initial_url = url as string | null | undefined;
    const homepage = initial_url ? initial_url : 'https://wiby.me/';

    let nav_history = [homepage];
    let page_index = 0;
    let loading = true;
    let real_url: string | null | undefined;

    // Address bar text — kept in sync with navigation
    let address_text = homepage;

    type SidebarMode = 'search' | 'favorites' | 'history';
    let sidebar_mode: SidebarMode | null = null;
    let search_query = '';

    // Favorites — shared store (also backs My Computer's Favorites menu)
    let adding_fav = false;
    let pending_fav_name = '';

    function start_add_favorite() {
        pending_fav_name = hostname_of(address_text);
        adding_fav = true;
        sidebar_mode = 'favorites';
    }

    function confirm_add_favorite() {
        if (!pending_fav_name.trim()) return;
        add_favorite({ name: pending_fav_name.trim(), url: address_text });
        adding_fav = false;
    }

    function remove_fav(i: number) {
        remove_favorite(i);
    }

    async function create_desktop_shortcut() {
        const target = address_text;
        const name = hostname_of(target) || 'Web Page';
        await fs.new_fs_item_raw(
            {
                basename: name,
                ext: '.url',
                storage_type: 'remote',
                url: target,
                icon: '/images/xp/icons/InternetShortcut.png',
            },
            desktop_folder,
        );
        window?.show_toast({
            message: `Shortcut to ${name} created on the desktop.`,
        });
    }

    /**
     * Opens a file-system favourite in Explorer. A folder opens as itself; a
     * file opens its parent folder, which is the closest thing a browser can
     * usefully do with one.
     */
    function open_shell_favorite(fs_id: string | undefined) {
        if (fs_id == null || fs_id === '') return;
        const item = $hardDrive?.[fs_id];
        const target = item?.type === 'file' ? item.parent : fs_id;
        queueProgram.set({
            path: './programs/my_computer.svelte',
            fs_item: { id: target ?? fs_id },
        });
    }

    function hostname_of(u: string) {
        try {
            return new URL(u).hostname;
        } catch {
            return u;
        }
    }

    onMount(async () => {
        real_url = await to_real_url(
            required(nav_history[page_index], 'history entry'),
        );
    });

    // ── Navigation ──────────────────────────────────────────

    async function load_page(nav_url?: string) {
        loading = true;
        let u = nav_url ?? address_input.value;
        if (!u || u.trim() === '') return;

        if (/^[A-Z]:\\/.test(u)) {
            // local file — pass through
        } else if (u.startsWith('/')) {
            // same-origin page (e.g. /help.html) — pass through
        } else if (!u.startsWith('https://') && !u.startsWith('http://')) {
            u = 'https://' + u;
            if (!isURL(u)) {
                u = buildUrl('https://bing.com', {
                    path: 'search',
                    queryParams: { q: (nav_url ?? address_input.value).trim() },
                });
            }
        }

        // Truncate forward history, push new entry
        nav_history = [...nav_history.slice(0, page_index + 1), u];
        page_index = nav_history.length - 1;
        address_text = u;
        await resolve_url(u);
    }

    async function navigate_to(idx: number) {
        if (idx < 0 || idx >= nav_history.length) return;
        page_index = idx;
        const u = required(nav_history[idx], 'history entry');
        address_text = u;
        loading = true;
        await resolve_url(u);
    }

    async function resolve_url(u: string) {
        real_url = null; // reset so Svelte always re-mounts the iframe, even if URL is unchanged
        real_url = await to_real_url(u);
    }

    function back() {
        void navigate_to(page_index - 1);
    }
    function forward() {
        void navigate_to(page_index + 1);
    }

    // Back/Forward history dropdowns (XP shows the pages you'd step through)
    let history_menu: 'back' | 'forward' | null = null;
    interface HistoryOption {
        label: string;
        idx: number;
    }
    $: back_options = nav_history
        .slice(0, page_index)
        .map((u, i): HistoryOption => ({ label: hostname_of(u), idx: i }))
        .reverse();
    $: forward_options = nav_history
        .slice(page_index + 1)
        .map((u, i): HistoryOption => ({
            label: hostname_of(u),
            idx: page_index + 1 + i,
        }));
    function pick_history(idx: number) {
        history_menu = null;
        void navigate_to(idx);
    }

    function stop() {
        try {
            iframe?.contentWindow?.stop();
        } catch {
            /* cross-origin frame */
        }
        loading = false;
    }

    function refresh() {
        loading = true;
        const src = real_url;
        real_url = null;
        setTimeout(() => {
            real_url = src;
        }, 50);
    }

    function go_home() {
        void load_page(homepage);
    }

    /**
     * An app-owned page (`/help.html`, …) is same-origin and authored by us, so
     * the iframe may read it. A LOCAL file is served from a `blob:` URL, which
     * inherits our origin — granting that same-origin access would hand a
     * user-dropped .html our localStorage and the whole VFS, which is exactly
     * what the sandbox is there to prevent. External https pages are
     * cross-origin regardless, so the flag would buy nothing.
     */
    $: iframe_sandbox =
        real_url != null &&
        real_url.startsWith('/') &&
        // CRITICAL: /api/browse serves EXTERNAL pages from our own path. It
        // must never be treated as app-owned — granting it same-origin would
        // hand any website on the internet our localStorage and the whole VFS.
        // Proxied pages stay on an opaque origin and report navigation over
        // postMessage instead.
        !real_url.startsWith('/api/browse')
            ? 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin'
            : 'allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox';

    /**
     * Follow navigation that happened INSIDE the frame (clicking a link on the
     * page) so the address bar, the Back/Forward dropdowns and Create Shortcut
     * describe where the user actually is. Only possible for app-owned pages:
     * for an external site the browser refuses to tell us the URL, and no
     * amount of code changes that.
     */
    function sync_url_from_iframe() {
        let href: string | null;
        try {
            href = iframe?.contentWindow?.location.href ?? null;
        } catch {
            return; // cross-origin — unknowable by design
        }
        if (href == null || href === 'about:blank') return;
        const origin = globalThis.location.origin;
        const seen = href.startsWith(origin) ? href.slice(origin.length) : href;
        if (seen === nav_history[page_index]) return;
        nav_history = [...nav_history.slice(0, page_index + 1), seen];
        page_index = nav_history.length - 1;
        address_text = seen;
    }

    function iframe_loaded() {
        loading = false;
        sync_url_from_iframe();
        // Update window title (works for same-origin pages only)
        try {
            const t = iframe?.contentDocument?.title;
            if (t)
                options = {
                    ...options,
                    title: t + ' - Microsoft Internet Explorer',
                };
            else options = { ...options, title: 'Microsoft Internet Explorer' };
        } catch {
            options = { ...options, title: 'Microsoft Internet Explorer' };
        }
    }

    function on_address_keydown(e: KeyboardEvent) {
        if (e.key === 'Enter') {
            void load_page();
            e.preventDefault();
        }
        if (e.key === 'Escape') address_input.blur();
    }

    function do_search() {
        if (!search_query.trim()) return;
        void load_page(
            'https://bing.com/search?q=' +
                encodeURIComponent(search_query.trim()),
        );
        sidebar_mode = null;
        search_query = '';
    }

    function toggle_sidebar(mode: SidebarMode) {
        sidebar_mode = sidebar_mode === mode ? null : mode;
        if (mode !== 'favorites') adding_fav = false;
    }

    // ── Keyboard shortcuts ───────────────────────────────────

    function on_keydown(e: KeyboardEvent) {
        if (e.key === 'F5') {
            e.preventDefault();
            refresh();
            return;
        }
        if (e.altKey && e.key === 'ArrowLeft') {
            e.preventDefault();
            back();
            return;
        }
        if (e.altKey && e.key === 'ArrowRight') {
            e.preventDefault();
            forward();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
            e.preventDefault();
            address_input.focus();
            address_input.select();
        }
    }

    // ── Helpers ──────────────────────────────────────────────

    async function to_real_url(target_url: string) {
        if (/^[A-Z]:\\/.test(target_url)) {
            const file = await fs.get_file(
                required(finder.to_id(target_url), 'fs id for ' + target_url),
            );
            return URL.createObjectURL(file);
        }
        // External pages go through our proxy so the frame is served from our
        // origin with a navigation reporter injected — that is what lets the
        // address bar, history, shortcuts and favourites follow the user.
        // The frame is still sandboxed WITHOUT allow-same-origin, so the page
        // runs on an opaque origin and cannot touch our storage.
        if (
            target_url.startsWith('http://') ||
            target_url.startsWith('https://')
        ) {
            return `/api/browse?url=${encodeURIComponent(target_url)}`;
        }
        return target_url;
    }

    /**
     * Navigation reported by the proxy's injected script. The page is untrusted,
     * so only http(s) URLs of sane length are accepted, and only from our own
     * frame.
     */
    function on_frame_message(event: MessageEvent) {
        if (iframe?.contentWindow == null) return;
        if (event.source !== iframe.contentWindow) return;
        const data: unknown = event.data;
        if (typeof data !== 'object' || data === null) return;
        if (!('__momadxp' in data) || data.__momadxp !== 1) return;
        if (!('url' in data) || !('type' in data)) return;
        const reported: unknown = data.url;
        const kind: unknown = data.type;
        if (typeof reported !== 'string' || reported.length > 2048) return;
        if (!/^https?:\/\//i.test(reported)) return;

        if (kind === 'navigate') {
            void load_page(reported); // the user clicked a link inside the page
        } else if (kind === 'navigated' && reported !== address_text) {
            // the page landed somewhere (redirect) — record it without
            // re-fetching
            nav_history = [...nav_history.slice(0, page_index + 1), reported];
            page_index = nav_history.length - 1;
            address_text = reported;
        }
    }

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p !== get_self()),
        );
        void unmount(required(get_self(), 'internet explorer instance'));
    }

    const workspace = required(
        document.querySelector<HTMLElement>('#work-space'),
        'work-space element',
    );
    const ws_size = {
        width: workspace.offsetWidth,
        height: workspace.offsetHeight,
    };

    export let options: WindowOptions = {
        title: 'Microsoft Internet Explorer',
        min_width: 500,
        min_height: 400,
        width: Math.min(ws_size.width - 20, (ws_size.height - 20) * 1.6),
        height: Math.min(ws_size.height - 20),
        icon: '/images/xp/icons/InternetExplorer6.png',
        id: id,
        exec_path,
    };

    // ── Menu (rebuilt reactively when favorites change) ──────

    let menu: MenuBarEntry[];
    $: menu = [
        {
            name: 'File',
            items: [
                [
                    {
                        name: 'Create Shortcut',
                        action: () => {
                            void create_desktop_shortcut();
                        },
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
                    { name: 'Stop', action: stop },
                    { name: 'Refresh', action: refresh },
                ],
                [{ name: 'Source', disabled: true, action: () => {} }],
            ],
        },
        {
            name: 'Favorites',
            items: [
                [
                    { name: 'Add to Favorites...', action: start_add_favorite },
                    {
                        name: 'Organize Favorites',
                        action: () => {
                            queueProgram.set({
                                path: './programs/organize_favorites.svelte',
                            });
                        },
                    },
                ],
                ...$favorites.map((fav) => [
                    {
                        name: fav.name,
                        icon: favorite_icon(fav, $hardDrive),
                        action: () => {
                            // Shell favourites belong to Explorer, not IE. A
                            // folder opens directly; a FILE opens the folder
                            // that contains it, since a browser window has no
                            // sensible way to present an arbitrary local file.
                            if (is_shell_favorite(fav)) {
                                open_shell_favorite(fav.fs_id);
                            } else {
                                void load_page(fav.url);
                            }
                        },
                    },
                ]),
            ],
        },
        {
            name: 'Tools',
            items: [
                [
                    {
                        name: 'Internet Options...',
                        action: () => {
                            queueProgram.set({
                                path: './programs/internet_options.svelte',
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
                            void load_page('/help.html#ie');
                        },
                    },
                ],
                [
                    {
                        name: 'About Internet Explorer',
                        action: () => {
                            void load_page('/help.html#about');
                        },
                    },
                ],
            ],
        },
    ];
</script>

<svelte:window on:keydown={on_keydown} on:message={on_frame_message} />

<Window {options} bind:this={window} on_click_close={destroy}>
    <div
        slot="content"
        class="absolute inset-1 top-0 flex flex-col bg-xp-yellow overflow-hidden"
    >
        <!-- Menu bar -->
        <div
            class="shrink-0 w-full border-b border-stone-300 flex flex-row items-center justify-between"
        >
            <Menu {menu} focused={window?.z_index === $zIndex}></Menu>
            <div
                class="w-[40px] h-full bg-slate-50 flex items-center justify-center overflow-hidden"
            >
                <div
                    class="w-[20px] h-[20px] bg-[url(/images/xp/icons/InternetExplorer6.png)] bg-contain bg-center bg-no-repeat"
                ></div>
            </div>
        </div>

        <!-- Toolbar -->
        <div
            class="shrink-0 flex flex-row items-center border-b border-stone-300 overflow-hidden flex-wrap"
        >
            <div class="relative">
                <RButton
                    icon="/images/xp/icons/Back.png"
                    title="Back"
                    on_click={back}
                    expandable={true}
                    disabled={page_index === 0}
                    on_expand={() => {
                        history_menu = history_menu === 'back' ? null : 'back';
                    }}
                    tooltip_message="Back"
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
                    title="Forward"
                    on_click={forward}
                    expandable={true}
                    disabled={page_index >= nav_history.length - 1}
                    on_expand={() => {
                        history_menu =
                            history_menu === 'forward' ? null : 'forward';
                    }}
                    tooltip_message="Forward"
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
                icon="/images/xp/icons/IEStop.png"
                title="Stop"
                on_click={stop}
                disabled={!loading}
                tooltip_message="Stop"
            ></RButton>
            <RButton
                icon="/images/xp/icons/IERefresh.png"
                title="Refresh"
                on_click={refresh}
                tooltip_message="Refresh (F5)"
            ></RButton>
            <RButton
                icon="/images/xp/icons/IEHome.png"
                title="Home"
                on_click={go_home}
                tooltip_message="Home"
            ></RButton>

            <div class="w-[1px] h-[30px] mx-1 border-l border-stone-300"></div>

            <RButton
                icon="/images/xp/icons/Search.png"
                title="Search"
                on_click={() => {
                    toggle_sidebar('search');
                }}
                tooltip_message="Search the Web"
            ></RButton>
            <RButton
                icon="/images/xp/icons/Favorites.png"
                title="Favorites"
                on_click={() => {
                    toggle_sidebar('favorites');
                }}
                tooltip_message="View Favorites"
            ></RButton>
            <RButton
                icon="/images/xp/icons/IEHistory.png"
                title="History"
                on_click={() => {
                    toggle_sidebar('history');
                }}
                tooltip_message="View History"
            ></RButton>

            <div class="w-[1px] h-[30px] mx-1 border-l border-stone-300"></div>

            <RButton
                icon="/images/xp/icons/Email.png"
                title="Mail"
                tooltip_message="Read Mail"
                on_click={() => {
                    queueProgram.set({ path: './programs/contact_me.svelte' });
                }}
            ></RButton>
        </div>

        <!-- Address bar -->
        <div
            class="shrink-0 flex flex-row items-center border-b border-stone-300 text-[11px]"
        >
            <span class="px-2 text-slate-800 shrink-0">Address</span>
            <div class="grow h-[25px] relative">
                <input
                    class="absolute inset-0 pl-6 outline-none font-MSSS text-[11px]"
                    type="text"
                    bind:this={address_input}
                    bind:value={address_text}
                    on:click={(e) => {
                        e.currentTarget.select();
                    }}
                    on:keydown={on_address_keydown}
                />
                <div
                    class="w-[17px] h-[17px] absolute top-[4px] left-[4px] bg-[url(/images/xp/icons/URL.png)] bg-contain bg-no-repeat"
                ></div>
            </div>
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
                on:click={() => {
                    void load_page();
                }}
                class="w-[30px] h-[20px] bg-[url(/images/xp/icons/Go.png)] bg-center bg-contain bg-no-repeat cursor-pointer shrink-0"
            ></div>
        </div>

        <!-- Main area: sidebar + content -->
        <div class="grow flex flex-row overflow-hidden">
            <!-- Sidebar -->
            {#if sidebar_mode}
                <div
                    class="w-[200px] shrink-0 border-r border-stone-300 flex flex-col bg-[#e8eaf2] overflow-hidden"
                >
                    <!-- Sidebar header -->
                    <div
                        class="h-[28px] shrink-0 bg-gradient-to-b from-[#3169c6] to-[#1f52b3] flex flex-row items-center justify-between px-2"
                    >
                        <span
                            class="text-white text-[11px] font-bold font-MSSS capitalize"
                            >{sidebar_mode}</span
                        >
                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                        <div
                            on:click={() => {
                                sidebar_mode = null;
                                adding_fav = false;
                            }}
                            class="text-white text-[11px] cursor-pointer hover:bg-blue-400 px-1 rounded leading-none select-none"
                        >
                            ✕
                        </div>
                    </div>

                    <!-- Search panel -->
                    {#if sidebar_mode === 'search'}
                        <div class="p-2 flex flex-col gap-2 text-[11px]">
                            <p class="font-MSSS text-slate-700 font-bold">
                                Search the Web
                            </p>
                            <input
                                class="w-full border border-slate-400 px-1 py-[2px] outline-none text-[11px] font-MSSS"
                                type="text"
                                placeholder="Search..."
                                bind:value={search_query}
                                on:keydown={(e) => {
                                    if (e.key === 'Enter') do_search();
                                }}
                            />
                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                            <div
                                on:click={do_search}
                                class="bg-[#ece9d8] border border-stone-400 px-2 py-[2px] text-[11px] font-MSSS cursor-pointer hover:bg-stone-200 w-fit active:bg-stone-300"
                            >
                                Search
                            </div>
                        </div>

                        <!-- Favorites panel -->
                    {:else if sidebar_mode === 'favorites'}
                        <div class="flex flex-col overflow-hidden grow">
                            {#if adding_fav}
                                <div
                                    class="p-2 border-b border-stone-300 flex flex-col gap-1 shrink-0"
                                >
                                    <p
                                        class="font-MSSS text-[11px] text-slate-700 font-bold"
                                    >
                                        Add Favorite
                                    </p>
                                    <p
                                        class="font-MSSS text-[10px] text-slate-600"
                                    >
                                        Name:
                                    </p>
                                    <input
                                        class="w-full border border-slate-400 px-1 py-[2px] outline-none text-[11px] font-MSSS"
                                        type="text"
                                        bind:value={pending_fav_name}
                                        on:keydown={(e) => {
                                            if (e.key === 'Enter')
                                                confirm_add_favorite();
                                        }}
                                    />
                                    <div class="flex gap-1 mt-1">
                                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                                        <div
                                            on:click={confirm_add_favorite}
                                            class="bg-[#ece9d8] border border-stone-400 px-2 py-[1px] text-[11px] font-MSSS cursor-pointer hover:bg-stone-200 active:bg-stone-300"
                                        >
                                            OK
                                        </div>
                                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                                        <div
                                            on:click={() => {
                                                adding_fav = false;
                                            }}
                                            class="bg-[#ece9d8] border border-stone-400 px-2 py-[1px] text-[11px] font-MSSS cursor-pointer hover:bg-stone-200 active:bg-stone-300"
                                        >
                                            Cancel
                                        </div>
                                    </div>
                                </div>
                            {/if}
                            <div class="overflow-y-auto grow">
                                {#if $favorites.length === 0}
                                    <p
                                        class="text-[11px] font-MSSS text-slate-500 p-2"
                                    >
                                        No favorites yet.<br />Click "Add to
                                        Favorites..." to save the current page.
                                    </p>
                                {:else}
                                    <!-- eslint-disable-next-line svelte/require-each-key -- inherited unkeyed each; keying changes DOM reuse semantics -->
                                    {#each $favorites as fav, i}
                                        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                                        <div
                                            class="flex items-center group hover:bg-blue-600 px-1 py-[3px] cursor-pointer"
                                            on:click={() => {
                                                void load_page(fav.url);
                                                sidebar_mode = null;
                                            }}
                                        >
                                            <img
                                                src="/images/xp/icons/URL.png"
                                                class="w-[14px] h-[14px] mr-1 shrink-0"
                                                alt=""
                                            />
                                            <span
                                                class="text-[11px] font-MSSS text-slate-800 group-hover:text-white grow line-clamp-1"
                                                >{fav.name}</span
                                            >
                                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                                            <div
                                                on:click|stopPropagation={() => {
                                                    remove_fav(i);
                                                }}
                                                class="text-[10px] text-slate-400 group-hover:text-white px-1 hover:text-red-300 shrink-0"
                                            >
                                                ✕
                                            </div>
                                        </div>
                                    {/each}
                                {/if}
                            </div>
                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                            <div
                                on:click={start_add_favorite}
                                class="shrink-0 border-t border-stone-300 p-2 text-[11px] font-MSSS text-blue-700 underline cursor-pointer hover:text-blue-900"
                            >
                                + Add current page
                            </div>
                        </div>

                        <!-- History panel -->
                    {:else if sidebar_mode === 'history'}
                        <div class="overflow-y-auto grow">
                            {#if nav_history.length <= 1}
                                <p
                                    class="text-[11px] font-MSSS text-slate-500 p-2"
                                >
                                    No history yet.
                                </p>
                            {:else}
                                <!-- eslint-disable-next-line svelte/require-each-key -- inherited unkeyed each; keying changes DOM reuse semantics -->
                                {#each nav_history as h_url, i}
                                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                                    <div
                                        on:click={() => {
                                            void navigate_to(i);
                                        }}
                                        class="flex items-center px-1 py-[3px] cursor-pointer group
                            {i === page_index
                                            ? 'bg-blue-100'
                                            : 'hover:bg-blue-600'}"
                                    >
                                        <img
                                            src="/images/xp/icons/URL.png"
                                            class="w-[14px] h-[14px] mr-1 shrink-0"
                                            alt=""
                                        />
                                        <span
                                            class="text-[11px] font-MSSS line-clamp-1
                            {i === page_index
                                                ? 'text-blue-700 font-bold'
                                                : 'text-slate-800 group-hover:text-white'}"
                                        >
                                            {hostname_of(h_url)}
                                        </span>
                                    </div>
                                {/each}
                            {/if}
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- Web content area -->
            <div class="grow relative overflow-hidden">
                {#if real_url}
                    <!-- svelte-ignore a11y-missing-attribute -->
                    <!--
                      sandbox WITHOUT allow-same-origin: user-dropped .html
                      files open via a same-origin blob: URL, so without this a
                      malicious page would inherit our origin (full VFS +
                      localStorage + a valid Origin header to /api/email). The
                      opaque-origin sandbox denies all of that; allow-scripts/
                      forms/popups keep normal pages usable. help.html has no
                      scripts and renders fine. (red-team #7)
                    -->
                    <iframe
                        bind:this={iframe}
                        class="w-full h-full bg-slate-50 {window?.z_index ==
                        $zIndex
                            ? 'pointer-events-auto'
                            : 'pointer-events-none'}"
                        src={real_url}
                        on:load={iframe_loaded}
                        frameborder="0"
                        sandbox={iframe_sandbox}
                        referrerpolicy="no-referrer"
                    >
                    </iframe>
                {/if}
            </div>
        </div>

        <!-- Status bar -->
        <div
            class="bg-xp-yellow h-[20px] shrink-0 flex flex-row justify-between items-center px-2 border-t border-stone-200"
        >
            <div class="flex flex-row items-center">
                <img
                    src="/images/xp/icons/URL.png"
                    class="w-[15px] h-[15px]"
                    alt=""
                />
                {#if loading}
                    <ProgressBar
                        style="width:100px;height:13px;margin-left:8px;"
                        value={utils.random_int(50, 80)}
                    ></ProgressBar>
                {:else}
                    <span class="ml-2 text-[11px] font-MSSS">Done</span>
                {/if}
            </div>
            <div class="flex flex-row items-center">
                <img
                    src="/images/xp/icons/InternetShortcut.png"
                    class="w-[15px] h-[15px]"
                    alt=""
                />
                <span class="ml-2 text-[11px] font-MSSS">Internet</span>
            </div>
        </div>
    </div>
</Window>
