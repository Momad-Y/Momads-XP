<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import { onMount, unmount } from 'svelte';
    import * as fs from '../../../lib/fs';
    import { runningPrograms } from '../../../lib/store';
    import { resolve_portfolio_ref } from '../../../lib/portfolio';
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
    export let fs_item: VfsItem | undefined = undefined;
    export let exec_path: string | undefined = undefined;

    // widened back from the `undefined` initializer: eslint's TS service
    // narrows `export let` props to their default in top-level flow (Svelte
    // injects the real prop value before this code runs)
    const item = fs_item as VfsItem | undefined;

    const detail =
        item?.portfolio_ref == null
            ? null
            : resolve_portfolio_ref(item.portfolio_ref);

    let expanded_image: string | null = null;

    /** Plain text files (user-created/uploaded) render their raw content. */
    const MAX_TEXT_BYTES = 1_048_576;
    let text_content: string | null = null;
    let text_error = false;

    onMount(async () => {
        if (detail != null || item == null) return;
        try {
            const file = await fs.get_file(item.id);
            if (file.size > MAX_TEXT_BYTES) {
                text_content = `${await file.slice(0, MAX_TEXT_BYTES).text()}\n… (truncated)`;
            } else {
                text_content = await file.text();
            }
        } catch (error) {
            console.error('text load failed', error);
            text_error = true;
        }
    });

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'portfolio_viewer instance'));
    }

    export let options: WindowOptions = {
        title: item?.basename ?? 'Portfolio',
        icon: item?.icon,
        id,
        exec_path,
        width: 500,
        height: 420,
        min_width: 380,
        min_height: 300,
    };
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div
        slot="content"
        class="absolute inset-0 overflow-y-auto bg-white font-Tahoma text-slate-900 p-4"
    >
        {#if detail == null}
            {#if text_content != null}
                <pre
                    class="whitespace-pre-wrap break-words font-MSSS text-[12px] leading-snug">{text_content}</pre>
            {:else if text_error}
                <p class="text-[11px]">This file cannot be displayed.</p>
            {:else}
                <p class="text-[11px] text-slate-500">Loading…</p>
            {/if}
        {:else}
            <h1 class="text-[17px] font-bold text-[#00309f]">
                {detail.heading}
            </h1>
            {#if detail.subheading}
                <h2 class="text-[13px] font-bold">{detail.subheading}</h2>
            {/if}
            {#each detail.meta_lines as line (line)}
                <p class="text-[11px] text-slate-500">{line}</p>
            {/each}
            {#if detail.chips.length > 0}
                <div class="mt-2 flex flex-row flex-wrap gap-1">
                    {#each detail.chips as chip (chip)}
                        <span
                            class="text-[10px] border border-[#7a96df] bg-[#eef2fb] rounded px-1.5 py-0.5"
                            >{chip}</span
                        >
                    {/each}
                </div>
            {/if}
            {#if detail.bullets.length > 0}
                <ul class="mt-3 list-disc pl-5 space-y-1.5">
                    {#each detail.bullets as bullet (bullet)}
                        <li class="text-[11px] leading-snug">{bullet}</li>
                    {/each}
                </ul>
            {/if}
            {#if detail.link}
                <!-- eslint-disable svelte/no-navigation-without-resolve -- external project URL, not an app route -->
                <a
                    href={detail.link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mt-3 inline-block text-[11px] text-[#0b3dbb] underline"
                    >{detail.link.label}</a
                >
                <!-- eslint-enable svelte/no-navigation-without-resolve -->
            {/if}
            {#if detail.images.length > 0}
                <div class="mt-4 flex flex-row flex-wrap gap-2">
                    {#each detail.images as img (img.src)}
                        <button
                            type="button"
                            on:click={() =>
                                (expanded_image =
                                    expanded_image === img.src
                                        ? null
                                        : img.src)}
                        >
                            <img
                                src={img.src}
                                alt={img.alt}
                                class="h-16 border border-slate-400 object-cover"
                            />
                        </button>
                    {/each}
                </div>
                {#if expanded_image}
                    <img
                        src={expanded_image}
                        alt=""
                        class="mt-2 max-w-full border border-slate-400"
                    />
                {/if}
            {/if}
        {/if}
    </div>
</Window>
