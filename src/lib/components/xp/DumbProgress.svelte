<script>
    import ProgressBar from "./ProgressBar.svelte";
    import * as utils from '../../utils';
    import { onMount, onDestroy } from 'svelte';

    export let style = '';
    export let increment = 5;

    let value = 10;
    let running = true;

    onMount(async () => {
        while(running){
            value = value + increment;
            if(value >= 100) value = 0;
            await utils.sleep(500);
        }
    })

    onDestroy(() => { running = false; })
</script>

<div style="{style}">
    <ProgressBar {value} style="width:100%;height:100%;"></ProgressBar>
</div>
