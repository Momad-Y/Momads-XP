<script lang="ts">
    import TaskBar from './task_bar.svelte';
    import WorkSpace from './work_space.svelte';
    import ContextMenu from '../../lib/components/xp/ContextMenu.svelte';
    import { set } from 'idb-keyval';
    import { onMount, onDestroy, createEventDispatcher } from 'svelte';
    import {
        hardDrive,
        wallpaper,
        queueCommand,
        crtEffect,
    } from '../../lib/store';
    import Welcome from './welcome.svelte';
    import type { LoadPageEvent } from '../../lib/types';
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- legacy component-event dispatcher kept as-is; migrating to callback props is a behavior change outside the type-only conversion
    const dispatcher = createEventDispatcher<{ load_page: LoadPageEvent }>();

    let io_worker: ReturnType<typeof setTimeout> | undefined;

    const unsubscribers = [
        hardDrive.subscribe(() => {
            clearInterval(io_worker);
            io_worker = setTimeout(() => {
                void set('hard_drive', $hardDrive);
            }, 1000);
        }),
        wallpaper.subscribe((value) => {
            if (value == null) return;
            void set('wallpaper', value);
        }),
        queueCommand.subscribe((cmd) => {
            if (cmd != null) {
                switch (cmd) {
                    case 'shutdown':
                        dispatcher('load_page', {
                            url: './xp/shutdown.svelte',
                        });
                        queueCommand.set(null);
                        break;
                    case 'restart':
                        dispatcher('load_page', {
                            url: './xp/shutdown.svelte',
                        });
                        break;

                    default:
                        break;
                }
            }
        }),
    ];

    let show_welcome = true;

    onMount(() => {
        crtEffect.set(localStorage.getItem('crt_effect') === 'true');
        unsubscribers.push(
            crtEffect.subscribe((v) => {
                localStorage.setItem('crt_effect', String(v));
            }),
        );

        //load other pure js lib
        // panzoom is vendored (design decision 13) — removes the unpkg runtime
        // dependency; consumer is the kept image_viewer. The Google Charts
        // loader stays CDN WITHOUT SRI: it fetches submodules dynamically, so
        // SRI is infeasible — accepted; sole consumer is disk_properties.
        loadjs([
            'https://www.gstatic.com/charts/loader.js',
            '/js/panzoom.min.js',
        ]);
    });

    onDestroy(() => {
        for (const fn of unsubscribers) {
            fn();
        }
        clearInterval(io_worker);
    });
</script>

<div id="desktop" class="absolute inset-0 p-0">
    <div
        class="absolute z-0 left-0 right-0 top-0 overflow-hidden"
        style:bottom="calc(30px + env(safe-area-inset-bottom))"
    >
        <WorkSpace />
    </div>

    <TaskBar />
    <ContextMenu />
</div>

{#if show_welcome}<Welcome on:done={() => (show_welcome = false)} />{/if}

{#if $crtEffect}
    <div
        class="pointer-events-none fixed inset-0 z-[9999]"
        style="
    background: repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.04) 2px, rgba(0,0,0,0.04) 4px);
"
    ></div>
{/if}
