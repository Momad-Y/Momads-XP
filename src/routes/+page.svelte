<script lang="ts">
    import { onMount } from 'svelte';
    import type { LoadPageEvent } from '../lib/types';
    /* eslint-disable @typescript-eslint/no-duplicate-type-constituents -- eslint's TS service resolves .svelte imports as `any`, so the union members look identical to it; svelte-check types them precisely */
    import type Starting from './xp/starting.svelte';
    import type Desktop from './xp/desktop.svelte';
    import type Shutdown from './xp/shutdown.svelte';
    import type Blackout from './xp/blackout.svelte';

    type PageComponent =
        typeof Starting | typeof Desktop | typeof Shutdown | typeof Blackout;
    /* eslint-enable @typescript-eslint/no-duplicate-type-constituents */

    let page: PageComponent | undefined = undefined;

    onMount(async () => {
        await load_page('./xp/starting.svelte');
    });

    async function load_page(url: string) {
        //manually import modules cause Vite doesn't support fully dynamic import specifiers
        if (url == './xp/starting.svelte') {
            page = (await import('./xp/starting.svelte')).default;
        } else if (url == './xp/desktop.svelte') {
            page = (await import('./xp/desktop.svelte')).default;
        } else if (url == './xp/shutdown.svelte') {
            page = (await import('./xp/shutdown.svelte')).default;
        } else if (url == './xp/blackout.svelte') {
            page = (await import('./xp/blackout.svelte')).default;
        } else if (url == './+page.svelte') {
            page = (await import('./xp/starting.svelte')).default;
        }
    }
</script>

<svelte:head>
    <title>Microsoft Windows XP Professional</title>
</svelte:head>

<svelte:component
    this={page}
    on:load_page={(e: CustomEvent<LoadPageEvent>) => {
        void load_page(e.detail.url);
    }}
></svelte:component>
