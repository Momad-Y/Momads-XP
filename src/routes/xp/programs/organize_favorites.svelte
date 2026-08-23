<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import Button from '../../../lib/components/xp/Button.svelte';
    import { unmount } from 'svelte';
    import {
        runningPrograms,
        zIndex,
        contextMenu,
        hardDrive,
    } from '../../../lib/store';
    import {
        favorites,
        remove_favorite,
        rename_favorite,
        move_favorite,
        favorite_icon,
    } from '../../../lib/favorites';
    import { required } from '../../../lib/types';
    import type {
        ProgramInstance,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    export let id: string;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;
    export let exec_path: string | undefined = undefined;

    let selected = 0;
    let renaming = false;
    let draft = '';

    $: if (selected >= $favorites.length)
        selected = Math.max(0, $favorites.length - 1);
    $: current = $favorites[selected];

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'organize_favorites instance'));
    }

    function start_rename() {
        if (current == null) return;
        draft = current.name;
        renaming = true;
    }

    function commit_rename() {
        if (!renaming) return;
        rename_favorite(selected, draft);
        renaming = false;
    }

    function on_keydown(event: KeyboardEvent) {
        if (event.key !== 'Escape') return;
        if ($contextMenu != null) return;
        if (window?.z_index !== $zIndex) return;
        if (renaming) {
            renaming = false; // abandon the edit first, like XP
            return;
        }
        destroy();
    }

    export let options: WindowOptions = {
        title: 'Organize Favorites',
        icon: '/images/xp/icons/URL.png',
        id,
        exec_path,
        width: 420,
        height: 380,
        min_width: 420,
        min_height: 380,
        resizable: false,
        maximize_btn: false,
        minimize_btn: false,
    };
</script>

<svelte:window on:keydown={on_keydown} />

<Window {options} bind:this={window} on_click_close={destroy}>
    <div
        slot="content"
        class="absolute inset-0 flex flex-col bg-xp-yellow font-Tahoma p-3 text-[11px] text-slate-800"
    >
        <p class="mb-2">
            To rename or delete an item, select it and then click the button.
        </p>

        <div class="flex flex-row gap-2 grow min-h-0">
            <div
                class="grow border border-[#919b9c] bg-white overflow-auto"
                id="fav-list"
            >
                {#if $favorites.length === 0}
                    <p class="p-2 text-slate-500">
                        There are no favorites yet.
                    </p>
                {/if}
                {#each $favorites as fav, i (i)}
                    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                    <div
                        class="flex flex-row items-center gap-2 px-2 py-1 cursor-pointer {i ===
                        selected
                            ? 'bg-blue-600 text-slate-50'
                            : 'hover:bg-blue-100'}"
                        on:click={() => {
                            selected = i;
                            renaming = false;
                        }}
                    >
                        <img
                            src={favorite_icon(fav, $hardDrive)}
                            alt=""
                            class="w-4 h-4 shrink-0"
                        />
                        {#if renaming && i === selected}
                            <!-- svelte-ignore a11y_autofocus -->
                            <!--
                              stopPropagation: the row's own click handler
                              clears `renaming`, so without this, clicking into
                              the box to type immediately closed the editor.
                            -->
                            <input
                                class="grow h-[18px] px-1 text-slate-900 border border-stone-400 outline-none"
                                type="text"
                                autofocus
                                bind:value={draft}
                                on:click|stopPropagation
                                on:mousedown|stopPropagation
                                on:dblclick|stopPropagation
                                on:blur={commit_rename}
                                on:keydown={(e) => {
                                    if (e.key === 'Enter') commit_rename();
                                }}
                            />
                        {:else}
                            <span class="truncate">{fav.name}</span>
                        {/if}
                    </div>
                {/each}
            </div>

            <div class="w-[110px] shrink-0 flex flex-col gap-2">
                <Button
                    title="Rename"
                    disabled={current == null}
                    on_click={start_rename}
                ></Button>
                <Button
                    title="Delete"
                    disabled={current == null}
                    on_click={() => {
                        remove_favorite(selected);
                        renaming = false;
                    }}
                ></Button>
                <Button
                    title="Move Up"
                    disabled={current == null || selected === 0}
                    on_click={() => {
                        move_favorite(selected, -1);
                        selected = Math.max(0, selected - 1);
                    }}
                ></Button>
                <Button
                    title="Move Down"
                    disabled={current == null ||
                        selected === $favorites.length - 1}
                    on_click={() => {
                        move_favorite(selected, 1);
                        selected = Math.min(
                            $favorites.length - 1,
                            selected + 1,
                        );
                    }}
                ></Button>
            </div>
        </div>

        <div class="mt-2 flex flex-row justify-end shrink-0">
            <Button title="Close" focus={true} on_click={destroy}></Button>
        </div>
    </div>
</Window>
