<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import Button from '../../../lib/components/xp/Button.svelte';
    import GroupBox from '../../../lib/components/xp/GroupBox.svelte';
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

    const io = profile.internetOptions;
    const tabs = ['General', 'Security', 'Advanced'];
    let selected = 'General';

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'internet_options instance'));
    }

    export let options: WindowOptions = {
        title: 'Internet Options',
        icon: '/images/xp/icons/InternetExplorer6.png',
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
                    {#each io.general.sections as section, i (i)}
                        <GroupBox title={section.title}>
                            {#each section.lines as line, j (j)}
                                <p>{line}</p>
                            {/each}
                        </GroupBox>
                    {/each}
                    <p class="text-slate-500 italic">{io.general.note}</p>
                    <div class="mt-auto flex flex-row justify-end gap-2 pt-2">
                        <Button title="Delete Files..." disabled={true}
                        ></Button>
                        <Button title="Settings..." disabled={true}></Button>
                    </div>
                </div>
            {:else if selected === 'Security'}
                <div class="flex flex-col p-4 gap-3 leading-snug">
                    <GroupBox title={io.security.title}>
                        {#each io.security.zones as zone, i (i)}
                            <div class="flex flex-row items-start gap-2">
                                <img
                                    src="/images/xp/icons/InternetExplorer6.png"
                                    alt=""
                                    class="w-4 h-4 shrink-0"
                                />
                                <span>{zone}</span>
                            </div>
                        {/each}
                    </GroupBox>
                    <p class="text-slate-500 italic">{io.security.note}</p>
                    <div class="mt-auto flex flex-row justify-end pt-2">
                        <Button title="Custom Level..." disabled={true}
                        ></Button>
                    </div>
                </div>
            {:else if selected === 'Advanced'}
                <div class="flex flex-col p-4 gap-3 leading-snug">
                    <GroupBox title={io.advanced.title}>
                        {#each io.advanced.settings as setting, i (i)}
                            <div class="flex flex-row items-start gap-2">
                                <span
                                    class="w-3 h-3 mt-0.5 shrink-0 border border-slate-500 bg-slate-50 flex items-center justify-center text-[9px] leading-none"
                                    aria-hidden="true">✓</span
                                >
                                <span>{setting}</span>
                            </div>
                        {/each}
                    </GroupBox>
                    <p class="text-slate-500 italic">{io.advanced.note}</p>
                    <div class="mt-auto flex flex-row justify-end pt-2">
                        <Button title="Restore Defaults" disabled={true}
                        ></Button>
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
