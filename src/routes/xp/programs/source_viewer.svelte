<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import Menu from '../../../lib/components/xp/Menu.svelte';
    import { unmount } from 'svelte';
    import { runningPrograms, zIndex, contextMenu } from '../../../lib/store';
    import { required } from '../../../lib/types';
    import type {
        MenuBarEntry,
        ProgramInstance,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    export let id: string;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;
    export let exec_path: string | undefined = undefined;
    /** The page whose markup this window is showing. */
    export let source: { url: string; text: string } | undefined = undefined;

    const page = source as { url: string; text: string } | undefined;
    const text = page?.text ?? '';
    const url = page?.url ?? '';
    /** XP titles the window after the file Notepad opened. */
    const title = url === '' ? 'Source' : `${short_name(url)} - Notepad`;

    function short_name(u: string): string {
        try {
            const parsed = new URL(u, 'https://example.invalid');
            const last = parsed.pathname.split('/').filter(Boolean).pop();
            return last ?? parsed.hostname;
        } catch {
            return u;
        }
    }

    let wrap = false;

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'source_viewer instance'));
    }

    function on_keydown(event: KeyboardEvent) {
        if (event.key !== 'Escape') return;
        if ($contextMenu != null) return;
        if (window?.z_index !== $zIndex) return;
        destroy();
    }

    async function copy_all() {
        try {
            await navigator.clipboard.writeText(text);
            window?.show_toast({ message: 'Source copied to the clipboard.' });
        } catch {
            window?.show_toast({ message: 'Could not copy the source.' });
        }
    }

    let menu: MenuBarEntry[];
    $: menu = [
        {
            name: 'File',
            items: [
                [
                    {
                        name: 'Close',
                        action: () => {
                            destroy();
                        },
                    },
                ],
            ],
        },
        {
            name: 'Edit',
            items: [
                [
                    {
                        name: 'Select All',
                        action: () => {
                            void copy_all();
                        },
                    },
                ],
            ],
        },
        {
            name: 'Format',
            items: [
                [
                    {
                        name: 'Word Wrap',
                        check: wrap,
                        action: () => {
                            wrap = !wrap;
                        },
                    },
                ],
            ],
        },
    ];

    export let options: WindowOptions = {
        title,
        icon: '/images/xp/icons/TXT.png',
        id,
        exec_path,
        width: 640,
        height: 480,
        min_width: 320,
        min_height: 220,
    };
</script>

<svelte:window on:keydown={on_keydown} />

<Window {options} bind:this={window} on_click_close={destroy}>
    <div slot="content" class="absolute inset-0 flex flex-col bg-xp-yellow">
        <div class="shrink-0 border-b border-stone-300 bg-xp-yellow">
            <Menu {menu} focused={window?.z_index === $zIndex} />
        </div>
        <div class="grow overflow-auto bg-white">
            <pre
                class="p-2 text-[11px] font-mono text-slate-900 {wrap
                    ? 'whitespace-pre-wrap break-all'
                    : 'whitespace-pre'}">{text}</pre>
        </div>
    </div>
</Window>
