<script lang="ts">
    import { tooltip } from './tooltip';
    export let style = '';
    export let tooltip_message: string | undefined = undefined;
    export let icon: string;

    export let on_click: (e: MouseEvent) => void = () => {
        console.log('on click');
    };
</script>

<div
    class="mr-1 w-4 h-4 bg-no-repeat bg-contain"
    style:background-image="url({icon})"
    on:click={on_click}
    use:tooltip
    tooltip={tooltip_message}
></div>
