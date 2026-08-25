<script lang="ts">
    import { onMount, onDestroy, mount, tick } from 'svelte';
    import { get } from 'svelte/store';
    import Wallpaper from './wallpaper.svelte';
    import { queueProgram, runningPrograms } from '../../lib/store';
    import { HOMEPAGE } from '../../lib/search';
    import { show_no_association_dialog } from '../../lib/no_association';
    import short from 'short-uuid';
    import DesktopFolder from './desktop_folder.svelte';
    import * as finder from '../../lib/finder';
    import { full_vfs_item } from '../../lib/types';
    import {
        find_app,
        singleton_paths,
        to_window_options,
    } from '../../lib/app_registry';
    import type {
        ProgramInstance,
        ProgramLaunchRequest,
        VfsItem,
    } from '../../lib/types';

    let node_ref: HTMLDivElement;
    let workSpaceHeight: number;

    /**
     * DECLARED BEFORE the queueProgram subscription below, and it must stay
     * there.
     *
     * `store.subscribe()` invokes its callback SYNCHRONOUSLY with the current
     * value, so if a program is already queued when this component
     * initialises, `launch()` runs during init — before any `const` further
     * down has been evaluated. `focus_existing()` reads this array, so having
     * it below produced:
     *
     *     ReferenceError: Cannot access 'singleton_programs' before
     *     initialization
     *         at focus_existing -> launch_inner -> launch -> subscribe
     *
     * A latent trap in the inherited ordering; the registry lookup added
     * beside it is what made the path reachable.
     */
    /**
     * XP's property sheets are single-instance: invoking Folder Options (etc.)
     * again raises the open one rather than stacking a second copy with its own
     * taskbar button (red-team M6).
     */
    const singleton_programs = [
        './programs/system_properties.svelte',
        './programs/folder_options.svelte',
        './programs/internet_options.svelte',
        './programs/organize_favorites.svelte',
    ];

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

    function focus_existing(path: string | undefined): boolean {
        // Registry singletons count too, or `AppDefinition.singleton` would be
        // a field that type-checks and does nothing — the exact class of defect
        // the registry exists to remove.
        const singletons = [...singleton_programs, ...singleton_paths()];
        if (path == null || !singletons.includes(path)) return false;
        const open = get(runningPrograms).find(
            (p) => p.options.exec_path === path,
        );
        if (open == null) return false;
        // Deferred a tick: the click that re-invoked us also focuses the window
        // it came from, and `Window.focus()` no-ops when it sees its own
        // z-index already equal to the store's — so raising in the same tick
        // leaves the two tied and the sheet buried.
        void tick().then(() => {
            open.window?.restore(); // restore() focuses too
        });
        return true;
    }

    async function launch(program: ProgramLaunchRequest) {
        // `finally`, not a trailing statement: `queueProgram.set(null)` used to
        // be the last line of the function, so ANY throw skipped it. The store
        // then stayed non-null, `work_space` kept its `waiting` class, and the
        // whole desktop was stuck on `cursor: wait` — with the rejection
        // unhandled, because the subscriber calls `void launch(...)`.
        try {
            await launch_inner(program);
        } catch (error) {
            // CAUGHT, not left to reject. The subscriber calls
            // `void launch(...)`, so a throw here became an unhandled promise
            // rejection: nothing logged it, nothing showed the visitor
            // anything, and the guide's claim that this branch "surfaces" a
            // mistyped path was only true in the sense that it crashed
            // silently. The realistic trigger is a legacy cached VFS `.exe`
            // whose `url` no longer resolves.
            console.error('program launch failed', error);
            show_no_association_dialog(
                program.fs_item?.name ?? program.path ?? 'This program',
            );
        } finally {
            queueProgram.set(null);
        }
    }

    async function launch_inner(program: ProgramLaunchRequest) {
        const {
            fs_item,
            exe_item,
            copying_obj,
            target_folder_id,
            path,
            source,
        } = program;

        if (focus_existing(path)) {
            return;
        }

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
        } else if (path == './programs/source_viewer.svelte') {
            const Program = (await import('./programs/source_viewer.svelte'))
                .default;
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: short.generate(),
                    source,
                    exec_path: path,
                    get_self: () => program,
                },
            });
            //add to program tray
            runningPrograms.update((values) => {
                return [...values, program];
            });
        } else if (path == './programs/organize_favorites.svelte') {
            const Program = (
                await import('./programs/organize_favorites.svelte')
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
        } else if (path == './programs/add_to_favorites.svelte') {
            const Program = (await import('./programs/add_to_favorites.svelte'))
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
        } else if (path == './programs/folder_options.svelte') {
            const Program = (await import('./programs/folder_options.svelte'))
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
        } else if (path == './programs/internet_options.svelte') {
            const Program = (await import('./programs/internet_options.svelte'))
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
        } else {
            // ── registry fallthrough (SPECIFICATION.md §6.3) ────────────────
            // Everything above is the inherited if-chain; Phase 3 apps live in
            // the registry instead. Reaching here with an unregistered path
            // used to be a SILENT no-op — no window, no error, no failing
            // test — which is how a mistyped specifier could ship.
            const app = find_app(path);
            if (app == null) {
                // A request with NO path is not a typo — several inherited
                // call sites queue one to hand `fs_item`/`copying_obj` to a
                // branch above, and the chain has always let those fall
                // through silently. Preserving that is deliberate: turning it
                // into a throw broke boot, because `store.subscribe()` fires
                // synchronously and work_space can initialise with one queued.
                if (path == null) return;
                // A path that IS set but matches nothing is the real defect
                // this branch exists to surface — previously a silent no-op
                // with no window, no error and no failing test.
                throw new Error(`no program registered for path: ${path}`);
            }
            const Program = (await app.component()).default;
            // ONE id, used for both the component prop and options.id — see
            // to_window_options(). Generating it twice, or omitting it from
            // options, silently breaks taskbar focus, the minimize animation
            // and window cascading.
            const instance_id = short.generate();
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: instance_id,
                    parentNode: node_ref,
                    fs_item: full_vfs_item(fs_item),
                    exec_path: app.path,
                    get_self: () => program,
                    // For a REGISTERED app the registry is the source of
                    // truth for title/icon/size, so passing this replaces
                    // nothing: registry components deliberately do not declare
                    // their own `options` default. (The inherited branches
                    // above are the opposite — their components own it — which
                    // is why this is a separate path rather than a rewrite.)
                    options: to_window_options(app, instance_id),
                },
            });
            if (app.taskbar !== false) {
                runningPrograms.update((values) => [...values, program]);
            }
        }
    }

    function get_url(item: Partial<VfsItem> | undefined) {
        if (item == null) return HOMEPAGE;

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
