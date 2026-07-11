<script>
    import { contextMenu, selectingItems, zIndex, clipboard, hardDrive, clipboard_op, queueProgram } from '../../../../lib/store';
    
    import * as finder from '../../../../lib/finder';
    import * as utils from '../../../../lib/utils';
    import { doctypes, icons, my_computer, hidden_items, recycle_bin_id, previewable_exts } from '../../../../lib/system';
    import * as fs from '../../../../lib/fs';
    const {click_outside, long_press, double_tap} = utils;
    import { createEventDispatcher, tick, mount, unmount } from 'svelte';
    import short from 'short-uuid';
    import {get, set} from 'idb-keyval';
    import { filter, map } from 'lodash';
    import { parse_dir } from '../../../../lib/dir_parser';
    let dispatch = createEventDispatcher();
        import Previewable from '../../../../lib/components/xp/Previewable.svelte';
    import hash_sum from 'hash-sum';

    export let self;
    export let my_computer_instance;
    export let id = null;
    
    $: items =  $hardDrive[id] == null ? 
        [] : 
        $hardDrive[id]
        .children
        .map(id => $hardDrive[id])
        .filter(el => el != null)
        .filter(el => !hidden_items.includes(el.id));

    $: sorted_items = id ? null : null;//reset sorted_items every time id changes
    $: if (id !== undefined) { $selectingItems = []; }
    let worker = new Worker(new URL('./sort.js', import.meta.url), {type: 'module'});
    worker.onmessage = ({data}) => {
        if(data.type == 'sorted' && data.id == id){
            console.log('update sorted_items', id);
            sorted_items = data.sorted_items;
        }
    }

    let last_sort_tx_hash;
    $: {
        if($hardDrive[id]){
            let hash_object = {
                id,
                items, 
                sort_option: $hardDrive[id].sort_option, 
                sort_order: $hardDrive[id].sort_order
            };

            let hash = hash_sum(hash_object);
            console.log({hash})
            if(hash != last_sort_tx_hash){
                last_sort_tx_hash = hash;
                worker.postMessage({type: 'sort', hash, ...hash_object});
            }
        } else {
            last_sort_tx_hash = null;
        }
    }

    $: is_focus = $zIndex == my_computer_instance?.window?.z_index;
    let computer = my_computer.map(el => $hardDrive[el]);

    let node_ref;
    $: {
        if(id != null && $hardDrive[id] == null){
            dispatch('open', {id: null});
        }
        show_guide();
    }

    export let renaming = false;

    // Drag state for rubber-band select
    let _drag_start = null;
    let _drag_moved = false;
    let _item_long_pressed = false;
    let rb_visible = false;
    let rb_left = 0, rb_top = 0, rb_width = 0, rb_height = 0;

    function on_mousedown(e) {
        if (e.button !== 0) return;
        _drag_moved = false;
        if (!e.target.closest('.fs-item')) {
            _drag_start = {x: e.clientX, y: e.clientY};
        }
    }

    function on_mousemove(e) {
        if (!_drag_start) return;
        let dx = e.clientX - _drag_start.x, dy = e.clientY - _drag_start.y;
        if (!_drag_moved && dx*dx + dy*dy < 25) return;
        _drag_moved = true;
        rb_visible = true;
        let cr = node_ref.getBoundingClientRect();
        let [sx, sy, cx, cy] = [_drag_start.x, _drag_start.y, e.clientX, e.clientY];
        let rbc = {left: Math.min(sx,cx), right: Math.max(sx,cx), top: Math.min(sy,cy), bottom: Math.max(sy,cy)};
        rb_left = rbc.left - cr.left + node_ref.scrollLeft;
        rb_top = rbc.top - cr.top + node_ref.scrollTop;
        rb_width = rbc.right - rbc.left;
        rb_height = rbc.bottom - rbc.top;
        let sel = [];
        for (let el of node_ref.querySelectorAll('.fs-item')) {
            let r = el.getBoundingClientRect();
            if (r.left < rbc.right && r.right > rbc.left && r.top < rbc.bottom && r.bottom > rbc.top) {
                let fid = el.getAttribute('fs-id');
                if ($hardDrive[fid] != null) sel.push(fid);
            }
        }
        $selectingItems = sel;
    }

    function on_mouseup() {
        if (!_drag_start) return;
        rb_visible = false;
        _drag_start = null;
    }

    function on_rightclick(ev, item){
        let selected = $selectingItems.includes(item.id);
        if (!selected) {
            if(ev.metaKey || ev.ctrlKey){
                $selectingItems = [...$selectingItems, item.id];
            } else {
                $selectingItems = [item.id];
            }
        }

        contextMenu.set(null);

        let originator = {item};
        originator.my_computer_instance = my_computer_instance;
        originator.open = (id) => {open(id)};
        originator.rename = () => { rename() }

        contextMenu.set({x: ev.x, y: ev.y, type: 'FSItem', originator: originator});
    }

    function show_void_menu(ev){
        contextMenu.set({x: ev.x, y: ev.y, type: 'FSVoid', originator: {id}});
    }

    function clear_selection(){
        $selectingItems = [];
    }



    let _last_open = 0;
    function open(id){
        const now = Date.now();
        if (now - _last_open < 400) return;
        _last_open = now;
        clear_selection();
        let fs_item = $hardDrive[id];
        if(fs_item.parent == recycle_bin_id) return;
        
        if(fs_item.type == 'file'){
            console.log(fs_item)
            if(fs_item.executable){
                
                queueProgram.set({
                    path: fs_item.url,
                    webapp: fs_item.webapp
                })
            } else if(doctypes[fs_item.ext] != null){
                queueProgram.set({
                    path: doctypes[fs_item.ext][0].path,
                    fs_item: fs_item
                })
            } else {
                queueProgram.set({
                    path: './programs/notepad.svelte',
                    fs_item: fs_item
                })
            }
        } else {
            dispatch('open', {id});
        }
        
    }

    function rename(){
        renaming = true;
        tick()
        .then(() => {
            let id = $selectingItems[0];
            let el = document.querySelector(`div[fs-id="${id}"] textarea`);
            let end_range = $hardDrive[id].basename.length;
            if(el != null) el.setSelectionRange(0, end_range);
        });
    }



    function end_renaming(e, item){
        let name = utils.sanitize_filename(e.target.value);

        let ext = utils.extname(name);
        let seedname = utils.basename(name, ext);
        let basename = seedname;

        item.ext = ext.toLowerCase();

        if(basename.trim() == ''){
            renaming = false;
            return;
        }
        
        let parent_items_names = [
            ...$hardDrive[item.parent].children.filter(el => el != item.id).map(el => $hardDrive[el].name),
        ]
        let appendix = 2;
        while(parent_items_names.includes(basename + item.ext)){
            basename = seedname + ' ' + appendix;
            appendix++;
        }
        $hardDrive[item.id].basename = basename;
        $hardDrive[item.id].ext = item.ext;
        $hardDrive[item.id].name = basename + item.ext;
        
        renaming = false;
    }

    function on_keydown(e){
        
        if(my_computer_instance?.window?.z_index != $zIndex) return;
        if(renaming) return;
        if(id == null) return;
        console.log('keyevent in my computer');

        if(!(e.ctrlKey || e.metaKey)) return;
        if(e.key == 'c'){
            fs.copy();
        } else if(e.key == 'x'){
            fs.cut();
        } else if(e.key == 'v'){
            fs.paste(id);
        } else if(e.key == 'a'){
            $selectingItems = items.map(el => el.id);
        } else if(e.key == 'ArrowUp'){
            e.preventDefault();
            my_computer_instance.up();

        }
    }

    async function on_drop(e){
        e.preventDefault();
        if(id == null) return;
        
        let copying_obj = await parse_dir(e);
        queueProgram.set({
            path: './programs/copier.svelte',
            copying_obj,
            target_folder_id: id
        })

    }
    

    function on_drop_over(e){
        e.preventDefault();
    }

    function file_icon(item){
        if(item.icon != null){
            return `url(${item.icon})`
        }
        if(icons[item.ext] != null){ 
            return `url(/images/xp/icons/${icons[item.ext]})`
        }
        return null;
    }

    async function show_guide(){
        let read_transfer_guide = await get('my_computer::read_transfer_guide');

        if(!read_transfer_guide && id != null && window.innerWidth >= 640){
            const Dialog = (await import('../../../../lib/components/xp/Dialog.svelte')).default;
            let dialog;
            let buttons = [{name: 'OK', action: () => dialog.destroy(), focus: true}]
            dialog = mount(Dialog, {
                target: my_computer_instance.window.node_ref,
                props:{
                    title: 'File Transfer',
                    message: 'You can drag and drop files or folders from your computer into any folder here to copy them into Windows XP.',
                    buttons,
                    button_align: 'center',
                    get_self: () => dialog,
                }
            });
            set('my_computer::read_transfer_guide', true);
        }
    }

