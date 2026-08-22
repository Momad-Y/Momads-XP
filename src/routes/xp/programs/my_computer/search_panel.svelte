<script lang="ts">
    import * as utils from '../../../../lib/utils';
    import { hardDrive } from '../../../../lib/store';
    import { recycle_bin_id, hidden_items } from '../../../../lib/system';
    import type { MyComputerInstance, VfsItem } from '../../../../lib/types';
    import ExplorerBarHeader from './explorer_bar_header.svelte';

    export let my_computer_instance: MyComputerInstance;
    export let on_close: () => void = () => {};

    let query = '';
    let results: VfsItem[] = [];
    let searched = false;

    function run_search() {
        const q = query.trim().toLowerCase();
        searched = true;
        if (q === '') {
            results = [];
            return;
        }
        const drive = $hardDrive ?? {};
        // Walk the parent chain: a deleted folder's children keep the clone's
        // id as their parent, not recycle_bin_id directly, so a flat
        // `parent !== recycle_bin_id` check would surface recycled files that
        // then dead-end when opened (red-team #12).
        const in_recycle_bin = (item: VfsItem): boolean => {
            let cursor: string | undefined = item.parent;
            // Cap the walk instead of a visited-set: bounds a malformed
            // cyclic parent chain without a mutable Set in component scope
            // (svelte/prefer-svelte-reactivity). 1000 hops >> any real depth.
            for (let hops = 0; cursor != null && hops < 1000; hops++) {
                if (cursor === recycle_bin_id) return true;
                cursor = drive[cursor]?.parent;
            }
            return false;
        };
        results = Object.values(drive)
            .filter(
                (item) =>
                    !hidden_items.includes(item.id) &&
                    item.type !== 'drive' &&
                    item.type !== 'removable_storage' &&
                    !in_recycle_bin(item) &&
                    item.name.toLowerCase().includes(q),
            )
            .slice(0, 100);
    }

    function reveal(item: VfsItem) {
        // open the containing folder so the match is visible
        if (item.parent != null) my_computer_instance.open(item.parent);
    }
</script>

<div
    class="w-[200px] shrink-0 overflow-auto bg-white border-r border-stone-300 text-[11px] font-MSSS"
    style:background="linear-gradient(rgb(137 155 253) 0%, rgb(84 104 212) 100%)"
>
    <ExplorerBarHeader title="Search" {on_close} />
    <div class="m-2 mt-0 rounded bg-white p-2">
        <p class="font-bold text-slate-700 mb-1">Search by name</p>
        <input
            class="w-full h-[22px] px-1 border border-stone-400 outline-none"
            type="text"
            placeholder="All or part of a name"
            bind:value={query}
            on:keydown={(e) => {
                if (e.key === 'Enter') run_search();
            }}
        />
        <button
            type="button"
            class="mt-2 w-full h-[24px] border border-stone-400 bg-[#ece9d8] hover:brightness-105"
            on:click={run_search}>Search</button
        >
    </div>

    <div class="mx-2 mb-2 rounded bg-white/95">
        {#if searched && results.length === 0}
            <p class="p-2 text-slate-600">No items match your search.</p>
        {:else if results.length > 0}
            <p class="px-2 pt-2 text-slate-500">
                {results.length} result{results.length > 1 ? 's' : ''}
            </p>
            {#each results as item (item.id)}
                <div
                    class="flex flex-row items-center px-2 py-1 cursor-pointer hover:bg-blue-100"
                    on:click={() => {
                        reveal(item);
                    }}
                    on:keydown={utils.activate(() => {
                        reveal(item);
                    })}
                    role="button"
                    tabindex="0"
                >
                    <div
                        class="w-4 h-4 mr-1 bg-contain bg-no-repeat shrink-0"
                        style:background-image="url({item.icon ??
                            (item.type === 'folder'
                                ? '/images/xp/icons/FolderClosed.png'
                                : '/images/xp/icons/Default.png')})"
                    ></div>
                    <span class="truncate">{item.name}</span>
                </div>
            {/each}
        {/if}
    </div>
</div>
