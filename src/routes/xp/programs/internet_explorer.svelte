<script>
    import Window from '../../../lib/components/xp/Window.svelte';
    import {onMount, unmount} from 'svelte';
    import { runningPrograms, zIndex } from '../../../lib/store'
    import Menu from '../../../lib/components/xp/Menu.svelte';
    import RButton from '../../../lib/components/xp/RButton.svelte';
    import ProgressBar from '../../../lib/components/xp/ProgressBar.svelte';
    import buildUrl from 'build-url';
    import isURL from 'is-valid-http-url';
    import * as fs from '../../../lib/fs';
    import * as utils from '../../../lib/utils';
    import * as finder from '../../../lib/finder';

    export let id;
    export let window;
    export let get_self = () => null;
    export let url;
    export let exec_path;

    let iframe;
    let address_input;
    let homepage = url ? url : 'https://wiby.me/';

    let nav_history = [homepage];
    let page_index = 0;
    let loading = true;
    let real_url;

    // Address bar text — kept in sync with navigation
    let address_text = homepage;

    // Sidebar: null | 'search' | 'favorites' | 'history'
    let sidebar_mode = null;
    let search_query = '';

    // Favorites
    let favorites = [];
    let adding_fav = false;
    let pending_fav_name = '';

    function load_favorites() {
        try { favorites = JSON.parse(localStorage.getItem('ie_favorites') || '[]'); }
        catch { favorites = []; }
    }

    function save_favorites() {
        localStorage.setItem('ie_favorites', JSON.stringify(favorites));
    }

    function start_add_favorite() {
        pending_fav_name = hostname_of(address_text);
        adding_fav = true;
        sidebar_mode = 'favorites';
    }

    function confirm_add_favorite() {
        if (!pending_fav_name.trim()) return;
        favorites = [...favorites, { name: pending_fav_name.trim(), url: address_text }];
        save_favorites();
        adding_fav = false;
    }

    function remove_favorite(i) {
        favorites = favorites.filter((_, idx) => idx !== i);
        save_favorites();
    }

    function hostname_of(u) {
        try { return new URL(u).hostname; } catch { return u; }
    }

    onMount(async () => {
        load_favorites();
        real_url = await to_real_url(nav_history[page_index]);
    });

    // ── Navigation ──────────────────────────────────────────

    async function load_page(nav_url) {
        loading = true;
        let u = nav_url ?? address_input.value;
        if (!u || u.trim() === '') return;

        if (/^[A-Z]:\\/.test(u)) {
            // local file — pass through
        } else if (!u.startsWith('https://') && !u.startsWith('http://')) {
            u = 'https://' + u;
            if (!isURL(u)) {
                u = buildUrl('https://bing.com', {
                    path: 'search',
                    queryParams: { q: (nav_url ?? address_input.value).trim() }
                });
            }
        }

        // Truncate forward history, push new entry
        nav_history = [...nav_history.slice(0, page_index + 1), u];
        page_index = nav_history.length - 1;
        address_text = u;
        await resolve_url(u);
    }

    async function navigate_to(idx) {
        if (idx < 0 || idx >= nav_history.length) return;
        page_index = idx;
        const u = nav_history[idx];
        address_text = u;
        loading = true;
        await resolve_url(u);
    }

    async function resolve_url(u) {
        real_url = null; // reset so Svelte always re-mounts the iframe, even if URL is unchanged
        real_url = await to_real_url(u);
    }

    function back() { navigate_to(page_index - 1); }
    function forward() { navigate_to(page_index + 1); }

    function stop() {
        try { iframe?.contentWindow?.stop(); } catch {}
        loading = false;
    }

    function refresh() {
        loading = true;
        const src = real_url;
        real_url = null;
        setTimeout(() => { real_url = src; }, 50);
    }

    function go_home() { load_page(homepage); }

    function iframe_loaded() {
        loading = false;
        // Update window title (works for same-origin pages only)
        try {
            const t = iframe?.contentDocument?.title;
            if (t) options = { ...options, title: t + ' - Microsoft Internet Explorer' };
            else options = { ...options, title: 'Microsoft Internet Explorer' };
        } catch {
            options = { ...options, title: 'Microsoft Internet Explorer' };
        }
    }

    function on_address_keydown(e) {
        if (e.key === 'Enter') { load_page(); e.preventDefault(); }
        if (e.key === 'Escape') address_input.blur();
    }

    function do_search() {
        if (!search_query.trim()) return;
        load_page('https://bing.com/search?q=' + encodeURIComponent(search_query.trim()));
        sidebar_mode = null;
        search_query = '';
    }

    function toggle_sidebar(mode) {
        sidebar_mode = sidebar_mode === mode ? null : mode;
        if (mode !== 'favorites') adding_fav = false;
    }

    // ── Keyboard shortcuts ───────────────────────────────────

    function on_keydown(e) {
        if (e.key === 'F5') { e.preventDefault(); refresh(); return; }
        if (e.altKey && e.key === 'ArrowLeft') { e.preventDefault(); back(); return; }
        if (e.altKey && e.key === 'ArrowRight') { e.preventDefault(); forward(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
            e.preventDefault();
            address_input?.focus();
            address_input?.select();
        }
    }

    // ── Helpers ──────────────────────────────────────────────

    async function to_real_url(url) {
        if (/^[A-Z]:\\/.test(url)) {
            let file = await fs.get_file(finder.to_id(url));
            return URL.createObjectURL(file);
        }
        return url;
    }

    export function destroy() {
        runningPrograms.update(programs => programs.filter(p => p !== get_self()));
        unmount(get_self());
    }

    let ws_size = { width: document.querySelector('#work-space').offsetWidth, height: document.querySelector('#work-space').offsetHeight };

    export let options = {
        title: 'Microsoft Internet Explorer',
        min_width: 500,
        min_height: 400,
        width: Math.min(ws_size.width - 20, (ws_size.height - 20) * 1.6),
        height: Math.min(ws_size.height - 20),
        icon: '/images/xp/icons/InternetExplorer6.png',
        id: id,
        exec_path
    };

    // ── Menu (rebuilt reactively when favorites change) ──────

    $: menu = [
        {
            name: 'File',
            items: [
                [{ name: 'Create Shortcut', disabled: true, action: () => {} }],
                [{ name: 'Close', action: () => destroy() }]
            ]
        },
        {
            name: 'View',
            items: [
                [
                    { name: 'Stop', action: stop },
                    { name: 'Refresh', action: refresh }
                ],
                [
                    { name: 'Source', disabled: true, action: () => {} }
                ]
            ]
        },
        {
            name: 'Favorites',
            items: [
                [
                    { name: 'Add to Favorites...', action: start_add_favorite },
                    { name: 'Organize Favorites', action: () => toggle_sidebar('favorites') }
                ],
                ...favorites.map(fav => [
                    { name: fav.name, icon: '/images/xp/icons/URL.png', action: () => load_page(fav.url) }
                ])
            ]
        },
        {
            name: 'Tools',
            items: [
                [{ name: 'Internet Options...', disabled: true, action: () => {} }]
            ]
        },
        {
            name: 'Help',
            items: [
                [{ name: 'About Internet Explorer', disabled: true, action: () => {} }]
            ]
        }
    ];
</script>

<svelte:window on:keydown={on_keydown} />

<Window options={options} bind:this={window} on_click_close={destroy}>
    <div slot="content" class="absolute inset-1 top-0 flex flex-col bg-xp-yellow overflow-hidden">

        <!-- Menu bar -->
        <div class="shrink-0 w-full border-b border-stone-300 flex flex-row items-center justify-between">
            <Menu menu={menu}></Menu>
            <div class="w-[40px] h-full bg-slate-50 flex items-center justify-center overflow-hidden">
                <div class="w-[20px] h-[20px] bg-[url(/images/xp/icons/InternetExplorer6.png)] bg-contain bg-center bg-no-repeat">
                </div>
            </div>
        </div>

        <!-- Toolbar -->
        <div class="shrink-0 flex flex-row items-center border-b border-stone-300 overflow-hidden flex-wrap">
            <RButton icon="/images/xp/icons/Back.png" title="Back"
                on_click={back} expandable={true}
                disabled={page_index === 0} tooltip_message="Back"></RButton>
            <RButton icon="/images/xp/icons/Forward.png" title="Forward"
                on_click={forward} expandable={true}
                disabled={page_index >= nav_history.length - 1} tooltip_message="Forward"></RButton>
            <RButton icon="/images/xp/icons/IEStop.png" title="Stop"
                on_click={stop} disabled={!loading} tooltip_message="Stop"></RButton>
            <RButton icon="/images/xp/icons/IERefresh.png" title="Refresh"
                on_click={refresh} tooltip_message="Refresh (F5)"></RButton>
            <RButton icon="/images/xp/icons/IEHome.png" title="Home"
                on_click={go_home} tooltip_message="Home"></RButton>

            <div class="w-[1px] h-[30px] mx-1 border-l border-stone-300"></div>

            <RButton icon="/images/xp/icons/Search.png" title="Search"
                on_click={() => toggle_sidebar('search')}
                tooltip_message="Search the Web"></RButton>
            <RButton icon="/images/xp/icons/Favorites.png" title="Favorites"
                on_click={() => toggle_sidebar('favorites')}
                tooltip_message="View Favorites"></RButton>
            <RButton icon="/images/xp/icons/IEHistory.png" title="History"
                on_click={() => toggle_sidebar('history')}
                tooltip_message="View History"></RButton>

            <div class="w-[1px] h-[30px] mx-1 border-l border-stone-300"></div>

            <RButton icon="/images/xp/icons/Email.png" expandable={true}></RButton>
        </div>

        <!-- Address bar -->
        <div class="shrink-0 flex flex-row items-center border-b border-stone-300 text-[11px]">
            <span class="px-2 text-slate-800 shrink-0">Address</span>
            <div class="grow h-[25px] relative">
                <input
                    class="absolute inset-0 pl-6 outline-none font-MSSS text-[11px]"
                    type="text"
                    bind:this={address_input}
                    bind:value={address_text}
                    on:click={(e) => e.target.select()}
                    on:keydown={on_address_keydown}>
                <div class="w-[17px] h-[17px] absolute top-[4px] left-[4px] bg-[url(/images/xp/icons/URL.png)] bg-contain bg-no-repeat"></div>
            </div>
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div on:click={() => load_page()} class="w-[30px] h-[20px] bg-[url(/images/xp/icons/Go.png)] bg-center bg-contain bg-no-repeat cursor-pointer shrink-0"></div>
        </div>

        <!-- Main area: sidebar + content -->
        <div class="grow flex flex-row overflow-hidden">

            <!-- Sidebar -->
            {#if sidebar_mode}
            <div class="w-[200px] shrink-0 border-r border-stone-300 flex flex-col bg-[#e8eaf2] overflow-hidden">
                <!-- Sidebar header -->
                <div class="h-[28px] shrink-0 bg-gradient-to-b from-[#3169c6] to-[#1f52b3] flex flex-row items-center justify-between px-2">
                    <span class="text-white text-[11px] font-bold font-MSSS capitalize">{sidebar_mode}</span>
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div on:click={() => { sidebar_mode = null; adding_fav = false; }}
                        class="text-white text-[11px] cursor-pointer hover:bg-blue-400 px-1 rounded leading-none select-none">✕</div>
                </div>

                <!-- Search panel -->
                {#if sidebar_mode === 'search'}
                <div class="p-2 flex flex-col gap-2 text-[11px]">
                    <p class="font-MSSS text-slate-700 font-bold">Search the Web</p>
                    <input
                        class="w-full border border-slate-400 px-1 py-[2px] outline-none text-[11px] font-MSSS"
                        type="text" placeholder="Search..."
                        bind:value={search_query}
                        on:keydown={(e) => e.key === 'Enter' && do_search()}>
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div on:click={do_search}
                        class="bg-[#ece9d8] border border-stone-400 px-2 py-[2px] text-[11px] font-MSSS cursor-pointer hover:bg-stone-200 w-fit active:bg-stone-300">
                        Search
                    </div>
                </div>

                <!-- Favorites panel -->
                {:else if sidebar_mode === 'favorites'}
                <div class="flex flex-col overflow-hidden grow">
                    {#if adding_fav}
                    <div class="p-2 border-b border-stone-300 flex flex-col gap-1 shrink-0">
                        <p class="font-MSSS text-[11px] text-slate-700 font-bold">Add Favorite</p>
                        <p class="font-MSSS text-[10px] text-slate-600">Name:</p>
                        <input
                            class="w-full border border-slate-400 px-1 py-[2px] outline-none text-[11px] font-MSSS"
                            type="text" bind:value={pending_fav_name}
                            on:keydown={(e) => e.key === 'Enter' && confirm_add_favorite()}>
                        <div class="flex gap-1 mt-1">
                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                            <div on:click={confirm_add_favorite}
                                class="bg-[#ece9d8] border border-stone-400 px-2 py-[1px] text-[11px] font-MSSS cursor-pointer hover:bg-stone-200 active:bg-stone-300">
                                OK
                            </div>
                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                            <div on:click={() => { adding_fav = false; }}
                                class="bg-[#ece9d8] border border-stone-400 px-2 py-[1px] text-[11px] font-MSSS cursor-pointer hover:bg-stone-200 active:bg-stone-300">
                                Cancel
                            </div>
                        </div>
                    </div>
                    {/if}
                    <div class="overflow-y-auto grow">
                        {#if favorites.length === 0}
                        <p class="text-[11px] font-MSSS text-slate-500 p-2">No favorites yet.<br>Click "Add to Favorites..." to save the current page.</p>
                        {:else}
                        {#each favorites as fav, i}
                        <div class="flex items-center group hover:bg-blue-600 px-1 py-[3px] cursor-pointer"
                            on:click={() => { load_page(fav.url); sidebar_mode = null; }}>
                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                            <img src="/images/xp/icons/URL.png" class="w-[14px] h-[14px] mr-1 shrink-0" alt="">
                            <span class="text-[11px] font-MSSS text-slate-800 group-hover:text-white grow line-clamp-1">{fav.name}</span>
                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                            <!-- svelte-ignore a11y-no-static-element-interactions -->
                            <div on:click|stopPropagation={() => remove_favorite(i)}
                                class="text-[10px] text-slate-400 group-hover:text-white px-1 hover:text-red-300 shrink-0">✕</div>
                        </div>
                        {/each}
                        {/if}
                    </div>
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div on:click={start_add_favorite}
                        class="shrink-0 border-t border-stone-300 p-2 text-[11px] font-MSSS text-blue-700 underline cursor-pointer hover:text-blue-900">
                        + Add current page
                    </div>
                </div>

                <!-- History panel -->
                {:else if sidebar_mode === 'history'}
                <div class="overflow-y-auto grow">
                    {#if nav_history.length <= 1}
                    <p class="text-[11px] font-MSSS text-slate-500 p-2">No history yet.</p>
                    {:else}
                    {#each nav_history as h_url, i}
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <div on:click={() => navigate_to(i)}
                        class="flex items-center px-1 py-[3px] cursor-pointer group
                            {i === page_index ? 'bg-blue-100' : 'hover:bg-blue-600'}">
                        <img src="/images/xp/icons/URL.png" class="w-[14px] h-[14px] mr-1 shrink-0" alt="">
                        <span class="text-[11px] font-MSSS line-clamp-1
                            {i === page_index ? 'text-blue-700 font-bold' : 'text-slate-800 group-hover:text-white'}">
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
                <iframe
                    bind:this={iframe}
                    class="w-full h-full bg-slate-50 {window?.z_index == $zIndex ? 'pointer-events-auto' : 'pointer-events-none'}"
                    src="{real_url}"
                    on:load={iframe_loaded}
                    frameborder="0">
                </iframe>
                {/if}
            </div>
        </div>

        <!-- Status bar -->
        <div class="bg-xp-yellow h-[20px] shrink-0 flex flex-row justify-between items-center px-2 border-t border-stone-200">
            <div class="flex flex-row items-center">
                <img src="/images/xp/icons/URL.png" class="w-[15px] h-[15px]" alt="">
                {#if loading}
                    <ProgressBar style="width:100px;height:13px;margin-left:8px;" value={utils.random_int(50,80)}></ProgressBar>
                {:else}
                    <span class="ml-2 text-[11px] font-MSSS">Done</span>
                {/if}
            </div>
            <div class="flex flex-row items-center">
                <img src="/images/xp/icons/InternetShortcut.png" class="w-[15px] h-[15px]" alt="">
                <span class="ml-2 text-[11px] font-MSSS">Internet</span>
            </div>
        </div>
    </div>
</Window>

<svelte:options accessors={true}></svelte:options>
