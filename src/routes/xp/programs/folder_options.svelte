<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import Button from '../../../lib/components/xp/Button.svelte';
    import Tab from '../../../lib/components/xp/Tab.svelte';
    import { unmount } from 'svelte';
    import { runningPrograms, zIndex, contextMenu } from '../../../lib/store';
    import { profile } from '../../../lib/profile';
    import { required } from '../../../lib/types';
    import type {
        ProgramInstance,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    export let id: string;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;
    export let exec_path: string | undefined = undefined;

    const fo = profile.folderOptions;
    const tabs = ['General', 'View', 'File Types'];
    let selected = 'General';

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'folder_options instance'));
    }

    export let options: WindowOptions = {
        title: 'Folder Options',
        icon: '/images/xp/icons/FolderClosed.png',
        id,
        exec_path,
        width: 400,
        height: 460,
        min_width: 400,
        min_height: 460,
        resizable: false,
        maximize_btn: false,
        minimize_btn: false,
    };

    /** XP: Escape is Cancel on a property sheet (focused window only). */
    function on_keydown(event: KeyboardEvent) {
        if (event.key !== 'Escape') return;
        if ($contextMenu != null) return;
        if (window?.z_index !== $zIndex) return;
        destroy();
    }
</script>

<svelte:window on:keydown={on_keydown} />

<Window {options} bind:this={window} on_click_close={destroy}>
    <div
        slot="content"
        class="absolute inset-0 flex flex-col bg-xp-yellow font-Tahoma p-2"
    >
        <Tab items={tabs} bind:selected />

        <div
            class="grow border border-[#919b9c] bg-white -mt-px flex flex-col overflow-auto text-[11px] text-slate-800"
        >
            {#if selected === 'General'}
                <div class="flex flex-col p-4 gap-3 leading-snug">
                    {#each fo.general.sections as section, i (i)}
                        <div class="flex flex-col gap-1">
                            <p class="font-bold">{section.title}</p>
                            {#each section.lines as line, j (j)}
                                <p class="ml-3">{line}</p>
                            {/each}
                        </div>
                    {/each}
                    <p class="text-slate-500 italic">{fo.general.note}</p>
                    <div class="mt-auto flex flex-row justify-end pt-2">
                        <Button title="Restore Defaults" disabled={true}
                        ></Button>
                    </div>
                </div>
            {:else if selected === 'View'}
                <div class="flex flex-col p-4 gap-3 leading-snug">
                    <p class="font-bold">{fo.view.title}</p>
                    <div
                        class="border border-[#919b9c] bg-white p-2 flex flex-col gap-1"
                    >
                        {#each fo.view.settings as setting, i (i)}
                            <div class="flex flex-row items-start gap-2">
                                <span
                                    class="w-3 h-3 mt-0.5 shrink-0 border border-slate-500 bg-slate-50 flex items-center justify-center text-[9px] leading-none"
                                    aria-hidden="true">✓</span
                                >
                                <span>{setting}</span>
                            </div>
                        {/each}
                    </div>
                    <p class="text-slate-500 italic">{fo.view.note}</p>
                </div>
            {:else if selected === 'File Types'}
                <div class="flex flex-col p-4 gap-3 leading-snug">
                    <p class="font-bold">{fo.fileTypes.title}</p>
                    <div
                        class="border border-[#919b9c] bg-white p-2 flex flex-col gap-1"
                    >
                        {#each fo.fileTypes.types as type, i (i)}
                            <div class="flex flex-row items-start gap-2">
                                <span class="w-10 shrink-0 font-bold"
                                    >{type.ext}</span
                                >
                                <span>{type.desc}</span>
                            </div>
                        {/each}
                    </div>
                    <p class="text-slate-500 italic">{fo.fileTypes.note}</p>
                    <div class="mt-auto flex flex-row justify-end gap-2 pt-2">
                        <Button title="Change..." disabled={true}></Button>
                        <Button title="Advanced" disabled={true}></Button>
                    </div>
                </div>
            {/if}
        </div>

        <div class="shrink-0 flex flex-row justify-end gap-2 pt-2">
            <Button title="OK" focus={true} on_click={destroy}></Button>
            <Button title="Cancel" on_click={destroy}></Button>
            <Button title="Apply" disabled={true}></Button>
        </div>
    </div>
</Window>
