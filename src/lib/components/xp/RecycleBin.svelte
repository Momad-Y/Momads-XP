<script lang="ts">
    import { hardDrive, queueProgram, contextMenu } from '../../store';
    import { recycle_bin_id } from '../../system';
    export let style: string | undefined = undefined;
    export let classes: string | undefined = undefined;

    $: icon =
        ($hardDrive?.[recycle_bin_id]?.children.length ?? 0) > 0
            ? 'url(/images/xp/icons/RecycleBinfull.png)'
            : 'url(/images/xp/icons/RecycleBinempty.png)';

    function on_dbclick() {
        let fs_item = $hardDrive?.[recycle_bin_id];
        queueProgram.set({
            path: './programs/my_computer.svelte',
            fs_item: fs_item,
        });
    }

    function on_rightclick(ev: MouseEvent) {
        contextMenu.set(null);
        contextMenu.set({
            x: ev.x,
            y: ev.y,
            type: 'RecycleBin',
            originator: null,
        });
    }
</script>

<div
    class="flex flex-col items-center absolute bottom-2 right-2 {classes}"
    {style}
    on:dblclick={on_dbclick}
    on:contextmenu={on_rightclick}
>
    <div
        class="w-[40px] h-[40px] bg-contain"
        style:background-image={icon}
    ></div>
    <p
        class="text-center text-[11px] font-MSSS text-white"
        style="text-shadow: 1px 1px 2px black;"
    >
        Recycle Bin
    </p>
</div>
