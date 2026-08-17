<script lang="ts">
    import { click_outside } from '../../utils';
    import { contextMenu } from '../../store';
    import type { MenuBarEntry } from '../../types';
    export let menu: MenuBarEntry[] = [
        {
            name: 'File',
            items: [
                //group of items
                [{ name: 'Open' }],
                [{ name: 'Save' }, { name: 'Save as' }],
                [{ name: 'Exit' }],
            ],
        },
        {
            name: 'Edit',
            items: [
                [{ name: 'Undo' }, { name: 'Redo' }],
                [
                    { name: 'Cut' },
                    { name: 'Copy' },
                    { name: 'Paste', disabled: true },
                    { name: 'Delete' },
                ],
                [
                    { name: 'Find' },
                    { name: 'Find Next' },
                    { name: 'Replace' },
                    { name: 'Goto' },
                ],
            ],
        },
    ];
    export let style = '';

    let active = false;

    function hide() {
        active = false;
    }

    /**
     * Whether the window owning this menu bar is the focused one. Every program
     * window mounts its own Menu, and each registers a window-level keydown
     * listener — without this gate a single Escape closed the menus of EVERY
     * open window at once (red-team M2).
     */
    export let focused = true;

    /** XP closes an open menu on Escape — the focused window's, one level. */
    function on_keydown(event: KeyboardEvent) {
        if (event.key !== 'Escape' || !active || !focused) return;
        // A context menu is "on top" of the menu bar; it consumes Escape first.
        if ($contextMenu != null) return;
        hide();
    }
</script>

<svelte:window on:keydown={on_keydown} />

<div
    class="toolbar-menu flex flex-row items-center justify-evenly w-min font-MSSS z-10"
    {style}
    use:click_outside
    on:click_outside={() => (active = false)}
>
    <!-- eslint-disable-next-line svelte/require-each-key -- inherited unkeyed each; keying changes DOM reuse semantics -->
    {#each menu as menu_group}
        <div
            class="text-[11px] text-slate-900 hover:bg-blue-600 hover:text-slate-50 relative group"
        >
            <!-- data-menu: the label text alone is ambiguous once a submenu
                 carries the same word (View > Explorer Bar > Favorites) -->
            <div
                class="px-2 py-1"
                data-menu={menu_group.name}
                on:click={() => (active = true)}
            >
                {menu_group.name}
            </div>
            {#if menu_group.items != null}
                <div
                    class="absolute w-[150px] border-slate-500 shadow hidden {active
                        ? 'group-hover:block'
                        : 'inactive-class'} border border-slate-200 bg-slate-50 left-0 top-[25px]"
                >
                    <!-- eslint-disable-next-line svelte/require-each-key -- inherited unkeyed each; keying changes DOM reuse semantics -->
                    {#each menu_group.items as item_group, group_index}
                        <div
                            class="w-full border-slate-200 {group_index ==
                            menu_group.items.length - 1
                                ? ''
                                : 'border-b'}"
                        >
                            <!-- eslint-disable-next-line svelte/require-each-key -- inherited unkeyed each; keying changes DOM reuse semantics -->
                            {#each item_group as item}
                                <div
                                    class="py-1 w-full flex flex-row items-center {item.disabled
                                        ? ''
                                        : 'hover:bg-blue-600'} relative group-sub"
                                    on:click={() => {
                                        // a submenu parent only opens on hover;
                                        // clicking it must not close the menu
                                        if (
                                            !item.disabled &&
                                            item.items == null
                                        ) {
                                            hide();
                                            void item.action?.();
                                        }
                                    }}
                                >
                                    <div class="w-[20px] ml-1 shrink-0">
                                        {#if item.icon}
                                            <img
                                                class={item.disabled
                                                    ? 'grayscale opacity-60'
                                                    : ''}
                                                src={item.icon}
                                                width="17px"
                                                height="17px"
                                            />
                                        {:else if item.check}
                                            <span
                                                class="text-[11px] text-slate-900 group-sub-hover:text-slate-50"
                                                >✓</span
                                            >
                                        {/if}
                                    </div>
                                    <div
                                        class="grow text-slate-900 {item.font ==
                                        'bold'
                                            ? 'font-bold'
                                            : ''}  {item.disabled
                                            ? 'text-slate-400'
                                            : 'group-sub-hover:text-slate-50'}"
                                    >
                                        <p class="line-clamp-1">{item.name}</p>
                                    </div>
                                    <div class="w-[10px]">
                                        {#if item.items != null}
                                            <!-- XP's submenu arrow -->
                                            <svg
                                                class="w-[10px] h-[10px] {item.disabled
                                                    ? 'fill-slate-400'
                                                    : 'fill-slate-900 group-sub-hover:fill-slate-50'}"
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 256 512"
                                                ><path
                                                    d="M246.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-128-128c-9.2-9.2-22.9-11.9-34.9-6.9s-19.8 16.6-19.8 29.6l0 256c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9l128-128z"
                                                /></svg
                                            >
                                        {/if}
                                    </div>
                                    {#if item.items != null && !item.disabled}
                                        <!-- one level of flyout (XP's New ▸) -->
                                        <div
                                            class="absolute left-full top-0 py-0.5 hidden group-sub-hover:flex flex-col w-[190px] bg-slate-50 border border-slate-200 shadow"
                                        >
                                            {#each item.items.filter((el) => el != null) as sub_item, sub_i (sub_i)}
                                                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                                                <div
                                                    class="py-1 w-full flex flex-row items-center group-sub1 {sub_item.disabled
                                                        ? 'pointer-events-none'
                                                        : 'hover:bg-blue-600'}"
                                                    on:click|stopPropagation={() => {
                                                        if (
                                                            !sub_item.disabled
                                                        ) {
                                                            hide();
                                                            void sub_item.action?.();
                                                        }
                                                    }}
                                                >
                                                    <div
                                                        class="w-[20px] ml-1 shrink-0"
                                                    >
                                                        {#if sub_item.icon}
                                                            <img
                                                                class={sub_item.disabled
                                                                    ? 'grayscale opacity-60'
                                                                    : ''}
                                                                src={sub_item.icon}
                                                                width="17px"
                                                                height="17px"
                                                                alt=""
                                                            />
                                                        {:else if sub_item.check}
                                                            <!-- XP ticks toggles inside submenus too (View > Toolbars) -->
                                                            <span
                                                                class="text-[11px] {sub_item.disabled
                                                                    ? 'text-slate-400'
                                                                    : 'text-slate-900 group-sub1-hover:text-slate-50'}"
                                                                >✓</span
                                                            >
                                                        {/if}
                                                    </div>
                                                    <div
                                                        class="grow text-[11px] {sub_item.disabled
                                                            ? 'text-slate-400'
                                                            : 'text-slate-900 group-sub1-hover:text-slate-50'}"
                                                    >
                                                        <p class="line-clamp-1">
                                                            {sub_item.name}
                                                        </p>
                                                    </div>
                                                </div>
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            {/each}
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/each}
</div>
