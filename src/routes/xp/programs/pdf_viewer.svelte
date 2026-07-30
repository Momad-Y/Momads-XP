<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import RButton from '../../../lib/components/xp/RButton.svelte';
    import { onMount, tick, unmount } from 'svelte';
    import { runningPrograms } from '../../../lib/store';
    import { profile } from '../../../lib/profile';
    import * as fs from '../../../lib/fs';
    import { required } from '../../../lib/types';
    import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
    import pdf_worker_url from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
    import type {
        ProgramInstance,
        VfsItem,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    GlobalWorkerOptions.workerSrc = pdf_worker_url;

    export let id: string;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;
    export let fs_item: VfsItem | undefined = undefined;
    export let exec_path: string | undefined = undefined;

    // widened back from the `undefined` initializer: eslint's TS service
    // narrows `export let` props to their default in top-level flow (Svelte
    // injects the real prop value before this code runs)
    const item = fs_item as VfsItem | undefined;

    // Dual entry (spec D6): the desktop "My CV.exe" launch passes no fs_item
    // and falls back to the resume; the .pdf doctype passes the opened file —
    // remote (seeded asset) or local (user-uploaded IndexedDB blob).
    let pdf_url: string | null = null;
    let object_url: string | null = null;

    async function resolve_pdf_url(): Promise<string | null> {
        // No fs_item → the "My CV.exe" desktop launch → show the résumé.
        if (item == null) return profile.meta.resumePdf;
        // An fs_item was supplied (a real .pdf file). If its content can't be
        // resolved (idb blob evicted, etc.), surface an error rather than
        // silently substituting the owner's résumé under this file's name
        // (red-team #6).
        try {
            const resolved = await fs.get_url(item.id);
            if (resolved != null) {
                if (resolved.startsWith('blob:')) {
                    release_object_url();
                    object_url = resolved;
                }
                return resolved;
            }
        } catch (error) {
            console.error('pdf url resolution failed', error);
        }
        return null;
    }

    let pages_node: HTMLDivElement | undefined;
    let zoom = 1;
    let page_count = 0;
    let load_error = false;

    // Render-token guard (gate-6 B2): rapid zoom clicks re-enter render();
    // a stale pass must never clear/append into the shared pages_node.
    let render_token = 0;

    async function render() {
        const node = pages_node;
        if (node == null) return;
        const token = ++render_token;
        try {
            pdf_url ??= await resolve_pdf_url();
            if (pdf_url == null) {
                if (token === render_token) load_error = true;
                return;
            }
            const task = getDocument({ url: pdf_url });
            const doc = await task.promise;
            if (token !== render_token) {
                void task.destroy();
                return;
            }
            page_count = doc.numPages;
            node.replaceChildren();
            for (let i = 1; i <= doc.numPages; i++) {
                if (token !== render_token) break;
                const page = await doc.getPage(i);
                const base = page.getViewport({ scale: 1 });
                const scale = ((node.clientWidth - 24) / base.width) * zoom;
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                canvas.className = 'mx-auto mb-3 shadow-md bg-white';
                if (token !== render_token) break;
                node.appendChild(canvas);
                await page.render({ canvas, viewport }).promise;
            }
            void task.destroy();
        } catch (error) {
            console.error('pdf render failed', error);
            // only the newest render pass may flip the error screen, or a stale
            // failure could hide a succeeding one (red-team #11)
            if (token === render_token) load_error = true;
        }
    }

    /** Revoke and forget the current object URL before it's overwritten. */
    function release_object_url() {
        if (object_url != null) {
            URL.revokeObjectURL(object_url);
            object_url = null;
        }
    }

    async function retry() {
        load_error = false;
        // a failed fetch may have cached nothing — revoke the stale blob URL
        // (red-team #11) and resolve fresh
        release_object_url();
        pdf_url = null;
        // the error view swaps out and pages_node re-binds on the next tick
        await tick();
        await render();
    }

    onMount(() => void render());

    function set_zoom(next: number) {
        zoom = Math.min(3, Math.max(0.5, next));
        void render();
    }

    async function download() {
        const href = pdf_url ?? (await resolve_pdf_url());
        if (href == null) return;
        const a = document.createElement('a');
        a.href = href;
        a.download = item?.name ?? '';
        a.click();
    }

    export function destroy() {
        release_object_url();
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'pdf_viewer instance'));
    }

    export let options: WindowOptions = {
        title: item?.name ?? 'My CV',
        icon: '/assets/icons/my-cv.png',
        id,
        exec_path,
        width: 640,
        height: 720,
        min_width: 420,
        min_height: 360,
    };
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div slot="content" class="absolute inset-0 flex flex-col bg-[#808080]">
        <div
            class="shrink-0 flex flex-row items-center gap-1 bg-[#ece9d8] border-b border-[#aca899] px-1 py-0.5"
        >
            <RButton
                title="Download"
                icon="/images/xp/icons/FloppyDisk.png"
                on_click={() => {
                    void download();
                }}
            />
            <div class="w-px h-5 bg-[#aca899] mx-1"></div>
            <RButton
                title="−"
                icon="/images/xp/icons/Magnifier.png"
                tooltip_message="Zoom out"
                on_click={() => {
                    set_zoom(zoom - 0.25);
                }}
            />
            <RButton
                title="+"
                icon="/images/xp/icons/Magnifier.png"
                tooltip_message="Zoom in"
                on_click={() => {
                    set_zoom(zoom + 0.25);
                }}
            />
            <span class="ml-2 text-[11px] font-Tahoma"
                >{page_count > 0
                    ? `${String(page_count)} page${page_count > 1 ? 's' : ''}`
                    : ''}</span
            >
        </div>
        {#if load_error}
            <div
                class="grow flex flex-col items-center justify-center gap-3 px-8"
            >
                <p class="text-[12px] text-white font-Tahoma text-center">
                    This document could not be loaded — this can happen on a
                    weak Internet connection. Check your connection, then try
                    again.
                </p>
                <RButton
                    title="Try Again"
                    on_click={() => {
                        void retry();
                    }}
                />
            </div>
        {:else}
            <div bind:this={pages_node} class="grow overflow-auto p-3"></div>
        {/if}
    </div>
</Window>
