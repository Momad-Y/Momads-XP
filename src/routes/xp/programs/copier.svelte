<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import Button from '../../../lib/components/xp/Button.svelte';
    import { onMount, unmount } from 'svelte';
    import { runningPrograms, hardDrive } from '../../../lib/store';
    import * as utils from '../../../lib/utils';
    import * as fs from '../../../lib/fs';
    import DumbProgress from '../../../lib/components/xp/DumbProgress.svelte';
    import { required } from '../../../lib/types';
    import type {
        CopyTree,
        ProgramInstance,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    export let id: string;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;
    export let parentNode: HTMLElement | undefined = undefined;
    export let copying_obj: CopyTree | undefined = undefined;
    export let target_folder_id: string | undefined = undefined;
    export let exec_path: string;

    let cancelled = false;
    let current_item = '';
    let target_folder_name = required(
        target_folder_id == null ? undefined : $hardDrive?.[target_folder_id],
        'fs item ' + String(target_folder_id),
    ).name;

    export let options: WindowOptions = {
        title: 'Copying',
        min_width: 370,
        min_height: 180,
        width: 370,
        height: 180,
        resizable: false,
        minimize_btn: false,
        maximize_btn: false,
        id: id,
        exec_path,
    };

    onMount(async () => {
        if (copying_obj && target_folder_id) {
            console.log(copying_obj);
            for (let key of Object.keys(copying_obj)) {
                console.log(key);
                await save_to_disk(
                    required(copying_obj[key], 'copy entry ' + key),
                    target_folder_id,
                    key,
                );
            }
            await destroy();
        }
    });

    export async function destroy() {
        cancelled = true;
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'copier instance'));
    }

    async function save_to_disk(
        obj: File | CopyTree,
        parent_id: string | undefined,
        key: string,
    ) {
        if (cancelled) return;

        if (obj instanceof File) {
            current_item = obj.name;
            let file = new File([obj], obj.name, {
                type: utils.ext_to_mime(obj.name) || obj.type,
            });
            await fs.new_fs_item(
                'file',
                utils.extname(key),
                utils.basename(key, utils.extname(key)),
                parent_id ?? null,
                file,
            );
        } else {
            let folder_id = await fs.new_fs_item(
                'folder',
                '',
                key,
                parent_id ?? null,
                null,
            );
            for (let k of Object.keys(obj)) {
                await save_to_disk(
                    required(obj[k], 'copy entry ' + k),
                    folder_id,
                    k,
                );
            }
        }
    }
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div slot="content" class="absolute inset-1 bg-xp-yellow">
        <div class="absolute inset-2 flex flex-row overflow-hidden">
            <div class="grow w-[270px] flex flex-col shrink-0 pr-1">
                <img
                    src="/images/xp/copying.gif"
                    width="272"
                    height="60"
                    alt=""
                    class="shrink-0"
                />
                <p
                    class="m-1 text-[12px] text-ellipsis line-clamp-1 h-4 shrink-0"
                >
                    Copying {current_item}...
                </p>
                <p
                    class="m-1 text-[12px] text-ellipsis line-clamp-1 h-4 shrink-0"
                >
                    From host to {target_folder_name}
                </p>
                <DumbProgress style="height:15px;margin:5px 0;flex-shrink:0;"
                ></DumbProgress>
            </div>
            <div class="flex flex-col justify-end w-[75px] shrink-0">
                <Button title="Cancel" on_click={destroy}></Button>
            </div>
        </div>
    </div>
</Window>
