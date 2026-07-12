<script lang="ts">
    import * as fs from '../../fs';
    import { onMount } from 'svelte';

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

    async function load_preview() {
        console.log(preview_url);
        if (preview_url != null) return;
        if (fs_id == null) return;
        const url = await fs.get_url(fs_id);
        if (url == null) return;

        const image = new Image();
        image.src = url;
        image.onload = () => (preview_url = `url(${url})`);
    }
</script>

<div
    bind:this={node_ref}
    class="shrink-0 bg-contain bg-no-repeat bg-center"
    style:background-image={preview_url || default_icon}
    style:width="{size}px"
    style:height="{size}px"
></div>
