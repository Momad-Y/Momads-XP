<svelte:options accessors={true} />

<script lang="ts">
    import { unmount, mount } from 'svelte';
    import Window from '../../../lib/components/xp/Window.svelte';
    import {
        runningPrograms,
        zIndex,
        hardDrive,
        queueProgram,
    } from '../../../lib/store';
    import * as utils from '../../../lib/utils';
    import * as fs from '../../../lib/fs';
    import DumbProgress from '../../../lib/components/xp/DumbProgress.svelte';
    import short from 'short-uuid';
    import { required } from '../../../lib/types';
    import type {
        MountedComponent,
        ProgramInstance,
        SaveAsFiletype,
        SaveAsSelection,
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

    let supported_types: SaveAsFiletype[] = [
        {
            name: 'Portable Network Graphics',
            mime: 'image/png',
            value: 'image/png',
            ext: '.png',
        },
        {
            name: 'JPEG images',
            mime: 'image/jpeg',
            value: 'image/jpeg',
            ext: '.jpg',
        },
        {
            name: 'JPEG images',
            mime: 'image/jpeg',
            value: 'image/jpeg',
            ext: '.jpeg',
        },
        {
            name: 'Windows OS/2 Bitmap Graphics',
            mime: 'image/bmp',
            value: 'image/bmp',
            ext: '.bmp',
        },
    ];
    supported_types = supported_types.map((el) => {
        el.name = el.name + ' (' + el.ext + ')';
        return el;
    });

    let iframe: HTMLIFrameElement;
    let iframe_loaded = false;

    $: {
        if (fs_item && window) {
            window.update_title(fs_item.name);
        }
    }

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'paint instance'));
    }

    // widened back from the `undefined` initializer: eslint's TS service
    // narrows `export let` props to their default in top-level flow (Svelte
    // injects the real prop value before this code runs)
    const initial_item = fs_item as VfsItem | undefined;

    export let options: WindowOptions = {
        title: initial_item == null ? 'Paint' : initial_item.name,
        min_width: 500,
        min_height: 400,
        width: 700,
        height: 500,
        icon: '/images/xp/icons/Paint.png',
        id: id,
        exec_path,
    };

    /** The paint window's root element (valid once the window has mounted). */
    function window_el(): HTMLElement {
        return required(window?.node_ref, 'paint window element');
    }

    /** The jspaint iframe's document (valid once the iframe has loaded). */
    function paint_document(): Document {
        return required(iframe.contentDocument, 'paint document');
    }

    async function open_in_new_window() {
        const selected_items = await pick_file_dialog({
            node_ref: window_el(),
            filetypes_desc: 'Image Files',
            filetypes: supported_types.map((el) => el.ext),
        });
        const item =
            selected_items[0] == null
                ? undefined
                : $hardDrive?.[selected_items[0]];
        queueProgram.set({
            path: './programs/paint.svelte',
            fs_item: item,
        });
    }

    async function pick_file() {
        const selected_items = await pick_file_dialog({
            node_ref: window_el(),
            filetypes_desc: 'Image Files',
            filetypes: supported_types.map((el) => el.ext),
        });
        const selected_id = required(selected_items[0], 'picked file');
        fs_item = $hardDrive?.[selected_id];
        const file = await fs.get_file(selected_id);
        console.log({ fs_item });
        return file;
    }

    async function pick_file_dialog({
        node_ref,
        filetypes_desc,
        filetypes,
    }: {
        node_ref: HTMLElement;
        filetypes_desc: string;
        filetypes: string[];
    }): Promise<string[]> {
        const OpenModal = (
            await import('../../../lib/components/xp/OpenModal.svelte')
        ).default;
        return new Promise<string[]>((resolve) => {
            const modal: MountedComponent = mount(OpenModal, {
                target: node_ref,
                props: {
                    filetypes,
                    filetypes_desc,
                    get_self: () => modal,
                    on_open: (items: string[]) => {
                        resolve(items);
                        void unmount(modal);
                    },
                },
            });
        });
    }

    async function save_file_as() {
        console.log(fs_item);
        let current_filetype = supported_types.find(
            (el) => el.ext == fs_item?.ext,
        );
        if (current_filetype == null) {
            current_filetype = required(
                supported_types[0],
                'default paint filetype',
            );
        }

        const { parent_id, filename, selected_filetype } =
            await save_file_as_dialog({
                id: fs_item?.parent,
                node_ref: window_el(),
                filetypes: supported_types,
                current_filetype,
            });
        console.log(selected_filetype);

        const canvas = required(
            paint_document().querySelector<HTMLCanvasElement>('.main-canvas'),
            'paint canvas',
        );
        canvas.toBlob((blob) => {
            void (async () => {
                const file = new File(
                    [required(blob, 'canvas blob')],
                    filename,
                );
                const new_id = short.generate();
                await fs.save_file_as(
                    filename,
                    selected_filetype.ext,
                    file,
                    parent_id,
                    new_id,
                );
                if (fs_item == null) {
                    fs_item = $hardDrive?.[new_id];
                }
            })();
        }, selected_filetype.mime);
    }

    async function save_file_as_dialog({
        node_ref,
        filetypes,
        id,
        current_filetype,
    }: {
        node_ref: HTMLElement;
        filetypes: SaveAsFiletype[];
        id: string | undefined;
        current_filetype: SaveAsFiletype;
    }): Promise<SaveAsSelection> {
        const SaveModal = (
            await import('../../../lib/components/xp/SaveModal.svelte')
        ).default;
        return new Promise<SaveAsSelection>((resolve) => {
            const modal: MountedComponent = mount(SaveModal, {
                target: node_ref,
                props: {
                    filetypes,
                    selected_filetype: current_filetype,
                    id,
                    get_self: () => modal,
                    on_save: (data: SaveAsSelection) => {
                        resolve(data);
                        void unmount(modal);
                    },
                },
            });
        });
    }

    async function setup_paint() {
        iframe_loaded = true;
        const jspaint = required(iframe.contentWindow, 'paint iframe window');
        jspaint.set_theme?.('classic.css');
        jspaint.open_in_new_window = open_in_new_window;
        jspaint.open_empty_window = () => {
            queueProgram.set({
                path: './programs/paint.svelte',
            });
        };

        if (fs_item != null) {
            console.log({ fs_item });
            const file = await fs.get_file(fs_item.id);
            console.log(file);
            jspaint.open_from_file?.(file);
        }
        // Wait for systemHooks object to exist (the iframe needs to load)
        waitUntil(
            () => jspaint.systemHooks,
            500,
            () => {
                // Hook in
                const hooks = required(
                    jspaint.systemHooks,
                    'jspaint systemHooks',
                );
                hooks.showSaveFileDialog = async () => {
                    await save_file_as();
                };

                hooks.showOpenFileDialog = async () => {
                    const file = await pick_file();
                    return { file, file_handle: file };
                };

                hooks.writeBlobToHandle = () => {
                    console.log('writeBlobtoHandle');
                    if (fs_item != null) {
                        const ext = fs_item.ext || '.png';
                        const mimetype = utils.ext_to_mime(ext, 'image/png');
                        console.log({ mimetype });

                        const canvas = required(
                            paint_document().querySelector<HTMLCanvasElement>(
                                '.main-canvas',
                            ),
                            'paint canvas',
                        );
                        canvas.toBlob((blob) => {
                            const item = required(fs_item, 'paint fs item');
                            const file = new File(
                                [required(blob, 'canvas blob')],
                                item.name,
                            );
                            void fs.save_file(item.id, file);
                            window?.show_toast({ message: 'Changes Saved!' });
                        }, mimetype ?? undefined);
                    } else {
                        void save_file_as();
                    }
                };

                required(
                    paint_document().querySelector<HTMLElement>('.menus'),
                    'paint menus',
                ).style.pointerEvents = 'auto';
            },
        );
        // General function to wait for a condition to be met, checking at regular intervals
        function waitUntil(
            test: () => unknown,
            interval: number,
            callback: () => void,
        ) {
            if (test()) {
                callback();
            } else {
                setTimeout(waitUntil, interval, test, interval, callback);
            }
        }
    }
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div
        slot="content"
        class="absolute inset-1 top-0 flex flex-col bg-[rgb(192,192,192)] overflow-hidden"
    >
        {#if !iframe_loaded}
            <div
                class="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 text-slate-500 text-sm p-2 rounded font-mono"
            >
                <DumbProgress style="width:150px;height:15px;"></DumbProgress>
            </div>
        {/if}

        <iframe
            src="/html/jspaint/index.html"
            bind:this={iframe}
            width="100%"
            height="100%"
            on:load={setup_paint}
            class="inset-0 absolute bg-white {iframe_loaded
                ? ''
                : 'opacity-0'}  {window?.z_index == $zIndex
                ? 'pointer-events-auto'
                : 'pointer-events-none'}"
        >
        </iframe>
    </div>
</Window>
