<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import Button from '../../../lib/components/xp/Button.svelte';
    import Tab from '../../../lib/components/xp/Tab.svelte';
    import { unmount } from 'svelte';
    import { runningPrograms } from '../../../lib/store';
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

    const tabs = ['General', 'Computer Name', 'Hardware', 'Advanced'];
    let selected = 'General';

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'system_properties instance'));
    }

    export let options: WindowOptions = {
        title: 'System Properties',
        icon: '/images/xp/icons/MyComputer.png',
        id,
        exec_path,
        width: 400,
        height: 480,
        min_width: 400,
        min_height: 480,
        resizable: false,
        maximize_btn: false,
    };
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div
        slot="content"
        class="absolute inset-0 flex flex-col bg-xp-yellow font-Tahoma p-2"
    >
        <Tab
            items={tabs}
            bind:selected
            disabled={['Computer Name', 'Hardware', 'Advanced']}
        />

        <div
            class="grow border border-[#919b9c] bg-white -mt-px flex flex-col overflow-auto"
        >
            <div class="flex flex-row p-4 gap-4">
                <!-- left column: Windows logo band -->
                <div
                    class="w-[120px] shrink-0 flex flex-col items-center pt-2 text-right"
                >
                    <img
                        src="/assets/images/xp-logo.png"
                        alt=""
                        class="w-24 drop-shadow"
                    />
                </div>
                <!-- right column: registration + system -->
                <div class="grow text-[11px] leading-snug text-slate-800">
                    <p class="font-bold">System:</p>
                    <p class="ml-3">Momad's XP</p>
                    <p class="ml-3">Professional Edition</p>
                    <p class="ml-3">Version 2001, Genuine JavaScript</p>

                    <p class="mt-3 font-bold">Registered to:</p>
                    <p class="ml-3">{profile.meta.name}</p>
                    <p class="ml-3">{profile.meta.title}</p>
                    <p class="ml-3">{profile.meta.location}</p>

                    <p class="mt-3 font-bold">Computer:</p>
                    <p class="ml-3">Neural Processing Unit</p>
                    <p class="ml-3">RoboCup @Home Edition</p>
                    <p class="ml-3">1.337 GHz of raw ambition</p>
                    <p class="ml-3">640 KB RAM (ought to be enough)</p>
                    <p class="ml-3">∞ TB of side projects</p>
                </div>
            </div>

            <div class="mt-auto px-4 pb-3 text-[11px] text-slate-500">
                <p>
                    This system is protected by strong coffee and stronger Git
                    commits.
                </p>
            </div>
        </div>

        <div class="shrink-0 flex flex-row justify-end gap-2 pt-2">
            <Button title="OK" focus={true} on_click={destroy}></Button>
            <Button title="Cancel" on_click={destroy}></Button>
        </div>
    </div>
</Window>
