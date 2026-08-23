<script lang="ts">
    /**
     * XP's etched group box: a labelled frame around a set of related
     * controls, drawn with a 1px inset bevel rather than a flat border.
     *
     * The property sheets each invented their own treatment — System
     * Properties used bare bold headings, Internet Options used flat bordered
     * cards on two tabs and bare headings on the third, and Folder Options
     * used cards throughout. Three dialogs, three idioms, none of them XP's.
     */
    export let title = '';
</script>

<fieldset
    class="border border-[#919b9c] border-b-white border-r-white px-3 pt-1 pb-2"
>
    {#if title !== ''}
        <legend class="px-1 text-[11px] text-slate-800">{title}</legend>
    {/if}
    <div class="flex flex-col gap-1">
        <slot />
    </div>
</fieldset>
