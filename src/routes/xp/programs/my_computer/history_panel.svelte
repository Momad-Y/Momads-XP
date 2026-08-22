<script lang="ts">
    import * as utils from '../../../../lib/utils';
    /**
     * The History Explorer Bar (View > Explorer Bar > History). XP groups a
     * browser's history by day and site; Explorer's is the trail of folders
     * this window has visited, which is what the Back/Forward dropdowns already
     * walk — so this bar shows that same trail rather than inventing a
     * second, unrelated notion of history.
     */
    import type { HistoryEntry } from '../../../../lib/types';
    import ExplorerBarHeader from './explorer_bar_header.svelte';

    export let entries: HistoryEntry[] = [];
    export let current_idx = 0;
    export let on_pick: (idx: number) => void = () => {};
    export let on_close: () => void = () => {};
</script>

<div
    class="w-[200px] shrink-0 flex flex-col bg-white border-r border-stone-300 text-[11px] font-MSSS"
    style:background="linear-gradient(rgb(137 155 253) 0%, rgb(84 104 212) 100%)"
>
    <ExplorerBarHeader title="History" {on_close} />
    <div class="m-2 mt-0 rounded bg-white p-1 grow overflow-auto">
        {#if entries.length <= 1}
            <!-- one entry is the page you are already on: a clickable no-op.
                 IE's sidebar guards this the same way. `{:else}`, not a bare
                 `{#if}` — the empty state used to render ABOVE the very row it
                 exists to replace. -->
            <p class="p-2 text-slate-600">No history yet.</p>
        {:else}
            {#each entries as entry (entry.idx)}
                <div
                    data-history-idx={entry.idx}
                    class="flex flex-row items-center px-1 py-1 cursor-pointer hover:bg-blue-100 {entry.idx ===
                    current_idx
                        ? 'bg-blue-100 text-blue-700 font-bold'
                        : ''}"
                    role="button"
                    tabindex="0"
                    on:keydown={utils.activate(() => {
                        on_pick(entry.idx);
                    })}
                    on:click={() => {
                        on_pick(entry.idx);
                    }}
                >
                    <div
                        class="w-4 h-4 mr-1 bg-contain bg-no-repeat bg-center shrink-0"
                        style:background-image="url({entry.icon})"
                    ></div>
                    <span class="truncate">{entry.label}</span>
                </div>
            {/each}
        {/if}
    </div>
</div>