</script>

<div class="absolute inset-0 overflow-auto bg-slate-50"
    on:drop={on_drop} on:dragover={on_drop_over} bind:this={node_ref}
    on:mousedown={on_mousedown}
    on:click={(e) => { if (!e.target.closest('.fs-item') && !_drag_moved) { $selectingItems = []; } }}>
    <div class="w-full min-h-[90%]" class:hidden={id == null}
        on:contextmenu|self={show_void_menu} on:click|self={() => { if (!_drag_moved) clear_selection(); }}
        use:long_press on:long_press|self={(e) => { if (!_item_long_pressed) show_void_menu({x: e.detail.x, y: e.detail.y}); }}>
        {#if sorted_items}
            {#each sorted_items as item (item.id)}
                <div fs-id="{item.id}" class="fs-item w-[150px] overflow-hidden m-2 inline-flex flex-row items-center font-MSSS relative
                    {$clipboard.includes(item.id) && $clipboard_op == 'cut' ? 'opacity-70' : ''}"
                    on:dblclick={() => open(item.id)} on:contextmenu={(e) => on_rightclick(e, item)}
                    on:click={(e) => { if (_drag_moved) return; let fs_id = e.currentTarget.getAttribute('fs-id'); if (e.ctrlKey || e.metaKey) { $selectingItems = $selectingItems.includes(fs_id) ? $selectingItems.filter(id => id !== fs_id) : [...$selectingItems, fs_id]; } else { $selectingItems = [fs_id]; } }}
                    use:double_tap on:double_tap={() => open(item.id)}
                    use:long_press on:long_press={(e) => { _item_long_pressed = true; setTimeout(() => _item_long_pressed = false, 100); on_rightclick({x: e.detail.x, y: e.detail.y}, item); }}>
                    {#if previewable_exts.includes(item.ext)}
                        <Previewable default_icon={file_icon(item)} fs_id={item.id}></Previewable>
                    {:else}
                        <div class="w-[50px] h-[50px] shrink-0 bg-contain bg-no-repeat bg-center
                        {item.type == 'folder' ? 'bg-[url(/images/xp/icons/FolderClosed.png)]' : 'bg-[url(/images/xp/icons/Default.png)]'} "
                            style:background-image="{file_icon(item)}">
                        </div>
                    {/if}
                    <p class="px-1 mx-0.5 text-[11px] break-words line-clamp-2 text-ellipsis leading-tight
                        {$selectingItems?.includes(item.id) && is_focus ? 'bg-blue-600 text-slate-50' : ''}">
                        {item.name}
                    </p>
                    {#if $selectingItems.includes(item.id) && renaming}
                        <textarea
                            autofocus
                            on:keydown={e => e.key == 'Enter' && end_renaming(e, item)}
                            on:blur={(e) => end_renaming(e, item)}
                            class="absolute max-h-[40px] right-0 top-2 left-[50px] overflow-hidden 
                            outline-none border border-slate-900 text-[11px] font-MSSS z-50 resize-none"
                        >{item.name}</textarea>
                    {/if}
                    
                </div>
            {/each}
        {:else}
            <p class="text-center text-sm font-Trebuchet my-2 text-slate-500">working on it...</p>
        {/if}

        
    </div>

    <div class="w-full" class:hidden={id != null}>

        <p class="ml-2 mt-0.5 font-MSSS text-black text-[11px] font-bold">Files Stored on This Computer</p>
        <div class="mb-4 w-[300px] h-[2px] bg-gradient-to-r from-blue-500 to-slate-50"></div>
        {#each computer.filter(el => el.type == 'folder') as item}
            <div class="w-[150px] ml-4 mr-8 overflow-hidden inline-flex flex-row items-center font-MSSS"
                on:dblclick={() => open(item.id)} on:contextmenu={(e) => on_rightclick(e, item)}
                use:double_tap on:double_tap={() => open(item.id)}
                use:long_press on:long_press={(e) => { _item_long_pressed = true; setTimeout(() => _item_long_pressed = false, 100); on_rightclick({x: e.detail.x, y: e.detail.y}, item); }}>
                <div class="w-[50px] h-[50px] shrink-0 bg-[url(/images/xp/icons/FolderClosed.png)] bg-contain bg-no-repeat bg-center"
                    style:background-image="{item.icon == null ? '' : `url(${item.icon})`}">
                </div>
                <div class="px-1 text-[11px] line-clamp-2 text-ellipsis leading-tight">
                    {item.display_name != null ? item.display_name : item.name}
                </div>
            </div>
        {/each}

        <p class="ml-2 mt-4 font-MSSS text-black text-[11px] font-bold">Hard Disk Drives</p>
        <div class="mb-4 w-[300px] h-[2px] bg-gradient-to-r from-blue-500 to-slate-50"></div>
        {#each computer.filter(el => el.type == 'drive') as item}
            <div class="w-[150px] ml-4 mr-8 overflow-hidden inline-flex flex-row items-center font-MSSS"
                on:dblclick={() => open(item.id)} on:contextmenu={(e) => on_rightclick(e, item)}
                use:double_tap on:double_tap={() => open(item.id)}
                use:long_press on:long_press={(e) => { _item_long_pressed = true; setTimeout(() => _item_long_pressed = false, 100); on_rightclick({x: e.detail.x, y: e.detail.y}, item); }}>
                <div class="w-[50px] h-[50px] shrink-0 bg-[url(/images/xp/icons/LocalDisk.png)] bg-contain bg-no-repeat bg-center">
                </div>
                <div class="px-1 text-[11px] line-clamp-2 text-ellipsis leading-tight">
                    {item.display_name != null ? item.display_name : item.name}
                </div>
            </div>
        {/each}

        <p class="ml-2 mt-4 font-MSSS text-black text-[11px] font-bold">Devices with Removable Storage</p>
        <div class="mb-4 w-[300px] h-[2px] bg-gradient-to-r from-blue-500 to-slate-50"></div>
        {#each computer.filter(el => el.type == 'removable_storage') as item}
            <div class="w-[150px] ml-4 mr-8 overflow-hidden inline-flex flex-row items-center font-MSSS"
                on:dblclick={() => open(item.id)} on:contextmenu={(e) => on_rightclick(e, item)}
                use:double_tap on:double_tap={() => open(item.id)}
                use:long_press on:long_press={(e) => { _item_long_pressed = true; setTimeout(() => _item_long_pressed = false, 100); on_rightclick({x: e.detail.x, y: e.detail.y}, item); }}>
                <div class="w-[50px] h-[50px] shrink-0 bg-[url(/images/xp/icons/RemovableMedia.png)] bg-contain bg-no-repeat bg-center">
                </div>
                <div class="px-1 text-[11px] line-clamp-2 text-ellipsis leading-tight">
                    {item.display_name != null ? item.display_name : item.name}
                </div>
            </div>
        {/each}
    </div>

    {#if rb_visible}
        <div class="absolute pointer-events-none border border-blue-500 bg-blue-500/20"
            style:left="{rb_left}px" style:top="{rb_top}px" style:width="{rb_width}px" style:height="{rb_height}px">
        </div>
    {/if}

</div>

<svelte:options accessors={true}></svelte:options>
<svelte:window on:keydown={on_keydown} on:mousemove={on_mousemove} on:mouseup={on_mouseup}></svelte:window>