<script lang="ts">
    /**
     * The History Explorer Bar (View > Explorer Bar > History). XP groups a
     * browser's history by day and site; Explorer's is the trail of folders
     * this window has visited, which is what the Back/Forward dropdowns already
     * walk — so this bar shows that same trail rather than inventing a
     * second, unrelated notion of history.
     */
    import type { HistoryEntry } from '../../../../lib/types';

    export let entries: HistoryEntry[] = [];
    export let current_idx = 0;
    export let on_pick: (idx: number) => void = () => {};
    export let on_close: () => void = () => {};
</script>

<div
    class="w-[200px] shrink-0 flex flex-col bg-white border-r border-stone-300 text-[11px] font-MSSS"
    style:background="linear-gradient(rgb(137 155 253) 0%, rgb(84 104 212) 100%)"
>
    <div class="shrink-0 flex flex-row items-center px-2 py-1 text-white">
        <span class="grow font-bold">History</span>
        <button
            type="button"
            class="w-4 h-4 leading-none text-white/90 hover:text-white"
            aria-label="Close History bar"
            on:click={on_close}>✕</button
        >
    </div>
    <div class="m-2 mt-0 rounded bg-white p-1 grow overflow-auto">
        {#each entries as entry (entry.idx)}
            <div
                data-history-idx={entry.idx}
                class="flex flex-row items-center px-1 py-1 cursor-pointer hover:bg-blue-100 {entry.idx ===
                current_idx
                    ? 'font-bold'
                    : ''}"
                role="button"
                tabindex="0"
                on:keydown={() => {}}
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
    </div>
</div>
