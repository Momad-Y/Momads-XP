<script lang="ts">
    import { onMount, onDestroy, mount } from 'svelte';
    import Wallpaper from './wallpaper.svelte';
    import { queueProgram, runningPrograms } from '../../lib/store';
    import short from 'short-uuid';
    import DesktopFolder from './desktop_folder.svelte';
    import * as finder from '../../lib/finder';
    import { full_vfs_item } from '../../lib/types';
    import type {
        ProgramInstance,
        ProgramLaunchRequest,
        VfsItem,
    } from '../../lib/types';

    let node_ref: HTMLDivElement;
    let workSpaceHeight: number;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- the inherited base never unsubscribes (work_space lives for the whole session); wiring these into onDestroy would be a behavior change
    const unsubscribers = [
        queueProgram.subscribe((program) => {
            if (program == null) {
                return;
            }
            void launch(program);
        }),
    ];

    onMount(() => {});

    onDestroy(() => {});

    async function launch(program: ProgramLaunchRequest) {
        const { fs_item, exe_item, copying_obj, target_folder_id, path } =
            program;

        if (path == './programs/my_computer.svelte') {
            const Program = (await import('./programs/my_computer.svelte'))
                .default;
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: short.generate(),
                    fs_item,
                    exec_path: path,
                    get_self: () => program,
                },
            });
            //add to program tray
            runningPrograms.update((values) => {
                return [...values, program];
            });
        } else if (path == './programs/display_properties.svelte') {
            const Program = (
                await import('./programs/display_properties.svelte')
            ).default;
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: short.generate(),
                    exec_path: path,
                    get_self: () => program,
                },
            });
            //add to program tray
            // runningPrograms.update(values => {
            //     return [...values, program];
            // })
        } else if (path == './programs/internet_explorer.svelte') {
            const url = get_url(fs_item);
            const Program = (
                await import('./programs/internet_explorer.svelte')
            ).default;
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: short.generate(),
                    url,
                    exec_path: path,
                    get_self: () => program,
                },
            });
            //add to program tray
            runningPrograms.update((values) => {
                return [...values, program];
            });
        } else if (path == './programs/paint.svelte') {
            const Program = (await import('./programs/paint.svelte')).default;
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: short.generate(),
                    parentNode: node_ref,
                    fs_item: full_vfs_item(fs_item),
                    exec_path: path,
                    get_self: () => program,
                },
            });

            //add to program tray
            runningPrograms.update((values) => {
                return [...values, program];
            });
        } else if (path == './programs/media_player_classic.svelte') {
            const Program = (
                await import('./programs/media_player_classic.svelte')
            ).default;
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: short.generate(),
                    parentNode: node_ref,
                    fs_item: full_vfs_item(fs_item),
                    exec_path: path,
                    get_self: () => program,
                },
            });
            if (fs_item)
                program.options = { ...program.options, title: fs_item.name };

            //add to program tray
            runningPrograms.update((values) => {
                return [...values, program];
            });
        } else if (path == './programs/properties.svelte') {
            const Program = (await import('./programs/properties.svelte'))
                .default;
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: short.generate(),
                    parentNode: node_ref,
                    fs_item: full_vfs_item(fs_item),
                    exec_path: path,
                    get_self: () => program,
                },
            });
            if (fs_item)
                program.options = {
                    ...program.options,
                    title: String(fs_item.name) + ' Properties',
                };
        } else if (path == './programs/disk_properties.svelte') {
            const Program = (await import('./programs/disk_properties.svelte'))
                .default;
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: short.generate(),
                    parentNode: node_ref,
                    fs_item: full_vfs_item(fs_item),
                    exec_path: path,
                    get_self: () => program,
                },
            });
            if (fs_item)
                program.options = {
                    ...program.options,
                    title: String(fs_item.display_name) + ' Properties',
                };
        } else if (path == './programs/zip.svelte') {
            const Program = (await import('./programs/zip.svelte')).default;
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: short.generate(),
                    parentNode: node_ref,
                    fs_item: full_vfs_item(fs_item),
                    exec_path: path,
                    get_self: () => program,
                },
            });

            //add to program tray
            runningPrograms.update((values) => {
                return [...values, program];
            });
        } else if (path == './programs/image_viewer.svelte') {
            const Program = (await import('./programs/image_viewer.svelte'))
                .default;
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: short.generate(),
                    parentNode: node_ref,
                    fs_item: full_vfs_item(fs_item),
                    exec_path: path,
                    get_self: () => program,
                },
            });

            //add to program tray
            runningPrograms.update((values) => {
                return [...values, program];
            });
        } else if (path == './programs/system_properties.svelte') {
            const Program = (
                await import('./programs/system_properties.svelte')
            ).default;
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: short.generate(),
                    exec_path: path,
                    get_self: () => program,
                },
            });
            //add to program tray
            runningPrograms.update((values) => {
                return [...values, program];
            });
        } else if (path == './programs/contact_me.svelte') {
            const Program = (await import('./programs/contact_me.svelte'))
                .default;
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: short.generate(),
                    exec_path: path,
                    get_self: () => program,
                },
            });
            //add to program tray
            runningPrograms.update((values) => {
                return [...values, program];
            });
        } else if (path == './programs/about_me.svelte') {
            const Program = (await import('./programs/about_me.svelte'))
                .default;
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: short.generate(),
                    exec_path: path,
                    get_self: () => program,
                },
            });
            //add to program tray
            runningPrograms.update((values) => {
                return [...values, program];
            });
        } else if (path == './programs/pdf_viewer.svelte') {
            const Program = (await import('./programs/pdf_viewer.svelte'))
                .default;
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: short.generate(),
                    fs_item: full_vfs_item(fs_item),
                    exec_path: path,
                    get_self: () => program,
                },
            });
            //add to program tray
            runningPrograms.update((values) => {
                return [...values, program];
            });
        } else if (path == './programs/portfolio_viewer.svelte') {
            // portfolio_ref entries render resolved profile content; plain
            // .txt files (user-created/uploaded) render their raw text
            const Program = (await import('./programs/portfolio_viewer.svelte'))
                .default;
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: short.generate(),
                    fs_item: full_vfs_item(fs_item),
                    exec_path: path,
                    get_self: () => program,
                },
            });
            //add to program tray
            runningPrograms.update((values) => {
                return [...values, program];
            });
        } else if (path == './programs/placeholder.svelte') {
            const Program = (await import('./programs/placeholder.svelte'))
                .default;
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: short.generate(),
                    fs_item: exe_item ?? fs_item,
                    get_self: () => program,
                },
            });
            //add to program tray
            runningPrograms.update((values) => {
                return [...values, program];
            });
        } else if (path == './programs/copier.svelte') {
            const Program = (await import('./programs/copier.svelte')).default;
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: short.generate(),
                    parentNode: node_ref,
                    copying_obj,
                    target_folder_id,
                    exec_path: path,
                    get_self: () => program,
                },
            });
        }
        queueProgram.set(null);
    }

    function get_url(item: Partial<VfsItem> | undefined) {
        if (item == null) return 'https://wiby.me/';

        if (item.storage_type == 'local') {
            return finder.to_url(item.id);
        } else {
            return item.url;
        }
    }
</script>

<div
    id="work-space"
    bind:this={node_ref}
    bind:clientHeight={workSpaceHeight}
    class="absolute inset-0 {$queueProgram != null ? 'waiting' : ''}"
>
    <Wallpaper></Wallpaper>
    <DesktopFolder></DesktopFolder>
</div>
