<svelte:options accessors={true} />

<script lang="ts">
    import { folder_size } from '../../../lib/fs_size';
    import { pie_shapes, GEOMETRY } from '../../../lib/charts/pie3d';
    import { type_label } from '../../../lib/details_columns';
    import Window from '../../../lib/components/xp/Window.svelte';
    import Button from '../../../lib/components/xp/Button.svelte';
    import Tab from '../../../lib/components/xp/Tab.svelte';
    import CheckBox from '../../../lib/components/xp/CheckBox.svelte';
    import { unmount } from 'svelte';
    import { runningPrograms, hardDrive } from '../../../lib/store';
    import { icons } from '../../../lib/system';
    import * as utils from '../../../lib/utils';
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
    export let parentNode: HTMLElement | undefined = undefined;
    export let fs_item: VfsItem | undefined = undefined;
    export let exec_path: string;

    interface DiskDetails {
        type: string;
        format: string;
        used_space: number;
        capacity: number;
        free_space: number;
    }

    // widened back from the `undefined` initializer: eslint's TS service
    // narrows `export let` props to their default in top-level flow (Svelte
    // injects the real prop value before this code runs)
    const disk = required(
        fs_item as VfsItem | undefined,
        'disk properties fs item',
    );
    const details: DiskDetails = {
        // shared with the Details column and the file Properties sheet, which
        // both said "Removable Disk" where this said "Removable Storage"
        type: type_label(disk),
        format: 'FAT32',
        used_space: folder_size($hardDrive ?? {}, disk.id),
        // The untyped base compared `used_space > details.capacity` before
        // `capacity` had ever been set, so that clamp branch could never fire
        // and the drive's declared capacity always won (bug kept, reported).
        capacity: disk.capacity ?? NaN,
        free_space: 0,
    };
    details.free_space = details.capacity - details.used_space;

    // Colours match the legend swatches below (bg-blue-700 / bg-pink-500) and
    // the shades the removed Google Charts config used.
    const slices = pie_shapes([
        { value: details.used_space, colour: '#1d4ed8' },
        { value: details.free_space, colour: '#ec4899' },
    ]);

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'disk properties instance'));
    }

    export let options: WindowOptions = {
        title: 'Properties',
        min_width: 370,
        min_height: 570,
        width: 370,
        height: 570,
        icon: null,
        id: id,
        resizable: false,
        maximize_btn: false,
        minimize_btn: false,
        exec_path,
    };
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div
        slot="content"
        class="absolute inset-1 p-2 pb-1 bg-xp-yellow overflow-hidden flex flex-col"
    >
        <Tab
            size="sm"
            items={['General', 'Tools', 'Hardware', 'Sharing', 'Quota']}
            selected="General"
            disabled={['Tools', 'Hardware', 'Sharing', 'Quota']}
        ></Tab>
        <div
            class="w-full grow bg-[#fafaf9] shadow-sm -mt-[1px] overflow-y-auto p-2"
        >
            <div
                class="flex flex-row border-b-slate-300 border-b p-2 items-center my-3"
            >
                <div class="shrink-0 w-[70px]">
                    {#if fs_item?.type == 'file'}
                        <div
                            class="w-[50px] h-[50px] shrink-0 bg-[url(/images/xp/icons/Default.png)] bg-contain"
                            style:background-image={icons[fs_item.ext] != null
                                ? `url(/images/xp/icons/${icons[fs_item.ext] ?? ''})`
                                : ''}
                        ></div>
                    {:else}
                        <div
                            class="w-[50px] h-[50px] shrink-0 bg-[url(/images/xp/icons/FolderClosed.png)] bg-contain"
                            style:background-image={fs_item?.icon == null
                                ? ''
                                : `url(${fs_item.icon})`}
                        ></div>
                    {/if}
                </div>
                <div class="grow ml-2">
                    <input
                        disabled
                        class="border w-full border-slate-400 outline-none text-[12px] pt-0.5 pl-0.5 pb-2"
                        value={fs_item?.name}
                    />
                </div>
            </div>

            <div class="flex flex-row px-2 my-3 text-[12px] text-slate-800">
                <div class="shrink-0 w-[70px]">Type</div>
                <div class="grow ml-2">
                    {details.type}
                </div>
            </div>

            <div
                class="flex flex-row px-2 pb-2 my-3 text-[12px] text-slate-800 border-b border-slate-300"
            >
                <div class="shrink-0 w-[70px]">File System</div>
                <div class="grow ml-2">
                    {details.format}
                </div>
            </div>

            <div class="flex flex-row px-2 my-3 text-[12px] text-slate-800">
                <div class="shrink-0 w-[100px]">
                    <div
                        class="w-3 h-3 inline-block bg-blue-700 border border-slate-700 mr-1"
                    ></div>
                    <span class="text-[12px]">Used space</span>
                </div>
                <div class="grow ml-2 flex justify-between">
                    <p>{(details.used_space * 1024).toLocaleString()} bytes</p>
                    <p>{utils.formatBytes(details.used_space * 1024)}</p>
                </div>
            </div>

            <div
                class="flex flex-row px-2 pb-2 my-3 text-[12px] text-slate-800 border-b border-slate-300"
            >
                <div class="shrink-0 w-[100px]">
                    <div
                        class="w-3 h-3 inline-block bg-pink-500 border border-slate-700 mr-1"
                    ></div>
                    <span class="text-[12px]">Free space</span>
                </div>
                <div class="grow ml-2 flex justify-between">
                    <p>{(details.free_space * 1024).toLocaleString()} bytes</p>
                    <p>{utils.formatBytes(details.free_space * 1024)}</p>
                </div>
            </div>

            <div
                class="flex flex-row px-2 pb-2 my-3 text-[12px] text-slate-800"
            >
                <div class="shrink-0 w-[100px]">
                    <div class="w-3 h-3 inline-block mr-1"></div>
                    <span class="text-[12px]">Capacity</span>
                </div>
                <div class="grow ml-2 flex justify-between">
                    <p>{(details.capacity * 1024).toLocaleString()} bytes</p>
                    <p>{utils.formatBytes(details.capacity * 1024)}</p>
                </div>
            </div>

            <div class="chart w-full h-[100px]">
                {#if slices.length > 0}
                    <svg
                        class="w-full h-full"
                        viewBox="0 0 {GEOMETRY.width} {GEOMETRY.height}"
                        role="img"
                        aria-label="Used and free space"
                    >
                        <!-- eslint-disable-next-line svelte/require-each-key -- painter's order is the identity here; keying would reorder draws -->
                        {#each slices as shape}
                            {#if shape.kind === 'ellipse'}
                                <ellipse
                                    cx={GEOMETRY.cx}
                                    cy={GEOMETRY.cy}
                                    rx={GEOMETRY.rx}
                                    ry={GEOMETRY.ry}
                                    fill={shape.fill}
                                />
                            {:else}
                                <path d={shape.d} fill={shape.fill} />
                            {/if}
                        {/each}
                    </svg>
                {/if}
            </div>

            <div class="px-2 my-3 mb-6 text-[12px] text-slate-800">
                <CheckBox
                    checked={false}
                    label="Compress drive to save disk space"
                ></CheckBox>
                <CheckBox
                    checked={true}
                    checkmark={false}
                    label="Allow Indexing Service to index this disk for fast file searching"
                    style="margin-top:10px;"
                ></CheckBox>
            </div>
        </div>
        <div class="flex flex-row justify-end items-center px-1 pt-2 mt-1">
            <Button title="OK" style="margin-right:10px;" on_click={destroy}
            ></Button>
            <Button title="Cancel" on_click={destroy}></Button>
        </div>
    </div>
</Window>
