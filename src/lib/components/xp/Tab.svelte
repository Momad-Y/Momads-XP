<script lang="ts">
    export let items: string[] = [];
    export let selected: string;
    export let size = 'sm';
    export let style = 'margin-left:2px;';
    /** Tabs that render greyed out and ignore clicks (XP disabled-tab look). */
    export let disabled: string[] = [];
</script>

<div class="w-min shrink-0 flex flex-row items-center justify-evenly" {style}>
    <!-- eslint-disable-next-line svelte/require-each-key -- inherited unkeyed each; keying changes DOM reuse semantics -->
    {#each items as item}
        <div
            on:click={() => {
                if (!disabled.includes(item)) selected = item;
            }}
            class="grow tab-item {selected == item
                ? 'selected'
                : ''} {disabled.includes(item)
                ? 'disabled text-[#a1a192]'
                : 'text-slate-800'}
            {size == 'sm' ? 'text-[11px]' : ''} {size == 'md'
                ? 'text-base'
                : ''} {size == 'lg' ? 'text-lg' : ''}"
        >
            <span>{item}</span>
        </div>
    {/each}
</div>

<style>
    .tab-item {
        white-space: nowrap;
        background: linear-gradient(
            180deg,
            #fff,
            #fafaf9 26%,
            #f0f0ea 95%,
            #ecebe5
        );
        margin-left: -1px;
        margin-right: 2px;
        border-radius: 0;
        border-color: #91a7b4;
        border-top-right-radius: 3px;
        border-top-left-radius: 3px;
        padding: 0 12px 3px;
        text-align: center;
    }

    .tab-item:hover:not(.disabled) {
        border-top: 1px solid #e68b2c;
        box-shadow: inset 0 2px #ffc73c;
    }

    .tab-item.disabled {
        cursor: default;
    }

    .tab-item.selected {
        background: #fcfcfe;
        border-color: #919b9c;
        margin-right: 0px;
        border-bottom: 1px solid transparent;
        border-top: 1px solid #e68b2c;
        box-shadow: inset 0 2px #ffc73c;
    }
</style>
