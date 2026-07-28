<script lang="ts">
    import { hardDrive } from '../../../../lib/store';
    import { my_computer } from '../../../../lib/system';
    import type { MyComputerInstance, VfsItem } from '../../../../lib/types';

    export let my_computer_instance: MyComputerInstance;
    export let current_id: string | null | undefined = null;

    const expanded: Record<string, boolean> = {};

    function children_folders(id: string): VfsItem[] {
        const item = $hardDrive?.[id];
        if (item == null) return [];
        return item.children
            .map((c) => $hardDrive?.[c])
            .filter(
                (c): c is VfsItem =>
                    c != null &&
                    (c.type === 'folder' ||
                        c.type === 'drive' ||
                        c.type === 'removable_storage'),
            );
    }

    // Top level: the My Computer drive/folder list
    $: roots = my_computer
        .map((id) => $hardDrive?.[id])
        .filter((i): i is VfsItem => i != null);

    function label(item: VfsItem): string {
        return item.display_name ?? item.name;
    }
</script>

<div
    class="w-[200px] shrink-0 overflow-auto bg-white border-r border-stone-300 text-[11px] font-MSSS py-1"
>
    <div
        class="px-2 py-1 font-bold text-slate-700 border-b border-stone-200 flex flex-row items-center gap-1"
    >
        <div
            class="w-4 h-4 bg-[url(/images/xp/icons/MyComputer.png)] bg-contain bg-no-repeat"
        ></div>
        My Computer
    </div>
    {#each roots as root (root.id)}
        {@const kids = children_folders(root.id)}
        <div>
            <div
                class="flex flex-row items-center px-2 py-0.5 cursor-pointer {current_id ===
                root.id
                    ? 'bg-blue-600 text-slate-50'
                    : 'hover:bg-blue-100'}"
                on:click={() => {
                    my_computer_instance.open(root.id);
                }}
                on:keydown={() => {}}
                role="treeitem"
                aria-selected={current_id === root.id}
                tabindex="0"
            >
                {#if kids.length > 0}
                    <button
                        type="button"
                        class="w-3 shrink-0 text-[9px] text-slate-600"
                        on:click|stopPropagation={() => {
                            expanded[root.id] = !expanded[root.id];
                        }}>{expanded[root.id] ? '−' : '+'}</button
                    >
                {:else}
                    <span class="w-3 shrink-0"></span>
                {/if}
                <div
                    class="w-4 h-4 mr-1 bg-contain bg-no-repeat shrink-0"
                    style:background-image="url({root.icon ??
                        '/images/xp/icons/FolderClosed.png'})"
                ></div>
                <span class="truncate">{label(root)}</span>
            </div>
            {#if expanded[root.id]}
                {#each kids as kid (kid.id)}
                    <div
                        class="flex flex-row items-center pl-7 pr-2 py-0.5 cursor-pointer {current_id ===
                        kid.id
                            ? 'bg-blue-600 text-slate-50'
                            : 'hover:bg-blue-100'}"
                        on:click={() => {
                            my_computer_instance.open(kid.id);
                        }}
                        on:keydown={() => {}}
                        role="treeitem"
                        aria-selected={current_id === kid.id}
                        tabindex="0"
                    >
                        <div
                            class="w-4 h-4 mr-1 bg-contain bg-no-repeat shrink-0"
                            style:background-image="url({kid.icon ??
                                '/images/xp/icons/FolderClosed.png'})"
                        ></div>
                        <span class="truncate">{label(kid)}</span>
                    </div>
                {/each}
            {/if}
        </div>
    {/each}
</div>
