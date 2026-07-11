<script>
    import { unmount, mount } from 'svelte';
    export let get_self = () => null;
    import Window from './Window.svelte';
    import { hardDrive, selectingItems} from '../../store';
    import {my_pictures_id, my_music_id, desktop_folder} from '../../system';
    import * as utils from '../../utils';
    import * as finder from '../../finder'

    import _, { find, isEqual } from 'lodash';
    import TitleBar from './TitleBar.svelte';
    import Viewer3 from './Viewer3.svelte';
    

    
    export let id;

    export let viewer;
    export let filetypes = [];
    export let selected_filetype;
    export let filename;
    export let parent_id;

    let left_side_places = [
        {
            id: desktop_folder,
            name: 'Desktop',
            icon: '/images/xp/icons/Desktop.png'
        },
        {
            id: my_pictures_id,
            name: 'My Pictures',
            icon: '/images/xp/icons/MyPictures.png'
        },
        {
            id: my_music_id,
            name: 'My Music',
            icon: '/images/xp/icons/MyMusic.png'
        },
        {
            id: null,
            name: 'My Computer',
            icon: '/images/xp/icons/MyComputer.png'
        }
    ]


    export function destroy(){
        console.log(self);
        unmount(get_self());
    }

    export let on_save = () => {}

</script>

<div class="absolute inset-0 bg-slate-50/40 rounded-t-lg" style:z-index="100000" on:click|self={(e) => {
    e.target.querySelector('div').classList.add('animate-blink');
    setTimeout(() => {
        e.target.querySelector('div').classList.remove('animate-blink');
    }, 400);
}}>
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col"
        style="width: min(600px, 95vw); height: min(500px, 85dvh);">
        <TitleBar options={{title: 'Save', maximize_btn: false, minimize_btn: false}} on_click_close={destroy}></TitleBar>
        <div class="absolute inset-0 top-[28px]  bg-xp-yellow shadow-lg border-t-0 border-2 border-blue-600">
            <div class="absolute top-1 left-1 bottom-0 w-[100px]">
                <div class="h-7 mr-2 flex flex-row justify-end items-center">
                    <span class="text-[11px] text-black">Look in:</span>
                </div>
                <div class="bg-xp-yellow-light shadow rounded w-full overflow-y-auto">
                    {#each left_side_places as place}
                        <div class="w-full flex flex-col items-center py-2 px-1 hover:bg-slate-100 rounded"
                            on:click={() => viewer.open(place.id)}>
                            <div class="w-10 h-10 bg-contain bg-no-repeat bg-center" style:background-image="url({place.icon})"></div>
                            <span class="mt-1 text-[10px] text-black text-center leading-tight">{place.name}</span>
                        </div>
                    {/each}
                </div>
            </div>

            <div class="absolute top-1 left-[110px] right-1 bottom-1">
                <Viewer3 bind:this={viewer} id={id} filetypes={filetypes} selected_filetype={selected_filetype}
                    on_save={(data) => on_save(data)}
                    on_cancel={destroy}>
                </Viewer3>
            </div>
        </div>
    </div>
</div>


<svelte:options accessors={true}></svelte:options>