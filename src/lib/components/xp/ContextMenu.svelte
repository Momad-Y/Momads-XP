<script lang="ts">
    import type { ContextMenuRequest, MenuItem } from '../../types';

    let menu: MenuItem[][] = [];
    let required_width = 0;
    let required_height = 0;

    import { click_outside } from '../../utils';
    import { contextMenu } from '../../store';
    import { onMount, onDestroy } from 'svelte';

    let top = 0;
    let left = 0;
    let visible = false;
    let screenWidth = 700;
    let screenHeight = 700;

    const unsubscriber = contextMenu.subscribe((obj) => {
        void handle_menu_request(obj);
    });

    async function handle_menu_request(obj: ContextMenuRequest | null) {
        if (obj == null) {
            visible = false;
            return;
        }
        const { x, y, type } = obj;

        let menu_obj;
        if (obj.type == 'ProgramTile') {
            menu_obj = (await import('./context_menu/CMProgramTile')).make({
                type,
                originator: obj.originator,
            });
        } else if (obj.type == 'Desktop') {
            menu_obj = (await import('./context_menu/CMDesktop')).make({
                type,
                originator: obj.originator,
            });
        } else if (obj.type == 'FSItem') {
            menu_obj = (await import('./context_menu/CMFSItem')).make({
                type,
                originator: obj.originator,
            });
        } else if (obj.type == 'FSVoid') {
            menu_obj = (await import('./context_menu/CMFSVoid')).make({
                type,
                originator: obj.originator,
            });
        } else {
            menu_obj = (await import('./context_menu/RecycleBin')).make();
        }

        menu = menu_obj.menu;
        required_width = menu_obj.required_width;
        required_height = menu_obj.required_height;

        screenWidth = document.body.offsetWidth;
        screenHeight = document.body.offsetHeight;

        left = Math.min(x, screenWidth - required_width);
        top = Math.min(y, screenHeight - required_height);
        visible = true;
    }

    let menu_el: HTMLDivElement | undefined;

    // On mobile, `click` events are unreliable for dismissal; use touchstart instead.
    function handle_touch_outside(e: TouchEvent) {
        if (
            visible &&
            menu_el &&
            e.target instanceof Node &&
            !menu_el.contains(e.target)
        ) {
            hide();
        }
    }

    onMount(() => {
        document.addEventListener('touchstart', handle_touch_outside, {
            capture: true,
            passive: true,
        });
    });

    onDestroy(() => {
        document.removeEventListener('touchstart', handle_touch_outside, true);
        unsubscriber();
    });

    export let hide: () => void = () => {
        visible = false;
        contextMenu.set(null);
    };
</script>

<div
    bind:this={menu_el}
    use:click_outside
    on:click_outside={() => {
        hide();
    }}
    class="context-menu z-20 pt-0.5 absolute border-2 border-slate-200 bg-slate-50 text-slate-900 w-[180px] text-[11px] {visible
        ? ''
        : 'hidden'}"
    style:top="{top}px"
    style:left="{left}px"
