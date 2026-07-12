<svelte:options accessors={true} />

<script lang="ts">
    import { unmount } from 'svelte';
    import { required } from '../../types';
    import type { MountedComponent } from '../../types';
    export let get_self: () => MountedComponent | null = () => null;
    import { my_pictures_id, my_music_id, desktop_folder } from '../../system';

    import TitleBar from './TitleBar.svelte';
    import Viewer2 from './Viewer2.svelte';

    export let selected_items: string[] = [];

    /** Viewer2 instance (typed structurally so eslint's TS service, which
     * resolves .svelte imports as `any`, still type-checks the calls). */
    export let viewer:
        { open: (id: string | null | undefined) => void } | undefined =
        undefined;
    export let filetypes: string[] = [];
    export let filetypes_desc = 'All Files';
    export let multiple = true;

    interface SidePlace {
        id: string | null;
        name: string;
        icon: string;
    }

    const left_side_places: SidePlace[] = [
        {
            id: desktop_folder,
            name: 'Desktop',
            icon: '/images/xp/icons/Desktop.png',
        },
        {
            id: my_pictures_id,
            name: 'My Pictures',
            icon: '/images/xp/icons/MyPictures.png',
        },
        {
            id: my_music_id,
            name: 'My Music',
            icon: '/images/xp/icons/MyMusic.png',
        },
        {
            id: null,
            name: 'My Computer',
            icon: '/images/xp/icons/MyComputer.png',
        },
    ];
    export function destroy() {
        void unmount(required(get_self(), 'open modal instance'));
    }

    export let on_open: (items: string[]) => void = () => {};
</script>

<div
    class="absolute inset-0 bg-slate-50/40 rounded-t-lg"
    style:z-index="100000"
    on:click|self={(e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        target.querySelector('div')?.classList.add('animate-blink');
        setTimeout(() => {
            target.querySelector('div')?.classList.remove('animate-blink');
        }, 400);
    }}
>
    <div
        class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col"
        style="width: min(600px, 95vw); height: min(500px, 85dvh);"
    >
        <TitleBar
            options={{
                title: 'Open',
                maximize_btn: false,
                minimize_btn: false,
            }}
            on_click_close={destroy}
        ></TitleBar>
        <div
            class="grow p-2 pb-1 bg-xp-yellow overflow-hidden flex flex-row shadow-lg border-t-0 border-2 border-blue-600"
        >
            <div class="shrink-0 pt-1 pr-1 w-[100px]">
                <div class="h-7 mr-2 flex flex-row justify-end items-center">
                    <span class="text-[11px] text-black">Look in:</span>
                </div>
                <div
                    class="bg-xp-yellow-light shadow rounded w-full overflow-y-auto"
                >
                    <!-- eslint-disable-next-line svelte/require-each-key -- inherited unkeyed each; keying changes DOM reuse semantics -->
                    {#each left_side_places as place}
                        <div
                            class="w-full flex flex-col items-center py-2 px-1 hover:bg-slate-100 rounded"
                            on:click={() => {
                                viewer?.open(place.id);
                            }}
                        >
                            <div
                                class="w-10 h-10 bg-contain bg-no-repeat bg-center"
                                style:background-image="url({place.icon})"
                            ></div>
                            <span
                                class="mt-1 text-[10px] text-black text-center leading-tight"
                                >{place.name}</span
                            >
                        </div>
                    {/each}
                </div>
            </div>

            <div class="grow flex flex-col relative">
                <Viewer2
                    bind:this={viewer}
                    {filetypes_desc}
                    filetypes={filetypes.map((el) => el.toLowerCase())}
                    {multiple}
                    on_open={(items: string[]) => {
                        selected_items = items;
                        on_open(items);
                    }}
                    on_cancel={destroy}
                ></Viewer2>
            </div>
        </div>
    </div>
</div>
