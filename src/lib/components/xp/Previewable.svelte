<script lang="ts">
    import * as fs from '../../fs';
    import { onDestroy, onMount } from 'svelte';
    import { is_object_url, resolve_preview } from '../../preview';

    export let default_icon: string | null;
    export let fs_id: string | null;
    export let size = 50;
    let preview_url: string | undefined;
    let node_ref: HTMLDivElement;

    onMount(() => {
        const observer = new IntersectionObserver(intersect_callback, {
            root: null,
            threshold: 1,
        });
        observer.observe(node_ref);
    });

    const intersect_callback: IntersectionObserverCallback = (entries) => {
        entries.forEach((entry) => {
            const { isIntersecting } = entry;

            if (isIntersecting) {
                void load_preview();
            }
        });
    };

    /**
     * The object URL this icon minted, if it minted one.
     *
     * `get_url` creates a fresh one for every LOCAL file and nothing ever
     * released them, so each previewed upload leaked a blob for as long as the
     * page lived. `pdf_viewer` already does this; this call site did not.
     */
    let object_url: string | null = null;

    async function load_preview() {
        if (preview_url != null) return;
        // Tolerant by design — see src/lib/preview.ts. A file whose bytes are
        // missing leaves `default_icon` in place, which is already what the
        // visitor sees; before, it threw into a floating promise instead.
        const url = await resolve_preview(fs_id, fs.get_url);
        if (url == null) return;
        if (is_object_url(url)) object_url = url;

        const image = new Image();
        image.src = url;
        image.onload = () => (preview_url = `url(${url})`);
    }

    onDestroy(() => {
        if (object_url != null) URL.revokeObjectURL(object_url);
        object_url = null;
    });
</script>

<div
    bind:this={node_ref}
    class="shrink-0 bg-contain bg-no-repeat bg-center"
    style:background-image={preview_url || default_icon}
    style:width="{size}px"
    style:height="{size}px"
></div>
