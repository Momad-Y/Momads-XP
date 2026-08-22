<script lang="ts">
    /**
     * The caption bar every XP Explorer Bar carries: a title and an ✕ that
     * dismisses it. Shared, because two of the four bars shipped with one and
     * two without, so the same View ▸ Explorer Bar menu produced two different
     * ways to get rid of what it opened.
     */
    export let title = '';
    export let on_close: () => void = () => {};
</script>

<div class="shrink-0 flex flex-row items-center px-2 py-1 text-white">
    <span class="grow font-bold">{title}</span>
    <button
        type="button"
        class="w-4 h-4 leading-none text-white/90 hover:text-white"
        aria-label="Close {title} bar"
        on:click={on_close}>✕</button
    >
</div>