>
    <!-- eslint-disable-next-line svelte/require-each-key -- inherited unkeyed each; keying changes DOM reuse semantics -->
    {#each menu.filter((el) => el.length > 0) as group, group_index}
        <div
            class="w-full border-slate-200 {group_index == menu.length - 1
                ? ''
                : 'border-b'}"
        >
            <!-- eslint-disable-next-line svelte/require-each-key -- inherited unkeyed each; keying changes DOM reuse semantics -->
            {#each group as item}
                <div
                    class="py-1 w-full flex flex-row items-center {item.disabled
                        ? ''
                        : 'hover:bg-blue-600'} relative group
                {item.disabled ? 'pointer-events-none' : ''}"
                    on:click={() => {
                        if (!item.disabled) {
                            if (item.items != null) return;
                            hide();
                            void item.action?.();
                        }
                    }}
                >
                    <div class="w-[20px] ml-1 shrink-0">
                        {#if item.icon}
                            <img
                                src={item.icon}
                                class="w-[17px] h-[17px] {item.icon_type ==
                                'monotone'
                                    ? 'group-hover:invert'
                                    : ''} 
                            {item.disabled && item.icon_type == 'monotone'
                                    ? 'contrast-50 invert'
                                    : ''}"
                                style:width="{item.icon_size}px"
                                style:height="{item.icon_size}px"
                                alt=""
                            />
                        {/if}
                    </div>
                    <div
                        class="grow {item.font == 'bold'
                            ? 'font-bold'
                            : ''}  {item.disabled
                            ? 'text-slate-400'
                            : 'group-hover:text-slate-50'}"
                    >
                        <p>{item.name}</p>
                    </div>
                    <div class="w-[10px]">
                        {#if item.items != null}
                            <svg
                                class="fill-slate-900 group-hover:fill-slate-50 w-[10px] h-[10px]"
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 256 512"
                                ><!--! Font Awesome Pro 6.2.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path
                                    d="M246.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-128-128c-9.2-9.2-22.9-11.9-34.9-6.9s-19.8 16.6-19.8 29.6l0 256c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9l128-128z"
                                /></svg
                            >
                        {/if}
                    </div>
                    {#if item.items != null}
                        <!-- submenu items -->
                        <div
                            class="absolute {left >
                            screenWidth - 2 * required_width
                                ? '-left-full'
                                : 'left-full'} 
                        py-0.5 hidden group-hover:flex flex-col w-[180px] bg-slate-50 border-slate-200 border-2"
                            style:top="{top > screenHeight - 2 * required_height
                                ? `-${String((item.items.length - 2) * 100)}%`
                                : '0'}
                            "
                        >
                            <!-- eslint-disable-next-line svelte/require-each-key -- inherited unkeyed each; keying changes DOM reuse semantics -->
                            {#each item.items as sub_item}
                                {#if sub_item}
                                    <div
                                        class="py-1 w-full flex flex-row items-center {sub_item.disabled
                                            ? ''
                                            : 'hover:bg-blue-600'} relative group-sub
                                {sub_item.disabled
                                            ? 'pointer-events-none'
                                            : ''}"
                                        on:click={() => {
                                            if (!sub_item.disabled) {
                                                hide();
                                                void sub_item.action?.();
                                            }
                                        }}
                                    >
                                        <div
                                            class="w-[20px] ml-1 shrink-0 flex items-center justify-center"
                                        >
                                            {#if sub_item.icon}
                                                <img
                                                    src={sub_item.icon}
                                                    width="17px"
                                                    height="17px"
                                                />
                                            {:else if sub_item.check}
                                                <svg
                                                    class="fill-slate-800 w-1.5 h-1.5 group-sub-hover:fill-slate-50"
                                                    xmlns="http://www.w3.org/2000/svg"
                                                    viewBox="0 0 512 512"
                                                    ><!--! Font Awesome Pro 6.3.0 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2023 Fonticons, Inc. --><path
                                                        d="M256 512c141.4 0 256-114.6 256-256S397.4 0 256 0S0 114.6 0 256S114.6 512 256 512z"
                                                    />
                                                </svg>
                                            {/if}
                                        </div>
                                        <div
                                            class="grow {sub_item.font == 'bold'
                                                ? 'font-bold'
                                                : ''} {sub_item.disabled
                                                ? 'text-slate-400'
                                                : 'group-sub-hover:text-slate-50'}"
                                        >
                                            <p>{sub_item.name}</p>
                                        </div>
                                        <div class="w-[10px]"></div>
                                    </div>
                                {:else}
                                    <div class="h-0.5 bg-slate-200 mx-1"></div>
                                {/if}
                            {/each}
                        </div>
                    {/if}
                </div>
            {/each}
        </div>
    {/each}
</div>
