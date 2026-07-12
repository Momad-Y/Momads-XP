<svelte:options accessors={true} />

<script lang="ts">
    import { unmount } from 'svelte';
    import { systemVolume } from '../../../lib/store';
    import RangeSlider from 'svelte-range-slider-pips';
    import * as utils from '../../../lib/utils';
    import { required } from '../../../lib/types';
    import type { MountedComponent } from '../../../lib/types';
    const { click_outside } = utils;

    export let get_self: () => MountedComponent | null = () => null;
    export let position: { bottom: number; left: number };
    let height = 180;
    let width = 80;

    function destroy() {
        void unmount(required(get_self(), 'volume adjust instance'));
    }

    function update_system_volume(e: CustomEvent<{ value: number }>) {
        systemVolume.set(e.detail.value);
    }
</script>

<div
    class="bg-xp-yellow absolute -translate-x-1/2 flex flex-col shadow"
    style:top="{position.bottom - height}px"
    style:left="{position.left}px"
    style:width="{width}px"
    style:height="{height}px"
    use:click_outside
    on:click_outside={destroy}
>
    <div class="grow flex flex-col items-center">
        <div class="text-slate-900 text-[12px] font-MSSS py-4 shrink-0">
            Volume
        </div>
        <div class="grow flex items-center justify-center">
            <RangeSlider
                id="system-volume-slider"
                step={0.01}
                max={1}
                values={[$systemVolume]}
                vertical={true}
                springValues={{ stiffness: 0.5, damping: 1 }}
                on:change={update_system_volume}
            />
        </div>
        <div class="h-6 w-full shrink-0"></div>
    </div>
</div>
