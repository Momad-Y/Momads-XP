<script lang="ts">
    import { wallpaper, hardDrive } from '../../lib/store';
    import { get as store_get } from 'svelte/store';
    import { get } from 'idb-keyval';
    import { required } from '../../lib/types';

    let cached_url: string | null = '';

    async function get_wallpaper_url(w: string | null) {
        const fs_item = required(
            w == null
                ? undefined
                : required(store_get(hardDrive), 'hard drive')[w], // read without subscribing — avoids re-render on hardDrive changes
            'wallpaper item ' + String(w),
        );
        console.log(fs_item);
        let url: string | null = null;

        if (fs_item.storage_type == 'remote') {
            url = fs_item.url ?? null;
        } else if (fs_item.storage_type == 'local') {
            const file = await get<Blob>(
                required(fs_item.url, 'wallpaper idb key'),
            );
            url = URL.createObjectURL(required(file, 'wallpaper blob'));
        }

        await load_image_url(url);
        cached_url = url;
        return url;
    }

    function load_image_url(url: string | null) {
        return new Promise<void>((resolve) => {
            const image = new Image();
            if (url != null) {
                image.src = url;
            }
            image.onload = () => {
                resolve();
            };
        });
    }
</script>

{#await get_wallpaper_url($wallpaper)}
    <div
        class="absolute inset-0 bg-cover bg-black"
        style:background-image="url({cached_url})"
    ></div>
{:then url}
    <div
        class="absolute inset-0 bg-cover"
        style:background-image="url({url})"
    ></div>
{/await}
