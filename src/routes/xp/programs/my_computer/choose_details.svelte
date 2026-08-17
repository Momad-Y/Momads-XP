<script lang="ts">
    /**
     * XP's "View > Choose Details..." — picks which columns the Details view
     * shows. Rendered INSIDE the Explorer window (like the delete confirmation)
     * rather than launched as its own program: the column set belongs to this
     * one window, and app-global UI state driving per-window chrome is exactly
     * the shape that produced the earlier cross-window data-loss bugs.
     */
    import TitleBar from '../../../../lib/components/xp/TitleBar.svelte';
    import Button from '../../../../lib/components/xp/Button.svelte';
    import {
        details_columns,
        normalize_columns,
        toggle_column,
    } from '../../../../lib/details_columns';
    import type { DetailsColumnKey } from '../../../../lib/details_columns';

    export let visible: readonly DetailsColumnKey[] = [];
    export let on_apply: (next: DetailsColumnKey[]) => void = () => {};
    export let on_close: () => void = () => {};

    // A draft, so Cancel really discards: the live columns only change on OK.
    let draft: DetailsColumnKey[] = normalize_columns(visible);

    function toggle(key: DetailsColumnKey) {
        if (key === 'name') return; // XP greys Name — a nameless list is unusable
        draft = toggle_column(draft, key);
    }

    function ok() {
        on_apply(draft);
        on_close();
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="dialog absolute inset-0 bg-slate-50/10" style:z-index="100000">
    <div
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col"
        style:width="330px"
        style:height="290px"
    >
        <TitleBar
            options={{
                title: 'Choose Details',
                maximize_btn: false,
                minimize_btn: false,
            }}
            on_click_close={on_close}
        ></TitleBar>
        <div
            class="grow p-3 bg-xp-yellow overflow-hidden flex flex-col border-t-0 border-2 border-blue-600 font-Tahoma text-[11px] text-slate-800"
        >
            <p class="mb-2">Select the details you want to display.</p>
            <div
                class="grow overflow-auto border border-[#919b9c] bg-white p-1 flex flex-col gap-1"
            >
                {#each details_columns as col (col.key)}
                    <div
                        class="flex flex-row items-center px-1 py-0.5 {col.key ===
                        'name'
                            ? 'opacity-60'
                            : 'cursor-pointer hover:bg-blue-100'}"
                        data-column={col.key}
                        on:click={() => {
                            toggle(col.key);
                        }}
                    >
                        <span
                            class="w-3 h-3 mr-2 shrink-0 border border-slate-500 bg-slate-50 flex items-center justify-center text-[9px] leading-none"
                            >{draft.includes(col.key) ? '✓' : ''}</span
                        >
                        <span>{col.label}</span>
                    </div>
                {/each}
            </div>
            <div class="shrink-0 flex flex-row justify-end gap-2 pt-3">
                <Button title="OK" focus={true} on_click={ok}></Button>
                <Button title="Cancel" on_click={on_close}></Button>
            </div>
        </div>
    </div>
</div>
