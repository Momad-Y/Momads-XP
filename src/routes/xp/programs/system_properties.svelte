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

    const sp = profile.systemProperties;
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
        <Tab items={tabs} bind:selected />

        <div
            class="grow border border-[#919b9c] bg-white -mt-px flex flex-col overflow-auto text-[11px] text-slate-800"
        >
            {#if selected === 'General'}
                <div class="flex flex-row p-4 gap-4">
                    <!-- left column: dark-text logo (legible on the white panel) -->
                    <div class="w-[150px] shrink-0 flex flex-col items-center">
                        <img
                            src="/assets/images/xp-logo-dark.png"
                            alt="Momad's Portfolio XP"
                            class="w-[150px]"
                        />
                    </div>
                    <!-- right column: registration + system -->
                    <div class="grow leading-snug">
                        <p class="font-bold">System:</p>
                        {#each sp.general.system as line, i (i)}
                            <p class="ml-3">{line}</p>
                        {/each}

                        <p class="mt-3 font-bold">Registered to:</p>
                        <p class="ml-3">{profile.meta.name}</p>
                        <p class="ml-3">{profile.meta.title}</p>
                        <p class="ml-3">{profile.meta.location}</p>

                        <p class="mt-3 font-bold">Computer:</p>
                        {#each sp.general.computer as line, i (i)}
                            <p class="ml-3">{line}</p>
                        {/each}
                    </div>
                </div>

                <div class="mt-auto px-4 pb-3 text-slate-500">
                    <p>{sp.general.footer}</p>
                </div>
            {:else if selected === 'Computer Name'}
                <div class="flex flex-col p-4 gap-3 leading-snug">
                    <p>{sp.computerName.intro}</p>
                    <div class="flex flex-col gap-2 pl-1">
                        <div>
                            <p class="font-bold">
                                {sp.computerName.descriptionLabel}
                            </p>
                            <p class="ml-3">{sp.computerName.description}</p>
                        </div>
                        <div>
                            <p class="font-bold">
                                {sp.computerName.fullNameLabel}
                            </p>
                            <p class="ml-3">{sp.computerName.fullName}</p>
                        </div>
                        <div>
                            <p class="font-bold">
                                {sp.computerName.workgroupLabel}
                            </p>
                            <p class="ml-3">{sp.computerName.workgroup}</p>
                        </div>
                    </div>
                    <p class="text-slate-500 italic">{sp.computerName.note}</p>
                    <div class="mt-auto flex flex-row justify-end gap-2 pt-2">
                        <Button title="Network ID..." disabled={true}></Button>
                        <Button title="Change..." disabled={true}></Button>
                    </div>
                </div>
            {:else if selected === 'Hardware'}
                <div class="flex flex-col p-4 gap-3 leading-snug">
                    <p>{sp.hardware.intro}</p>
                    <div
                        class="border border-[#919b9c] bg-white p-2 flex flex-col gap-1"
                    >
                        {#each sp.hardware.devices as device, i (i)}
                            <div class="flex flex-row items-center gap-2">
                                <img
                                    src="/images/xp/icons/MyComputer.png"
                                    alt=""
                                    class="w-4 h-4 shrink-0"
                                />
                                <span>{device}</span>
                            </div>
                        {/each}
                        {#each sp.hardware.problemDevices as device, i (i)}
                            <div class="flex flex-row items-center gap-2">
                                <span
                                    class="w-4 h-4 shrink-0 flex items-center justify-center bg-[#ffcc00] text-black font-bold text-[10px] leading-none rounded-[1px]"
                                    aria-hidden="true">!</span
                                >
                                <span>{device}</span>
                            </div>
                        {/each}
                    </div>
                    <p class="text-slate-500 italic">{sp.hardware.note}</p>
                    <div class="mt-auto flex flex-row justify-end gap-2 pt-2">
                        <Button title="Device Manager" disabled={true}></Button>
                    </div>
                </div>
            {:else if selected === 'Advanced'}
                <div class="flex flex-col p-4 gap-3 leading-snug">
                    <p>{sp.advanced.intro}</p>
                    {#each sp.advanced.sections as section (section.title)}
                        <div
                            class="border border-[#919b9c] bg-white p-3 flex flex-col gap-2"
                        >
                            <p class="font-bold">{section.title}</p>
                            <p class="text-slate-600">{section.note}</p>
                            <div class="flex flex-row justify-end">
                                <Button title="Settings" disabled={true}
                                ></Button>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <div class="shrink-0 flex flex-row justify-end gap-2 pt-2">
            <Button title="OK" focus={true} on_click={destroy}></Button>
            <Button title="Cancel" on_click={destroy}></Button>
        </div>
    </div>
</Window>
