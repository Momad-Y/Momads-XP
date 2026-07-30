<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import Button from '../../../lib/components/xp/Button.svelte';
    import { onMount, mount, unmount } from 'svelte';
    import { runningPrograms, hardDrive } from '../../../lib/store';
    import * as utils from '../../../lib/utils';
    import * as fs from '../../../lib/fs';
    import Dialog from '../../../lib/components/xp/Dialog.svelte';
    import DumbProgress from '../../../lib/components/xp/DumbProgress.svelte';
    import JSZip from 'jszip';
    import { required } from '../../../lib/types';
    import type {
        MountedComponent,
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

    let cancelled = false;
    export let options: WindowOptions = {
        title: 'Compressing',
        min_width: 250,
        min_height: 220,
        width: 250,
        height: 220,
        resizable: false,
        maximize_btn_disabled: true,
        icon: '/images/xp/icons/RAR.png',
        id: id,
        exec_path,
    };

    onMount(async () => {
        if (fs_item) {
            await compress(fs_item);
        }
    });

    export function destroy() {
        cancelled = true;
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'zip instance'));
    }

    async function compress(item: VfsItem) {
        try {
            const zip = new JSZip();
            await add_to_archive(zip, item);
            const content = await zip.generateAsync({ type: 'blob' });
            const filename = item.basename + '.zip';
            const file = new File([content], filename, {
                type: utils.ext_to_mime(filename) ?? undefined,
            });
            await fs.new_fs_item(
                'file',
                '.zip',
                item.basename,
                item.parent ?? null,
                file,
            );
            destroy();
        } catch (error) {
            console.error('compression failed', error);
            show_error();
        }
    }

    function show_error() {
        const target = required(
            document.querySelector('#desktop'),
            'desktop element',
        );
        const dialog: MountedComponent = mount(Dialog, {
            target,
            props: {
                title: 'Compressing',
                message: 'The archive could not be created.',
                icon: '/images/xp/icons/SecurityError.png',
                get_self: () => dialog,
                buttons: [
                    {
                        name: 'OK',
                        focus: true,
                        action: () => {
                            void unmount(dialog);
                        },
                    },
                ],
            },
        });
        destroy();
    }

    async function add_to_archive(parent: JSZip, item: VfsItem) {
        if (cancelled) return;
        // shortcuts / executables (storage_type 'fake') have no real payload —
        // fs.get_file would throw, so skip them rather than hang the archive.
        if (item.storage_type === 'fake') return;
        if (item.type == 'folder') {
            const folder = required(
                parent.folder(item.name),
                'zip folder ' + item.name,
            );
            for (const child_id of [...item.children]) {
                const child_item = required(
                    $hardDrive?.[child_id],
                    'fs item ' + child_id,
                );
                await add_to_archive(folder, child_item);
            }
        } else if (item.type == 'file') {
            const file = await fs.get_file(item.id);
            parent.file(item.name, file);
        }
    }
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div slot="content" class="absolute inset-0 bg-xp-yellow">
        <div
            class="absolute inset-4 flex flex-col overflow-hidden justify-between"
        >
            <p class="my-2 text-[13px] text-ellipsis line-clamp-3">
                Compressing {fs_item ? fs_item.name : ''}...
            </p>
            <DumbProgress style="height:15px;margin:5px 0;flex-shrink:0;"
            ></DumbProgress>
            <Button title="Cancel" on_click={destroy}></Button>
        </div>
    </div>
</Window>
