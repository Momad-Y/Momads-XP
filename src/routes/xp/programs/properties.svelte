<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import Button from '../../../lib/components/xp/Button.svelte';
    import Tab from '../../../lib/components/xp/Tab.svelte';
    import CheckBox from '../../../lib/components/xp/CheckBox.svelte';
    import { onMount, unmount } from 'svelte';
    import { runningPrograms, hardDrive } from '../../../lib/store';
    import { icons } from '../../../lib/system';
    import * as utils from '../../../lib/utils';
    import _ from 'lodash';
    import * as finder from '../../../lib/finder';
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

    /** Fail-fast lookup mirroring the untyped base's direct dereferences. */
    function drive_item(item_id: string): VfsItem {
        return required($hardDrive?.[item_id], 'fs item ' + item_id);
    }

    // widened back from the `undefined` initializer: eslint's TS service
    // narrows `export let` props to their default in top-level flow (Svelte
    // injects the real prop value before this code runs)
    const initial_item = fs_item as VfsItem | undefined;

    const details: [string, string | null][] =
        initial_item == null
            ? []
            : [
                  [
                      'Type',
                      initial_item.type
                          .split('_')
                          .map((el) => _.upperFirst(el))
                          .join(' '),
                  ],
                  ['Location', finder.to_url(initial_item.id)],

                  ...(initial_item.type == 'file'
                      ? [
                            [
                                'Size',
                                utils.formatBytes(
                                    (initial_item.size ?? NaN) * 1024,
                                ),
                            ] satisfies [string, string],
                        ]
                      : [
                            [
                                'Size',
                                utils.formatBytes(
                                    size_cal(initial_item.id) * 1024,
                                ),
                            ] satisfies [string, string],
                        ]),

                  ...(initial_item.type == 'file'
                      ? [
                            [
                                'Size on disk',
                                utils.formatBytes(
                                    Math.ceil(
                                        ((initial_item.size ?? NaN) * 1024) /
                                            4096,
                                    ) * 4096,
                                ),
                            ] satisfies [string, string],
                        ]
                      : [
                            [
                                'Size on disk',
                                utils.formatBytes(
                                    Math.ceil(
                                        (size_cal(initial_item.id) * 1024) /
                                            4096,
                                    ) * 4096,
                                ),
                            ] satisfies [string, string],
                        ]),

                  ...(initial_item.type == 'file'
                      ? []
                      : [
                            [
                                'Contains',
                                `${String(initial_item.children.filter((el) => drive_item(el).type == 'file').length)} Files, ${String(initial_item.children.filter((el) => drive_item(el).type == 'folder').length)} Folders`,
                            ] satisfies [string, string],
                        ]),
                  [
                      'Date Created',
                      utils.timestamp_to_readable(initial_item.date_created),
                  ],
                  [
                      'Last Modified',
                      utils.timestamp_to_readable(initial_item.date_modified),
                  ],
              ];

    onMount(() => {
        console.log(fs_item);
    });

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'properties instance'));
    }

    export let options: WindowOptions = {
        title: 'Properties',
        min_width: 350,
        min_height: 460,
        width: 350,
        height: 460,
        icon: null,
        id: id,
        resizable: false,
        maximize_btn: false,
        minimize_btn: false,
        exec_path,
    };

    function size_cal(item_id: string): number {
        console.log(item_id);
        let total_size = _.sum(
            drive_item(item_id)
                .children.map((el) => drive_item(el))
                .filter((el) => el.type == 'file')
                .map((el) => el.size),
        );

        const folders = drive_item(item_id).children.filter(
            (el) => drive_item(el).type == 'folder',
        );
        for (const folder of folders) {
            total_size += size_cal(folder);
        }
        return total_size;
    }

    function file_icon(item: VfsItem) {
        if (item.icon != null) {
            return `url(${item.icon})`;
        }
        if (icons[item.ext] != null) {
            return `url(/images/xp/icons/${icons[item.ext] ?? ''})`;
        }
        return null;
    }
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div
        slot="content"
        class="absolute inset-1 p-2 pb-1 bg-xp-yellow overflow-hidden flex flex-col"
    >
        <Tab
            size="sm"
            items={['General', 'Sharing', 'Customize']}
            selected="General"
            disabled={['Sharing', 'Customize']}
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
                            class="w-[50px] h-[50px] shrink-0 bg-[url(/images/xp/icons/Default.png)] bg-contain bg-no-repeat"
                            style:background-image={file_icon(fs_item)}
                        ></div>
                    {:else}
                        <div
                            class="w-[50px] h-[50px] shrink-0 bg-[url(/images/xp/icons/FolderClosed.png)] bg-contain bg-no-repeat"
                            style:background-image={fs_item?.icon == null
                                ? ''
                                : `url(${fs_item.icon})`}
                        ></div>
                    {/if}
                </div>
                <div class="grow ml-2">
                    <input
                        disabled
                        class="border w-full border-slate-400 outline-none text-[11px] pt-0.5 pl-0.5 pb-2"
                        value={fs_item?.name}
                    />
                </div>
            </div>

            <!-- eslint-disable-next-line svelte/require-each-key -- inherited unkeyed each; keying changes DOM reuse semantics -->
            {#each details as detail}
                <div class="flex flex-row px-2 my-3 text-[12px] text-slate-800">
                    <div class="shrink-0 w-[70px]">
                        {detail[0]}
                    </div>
                    <div
                        class="grow ml-2 {detail[0] == 'Location'
                            ? 'break-all'
                            : 'break-words'}"
                    >
                        {detail[1]}
                    </div>
                </div>
            {/each}

            <div
                class="flex flex-row px-2 my-3 mb-6 text-[12px] text-slate-800"
            >
                <div class="shrink-0 w-[70px]">Attributes</div>
                <div
                    class="grow ml-2 flex flex-row justify-between items-start"
                >
                    <div>
                        <CheckBox
                            checked={false}
                            checkmark={false}
                            label="Read-only"
                        ></CheckBox>
                        <CheckBox
                            checked={false}
                            label="Hidden"
                            style="margin-top:10px;"
                        ></CheckBox>
                    </div>
                    <Button title="Advanced..."></Button>
                </div>
            </div>
        </div>
        <div class="flex flex-row justify-end items-center px-1 pt-2 mt-1">
            <Button title="OK" style="margin-right:10px;" on_click={destroy}
            ></Button>
            <Button title="Cancel" on_click={destroy}></Button>
        </div>
    </div>
</Window>
