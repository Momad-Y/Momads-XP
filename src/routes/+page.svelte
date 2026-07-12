<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import type { LoadPageEvent } from '../lib/types';
    import { decideMode } from '../lib/mobile';
    /* eslint-disable @typescript-eslint/no-duplicate-type-constituents -- eslint's TS service resolves .svelte imports as `any`, so the union members look identical to it; svelte-check types them precisely */
    import type Starting from './xp/starting.svelte';
    import type Login from './xp/login.svelte';
    import type Desktop from './xp/desktop.svelte';
    import type Shutdown from './xp/shutdown.svelte';
    import type Blackout from './xp/blackout.svelte';
    import type MobilePortfolio from './xp/mobile/MobilePortfolio.svelte';
    import type RotatePrompt from './xp/mobile/RotatePrompt.svelte';

    type PageComponent =
        | typeof Starting
        | typeof Login
        | typeof Desktop
        | typeof Shutdown
        | typeof Blackout
        | typeof MobilePortfolio
        | typeof RotatePrompt;
    /* eslint-enable @typescript-eslint/no-duplicate-type-constituents */

    let page: PageComponent | undefined = undefined;
    let mobile_locked = false;

    onMount(async () => {
        // §4.6 / design decision 8: the mode is decided ONCE at load. A booted
        // desktop never live-switches (that would destroy shell state); a
        // non-desktop load only reacts portrait ↔ rotate-prompt.
        const mode = decideMode(window.innerWidth, window.innerHeight);
        if (mode === 'desktop') {
            await load_page('./xp/starting.svelte');
            return;
        }
        mobile_locked = true;
        await load_mobile(mode);
        window.addEventListener('resize', on_mobile_resize);
    });

    onDestroy(() => {
        if (mobile_locked && typeof window !== 'undefined') {
            window.removeEventListener('resize', on_mobile_resize);
        }
    });

    function on_mobile_resize() {
        const next = decideMode(window.innerWidth, window.innerHeight);
        // never live-switch into the desktop shell: a >=1024px landscape
        // rotation after a mobile load gets the rotate/desktop prompt instead
        void load_mobile(next === 'mobile' ? 'mobile' : 'rotate');
    }

    async function load_mobile(mode: 'mobile' | 'rotate') {
        page =
            mode === 'mobile'
                ? (await import('./xp/mobile/MobilePortfolio.svelte')).default
                : (await import('./xp/mobile/RotatePrompt.svelte')).default;
    }

    async function load_page(url: string) {
        //manually import modules cause Vite doesn't support fully dynamic import specifiers
        if (url == './xp/starting.svelte') {
            page = (await import('./xp/starting.svelte')).default;
        } else if (url == './xp/login.svelte') {
            page = (await import('./xp/login.svelte')).default;
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
    <title>Momad's XP</title>
</svelte:head>

<svelte:component
    this={page}
    on:load_page={(e: CustomEvent<LoadPageEvent>) => {
        void load_page(e.detail.url);
    }}
></svelte:component>
