<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import { onMount, unmount } from 'svelte';
    import { runningPrograms, zIndex, hardDrive } from '../../../lib/store';
    import { get } from 'idb-keyval';
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
    let img_node: HTMLImageElement;
    let panzoom_instance: PanzoomInstance | undefined;

    const supported_exts = ['.bmp', '.jpg', '.jpeg', '.png', '.webp'];

    $: {
        if (fs_item && window) {
            window.update_title(fs_item.name);
        }
    }

    /** Fail-fast lookup mirroring the untyped base's direct dereferences. */
    function drive_item(item_id: string): VfsItem {
        return required($hardDrive?.[item_id], 'fs item ' + item_id);
    }

    onMount(async () => {
        await load_image(required(fs_item, 'image viewer fs item').id);

        panzoom_instance = panzoom(img_node, {
            filterKey: function (e) {
                if (e.key == 'ArrowRight' || e.key == 'ArrowLeft') {
                    return true;
                }
                return undefined;
            },
        });
    });

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'image viewer instance'));
    }

    // widened back from the `undefined` initializer: eslint's TS service
    // narrows `export let` props to their default in top-level flow (Svelte
    // injects the real prop value before this code runs)
    const initial_item = fs_item as VfsItem | undefined;

    export let options: WindowOptions = {
        title: initial_item == null ? 'Image Viewer' : initial_item.name,
        min_width: 300,
        min_height: 300,
        width: 600,
        height: 400,
        icon: '/images/xp/icons/WindowsPictureandFaxViewer.png',
        id: id,
        exec_path,
    };

    async function load_image(item_id: string) {
        const item = drive_item(item_id);

        let url: string | null = null;

        if (item.storage_type == 'remote') {
            url = item.url ?? null;
        } else if (item.storage_type == 'local') {
            const file = await get<Blob>(required(item.url, 'image idb key'));
            url = URL.createObjectURL(required(file, 'image blob'));
        }
        if (url != null) {
            img_node.src = url;
        }
    }

    async function on_key_pressed(e: KeyboardEvent) {
        if (window?.z_index != $zIndex) return;
        if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;

        if (e.key == 'ArrowRight') {
            await load_next_image();
        } else if (e.key == 'ArrowLeft') {
            await load_previous_image();
        }
    }

    async function load_next_image() {
        fs_item = next_image(required(fs_item, 'image viewer fs item'));
        await load_image(fs_item.id);
        img_node.style.transform = 'none';
    }

    async function load_previous_image() {
        fs_item = previous_image(required(fs_item, 'image viewer fs item'));
        await load_image(fs_item.id);
        img_node.style.transform = 'none';
    }

    function zoomIn() {
        panzoom_instance?.smoothZoom(
            img_node.clientWidth * 0.5,
            img_node.clientHeight * 0.5,
            1.2,
        );
    }

    function zoonOut() {
        panzoom_instance?.smoothZoom(
            img_node.clientWidth * 0.5,
            img_node.clientHeight * 0.5,
            0.8,
        );
    }

    function next_image(curr_item: VfsItem): VfsItem {
        const parent_id = required(
            curr_item.parent,
            'parent of ' + curr_item.id,
        );
        console.log($hardDrive?.[parent_id]);
        const siblings = drive_item(parent_id).children.filter((child_id) =>
            supported_exts.includes(drive_item(child_id).ext),
        );
        const curr_index = siblings.indexOf(curr_item.id);

        if (curr_index == siblings.length - 1) {
            return drive_item(required(siblings[0], 'sibling image'));
        } else {
            return drive_item(
                required(siblings[curr_index + 1], 'sibling image'),
            );
        }
    }

    function previous_image(curr_item: VfsItem): VfsItem {
        const parent_id = required(
            curr_item.parent,
            'parent of ' + curr_item.id,
        );
        const siblings = drive_item(parent_id).children.filter((child_id) =>
            supported_exts.includes(drive_item(child_id).ext),
        );
        const curr_index = siblings.indexOf(curr_item.id);

        if (curr_index == 0) {
            return drive_item(
                required(siblings[siblings.length - 1], 'sibling image'),
            );
        } else {
            return drive_item(
                required(siblings[curr_index - 1], 'sibling image'),
            );
        }
    }
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div slot="content" class="absolute inset-1 flex flex-col bg-slate-100">
        <div
            class="grow w-full overflow-hidden flex items-center justify-center p-2 outline-none"
        >
            <img
                bind:this={img_node}
                class="max-w-full max-h-full outline-none"
                alt=""
            />
        </div>
        <div class="h-[40px] shrink-0 flex items-center">
            <div
                class="mx-auto flex flex-row items-center justify-evenly w-[200px]"
            >
                <button class="w-4 h-4 outline-none" on:click={zoomIn}>
                    <svg
                        class="w-full h-full fill-blue-600"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 512 512"
                        ><!--! Font Awesome Pro 6.2.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path
                            d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM184 296c0 13.3 10.7 24 24 24s24-10.7 24-24V232h64c13.3 0 24-10.7 24-24s-10.7-24-24-24H232V120c0-13.3-10.7-24-24-24s-24 10.7-24 24v64H120c-13.3 0-24 10.7-24 24s10.7 24 24 24h64v64z"
                        />
                    </svg>
                </button>

                <button class="w-4 h-4 outline-none" on:click={zoonOut}>
                    <svg
                        class="w-full h-full fill-blue-600"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 512 512"
                        ><!--! Font Awesome Pro 6.2.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path
                            d="M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376c-34.4 25.2-76.8 40-122.7 40C93.1 416 0 322.9 0 208S93.1 0 208 0S416 93.1 416 208zM136 184c-13.3 0-24 10.7-24 24s10.7 24 24 24H280c13.3 0 24-10.7 24-24s-10.7-24-24-24H136z"
                        />
                    </svg>
                </button>

                <button
                    class="w-4 h-4 outline-none"
                    on:click={load_previous_image}
                >
                    <svg
                        class="w-full h-full fill-blue-600"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 512 512"
                        ><!--! Font Awesome Pro 6.2.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path
                            d="M459.5 440.6c9.5 7.9 22.8 9.7 34.1 4.4s18.4-16.6 18.4-29V96c0-12.4-7.2-23.7-18.4-29s-24.5-3.6-34.1 4.4L288 214.3V256v41.7L459.5 440.6zM256 352V256 128 96c0-12.4-7.2-23.7-18.4-29s-24.5-3.6-34.1 4.4l-192 160C4.2 237.5 0 246.5 0 256s4.2 18.5 11.5 24.6l192 160c9.5 7.9 22.8 9.7 34.1 4.4s18.4-16.6 18.4-29V352z"
                        />
                    </svg>
                </button>

                <button class="w-4 h-4 outline-none" on:click={load_next_image}>
                    <svg
                        class="w-full h-full fill-blue-600"
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 512 512"
                        ><!--! Font Awesome Pro 6.2.1 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license (Commercial License) Copyright 2022 Fonticons, Inc. --><path
                            d="M52.5 440.6c-9.5 7.9-22.8 9.7-34.1 4.4S0 428.4 0 416V96C0 83.6 7.2 72.3 18.4 67s24.5-3.6 34.1 4.4L224 214.3V256v41.7L52.5 440.6zM256 352V256 128 96c0-12.4 7.2-23.7 18.4-29s24.5-3.6 34.1 4.4l192 160c7.3 6.1 11.5 15.1 11.5 24.6s-4.2 18.5-11.5 24.6l-192 160c-9.5 7.9-22.8 9.7-34.1 4.4s-18.4-16.6-18.4-29V352z"
                        />
                    </svg>
                </button>
            </div>
        </div>
    </div>
</Window>

<svelte:window on:keydown={on_key_pressed} />
