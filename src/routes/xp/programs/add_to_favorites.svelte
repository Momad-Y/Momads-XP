<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import Button from '../../../lib/components/xp/Button.svelte';
    import { unmount } from 'svelte';
    import { runningPrograms, zIndex, contextMenu } from '../../../lib/store';
    import { add_favorite } from '../../../lib/favorites';
    import * as finder from '../../../lib/finder';
    import { required } from '../../../lib/types';
    import type {
        ProgramInstance,
        VfsItem,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    export let id: string;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;
    export let exec_path: string | undefined = undefined;
    /** The folder being favourited (Explorer passes the current folder). */
    export let fs_item: Partial<VfsItem> | undefined = undefined;

    const target = fs_item as Partial<VfsItem> | undefined;
    const target_id = target?.id ?? '';
    let fav_name = target?.name ?? 'Folder';
    const path_label = finder.to_url(target_id) || (target?.name ?? '');

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'add_to_favorites instance'));
    }

    function confirm() {
        if (fav_name.trim() === '' || target_id === '') return;
        add_favorite({
            name: fav_name.trim(),
            url: path_label,
            fs_id: target_id,
        });
        destroy();
    }

    /** XP: Escape cancels a dialog. */
    function on_keydown(event: KeyboardEvent) {
        if (event.key !== 'Escape') return;
        if ($contextMenu != null) return;
        if (window?.z_index !== $zIndex) return;
        destroy();
    }

    export let options: WindowOptions = {
        title: 'Add Favorite',
        icon: '/images/xp/icons/URL.png',
        id,
        exec_path,
        width: 380,
        height: 190,
        min_width: 380,
        min_height: 190,
        resizable: false,
        maximize_btn: false,
        minimize_btn: false,
    };
</script>

<svelte:window on:keydown={on_keydown} />

<Window {options} bind:this={window} on_click_close={destroy}>
    <div
        slot="content"
        class="absolute inset-0 flex flex-col bg-xp-yellow font-Tahoma p-4 text-[11px] text-slate-800"
    >
        <p class="mb-3">Windows will add this folder to your Favorites list.</p>
        <div class="flex flex-row items-center gap-2">
            <span class="shrink-0">Name:</span>
            <!-- svelte-ignore a11y_autofocus -->
            <input
                class="grow h-[22px] px-1 border border-stone-400 outline-none bg-white"
                type="text"
                autofocus
                bind:value={fav_name}
                on:keydown={(e) => {
                    if (e.key === 'Enter') confirm();
                }}
            />
        </div>
        <p class="mt-2 text-slate-500 truncate">{path_label}</p>

        <div class="mt-auto flex flex-row justify-end gap-2 pt-2">
            <Button title="OK" on_click={confirm}></Button>
            <Button title="Cancel" on_click={destroy}></Button>
        </div>
    </div>
</Window>
