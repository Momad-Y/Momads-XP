
<script>
   import { onMount } from 'svelte';

   let page;

   onMount(async () => {
    await load_page('./xp/starting.svelte');
   })

   async function load_page(url){
    //manually import modules cause Vite doesn't support fully dynamic import specifiers
    if(url == './xp/starting.svelte'){
        page = (await import('./xp/starting.svelte')).default;

    }
    else if(url == './xp/desktop.svelte'){
        page = (await import('./xp/desktop.svelte')).default;

    }
    else if(url == './xp/shutdown.svelte'){
        page = (await import('./xp/shutdown.svelte')).default;

    }
    else if(url == './xp/blackout.svelte'){
        page = (await import('./xp/blackout.svelte')).default;

    }
    else if(url == './+page.svelte'){
        page = (await import('./xp/starting.svelte')).default;

    }
   }

</script>

<svelte:head>
    <title>Microsoft Windows XP Professional</title>
</svelte:head>

<svelte:component this={page}  on:load_page={(e) => load_page(e.detail.url)}>
</svelte:component>
