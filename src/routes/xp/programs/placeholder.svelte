<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import Button from '../../../lib/components/xp/Button.svelte';
    import { unmount } from 'svelte';
    import { runningPrograms } from '../../../lib/store';
    import { placeholder_display } from '../../../lib/placeholder';
    import { required } from '../../../lib/types';
    import type {
        ProgramInstance,
        VfsItem,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    export let id: string;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;
    export let fs_item: Partial<VfsItem> | undefined = undefined;

    const display = placeholder_display(fs_item);

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'placeholder instance'));
    }

    // exec_path is deliberately NOT set: placeholders never persist a window
    // rect, so every instance goes through the cascade (design decision 12)
    // and multiple instances stay allowed (design decision 5).
    export let options: WindowOptions = {
        title: display.name,
        icon: display.icon,
        id: id,
        width: 380,
        height: 180,
        min_width: 380,
        min_height: 180,
        resizable: false,
        maximize_btn: false,
    };
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div slot="content" class="absolute inset-0 bg-xp-yellow flex flex-col p-3">
        <div class="grow flex flex-row items-center">
            <div
                class="w-10 h-10 mr-4 shrink-0 bg-contain bg-no-repeat bg-center"
                style:background-image="url({display.icon})"
            ></div>
            <p class="text-[11px] text-slate-800">
                {display.name} is under construction — coming in a later phase.
            </p>
        </div>
        <div class="flex flex-row justify-center pb-1">
            <Button title="OK" focus={true} on_click={destroy}></Button>
        </div>
    </div>
</Window>
