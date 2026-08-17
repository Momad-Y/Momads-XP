<script lang="ts">
    /**
     * The Favorites Explorer Bar (View > Explorer Bar > Favorites). Shows the
     * one shared Favorites list — the same store IE's sidebar and both
     * Favorites menus read — and hands opening back to the owning window so a
     * folder favourite navigates and a web one launches IE.
     */
    import { hardDrive } from '../../../../lib/store';
    import { favorites, favorite_icon } from '../../../../lib/favorites';
    import type { Favorite } from '../../../../lib/favorites';

    export let on_open: (fav: Favorite) => void = () => {};
    export let on_add: () => void = () => {};
    export let on_organize: () => void = () => {};
    export let on_close: () => void = () => {};
</script>

<div
    class="w-[200px] shrink-0 flex flex-col bg-white border-r border-stone-300 text-[11px] font-MSSS"
    style:background="linear-gradient(rgb(137 155 253) 0%, rgb(84 104 212) 100%)"
>
    <div class="shrink-0 flex flex-row items-center px-2 py-1 text-white">
        <span class="grow font-bold">Favorites</span>
        <button
            type="button"
            class="w-4 h-4 leading-none text-white/90 hover:text-white"
            aria-label="Close Favorites bar"
            on:click={on_close}>✕</button
        >
    </div>
    <div class="m-2 mt-0 rounded bg-white p-2 flex flex-col grow overflow-auto">
        <div
            class="shrink-0 flex flex-row gap-2 pb-2 border-b border-stone-200"
        >
            <button
                type="button"
                class="px-2 h-[22px] border border-stone-400 bg-[#ece9d8] hover:brightness-105"
                on:click={on_add}>Add...</button
            >
            <button
                type="button"
                class="px-2 h-[22px] border border-stone-400 bg-[#ece9d8] hover:brightness-105"
                on:click={on_organize}>Organize...</button
            >
        </div>
        <div class="grow overflow-auto pt-1">
            {#if $favorites.length === 0}
                <p class="p-2 text-slate-600">No favorites yet.</p>
            {/if}
            {#each $favorites as fav, i (i)}
                <div
                    class="flex flex-row items-center px-1 py-1 cursor-pointer hover:bg-blue-100"
                    role="button"
                    tabindex="0"
                    on:keydown={() => {}}
                    on:click={() => {
                        on_open(fav);
                    }}
                >
                    <div
                        class="w-4 h-4 mr-1 bg-contain bg-no-repeat bg-center shrink-0"
                        style:background-image="url({favorite_icon(
                            fav,
                            $hardDrive,
                        )})"
                    ></div>
                    <span class="truncate">{fav.name}</span>
                </div>
            {/each}
        </div>
    </div>
</div>
