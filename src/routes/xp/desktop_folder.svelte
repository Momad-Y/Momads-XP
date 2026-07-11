<script>
    import { contextMenu, selectingItems, zIndex, clipboard, hardDrive, clipboard_op, queueProgram } from '../../lib/store'
    
    import * as utils from '../../lib/utils';
    import { doctypes, icons, desktop_folder, previewable_exts } from '../../lib/system';
    import * as fs from '../../lib/fs';
    const {click_outside, long_press, double_tap} = utils;
    import { tick } from 'svelte';
    import short from 'short-uuid';
    import {get, set} from 'idb-keyval';
    import { filter, map, transform } from 'lodash';
        import RecycleBin from '../../lib/components/xp/RecycleBin.svelte';
    import { parse_dir } from '../../lib/dir_parser';
    import Previewable from '../../lib/components/xp/Previewable.svelte';
    

    let id = desktop_folder;
    
    $: items =  $hardDrive[id] == null ? 
        [] : 
        $hardDrive[id]
        .children
        .map(id => $hardDrive[id])
        .filter(el => el != null);

    let is_focus = true;
    let item_long_pressed = false;
    let node_ref;
    let cell_size = 80;

    export let renaming = false;

    // Drag state: shared between rubber-band select and icon repositioning
    let _drag_start = null; // {x, y, on_item, item_el, item_fs_id, item_tx, item_ty}
    let _drag_moved = false;
    let rb_visible = false;
    let rb_left = 0, rb_top = 0, rb_width = 0, rb_height = 0;

    function parse_translate(str) {
        if (!str) return {x: 0, y: 0};
        let m = str.match(/translate(?:3d)?\(([^,]+)px,\s*([^,)]+)px/);
        return m ? {x: parseFloat(m[1]), y: parseFloat(m[2])} : {x: 0, y: 0};
    }

    function on_mousedown(e) {
        if (e.button !== 0) return;
        _drag_moved = false;
        let item_el = e.target.closest('.fs-item');
        if (item_el) {
            let t = parse_translate(item_el.style.transform);
            _drag_start = {x: e.clientX, y: e.clientY, on_item: true, item_el, item_fs_id: item_el.getAttribute('fs-id'), item_tx: t.x, item_ty: t.y};
        } else {
            _drag_start = {x: e.clientX, y: e.clientY, on_item: false};
        }
    }

    function on_mousemove(e) {
        if (!_drag_start) return;
        let dx = e.clientX - _drag_start.x, dy = e.clientY - _drag_start.y;
        if (!_drag_moved && dx*dx + dy*dy < 25) return;
        _drag_moved = true;
        if (_drag_start.on_item) {
            _drag_start.item_el.style.transform = `translate(${_drag_start.item_tx + dx}px, ${_drag_start.item_ty + dy}px)`;
        } else {
            rb_visible = true;
            let cr = node_ref.getBoundingClientRect();
            let [sx, sy, cx, cy] = [_drag_start.x, _drag_start.y, e.clientX, e.clientY];
            let rbc = {left: Math.min(sx,cx), right: Math.max(sx,cx), top: Math.min(sy,cy), bottom: Math.max(sy,cy)};
            rb_left = rbc.left - cr.left; rb_top = rbc.top - cr.top;
            rb_width = rbc.right - rbc.left; rb_height = rbc.bottom - rbc.top;
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
    }

    function on_mouseup() {
        if (!_drag_start) return;
        if (_drag_start.on_item && _drag_moved) {
            let fid = _drag_start.item_fs_id;
            if ($hardDrive[fid] != null) $hardDrive[fid]['desktop_css_transform'] = _drag_start.item_el.style.transform;
        }
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
        originator.open = (id) => {open(id)};
        originator.rename = () => { rename()}

        contextMenu.set({x: ev.x, y: ev.y, type: 'FSItem', originator: originator});
    }

    

    function show_void_menu(ev){
        let originator= {id};
        contextMenu.set({x: ev.x, y: ev.y, type: 'Desktop', originator});
    }

    function clear_selection(){
        $selectingItems = [];
    }


    let _last_open = 0;
    function open(id){
        // debounce: double_tap and dblclick may both fire on mobile
        const now = Date.now();
        if (now - _last_open < 400) return;
        _last_open = now;

        is_focus = false;
        clear_selection();
        let fs_item = $hardDrive[id];
        if(fs_item.type == 'file'){
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
            queueProgram.set({
                    path: './programs/my_computer.svelte',
                    fs_item: fs_item
                })
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
        if(!is_focus) return;
        if(renaming) return;
        if(id == null) return;
        console.log('keyevent in desktop_folder');

        if(!(e.ctrlKey || e.metaKey)) return;
        if(e.key == 'c'){
            fs.copy();
        } else if(e.key == 'x'){
            fs.cut();
        } else if(e.key == 'v'){
            fs.paste(id);
        } else if(e.key == 'a'){
            $selectingItems = items.map(el => el.id);
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

</script>


<div class="absolute z-0 inset-0 overflow-hidden bg-transparent"
    on:drop={on_drop} on:dragover={on_drop_over}
    on:mousedown={on_mousedown}
    on:click={(e) => { is_focus = true; if (!e.target.closest('.fs-item') && !_drag_moved) { $selectingItems = []; } }}
    use:click_outside on:click_outside={() => {
        is_focus = false;
    }}
    on:contextmenu|self={show_void_menu}
    use:long_press on:long_press|self={(e) => { if (!item_long_pressed) show_void_menu({x: e.detail.x, y: e.detail.y}); }}
    bind:this={node_ref}>

    <div class="top-0 left-0 bottom-0 absolute flex flex-col flex-wrap" 
        class:hidden={id == null}>
        {#each items as item, index (item.id)}

            <div fs-id="{item.id}" class="relative fs-item w-[150px] flex-shrink-0 flex-grow-0 overflow-hidden m-2 inline-flex flex-col items-center font-MSSS"
                on:dblclick={() => open(item.id)} on:contextmenu={(e) => on_rightclick(e, item)}
                on:click={(e) => { if (_drag_moved) return; let fs_id = e.currentTarget.getAttribute('fs-id'); if (e.ctrlKey || e.metaKey) { $selectingItems = $selectingItems.includes(fs_id) ? $selectingItems.filter(id => id !== fs_id) : [...$selectingItems, fs_id]; } else { $selectingItems = [fs_id]; } }}
                use:long_press on:long_press={(e) => { item_long_pressed = true; setTimeout(() => item_long_pressed = false, 100); on_rightclick({x: e.detail.x, y: e.detail.y}, item); }}
                use:double_tap on:double_tap={() => open(item.id)}
                style:transform="{item.desktop_css_transform}"
                style:width="{cell_size}px"
                style:height="{cell_size}px"
                style:touch-action="manipulation">
                {#if previewable_exts.includes(item.ext)}
                    <Previewable size={40} default_icon={file_icon(item)} fs_id={item.id}></Previewable>
                {:else}
                    <div class="w-[40px] h-[40px] shrink-0 bg-contain bg-no-repeat bg-center
                        {$clipboard.includes(item.id) && $clipboard_op == 'cut' ? 'opacity-70' : ''}
                        {item.type == 'folder' ? 'bg-[url(/images/xp/icons/FolderClosed.png)]' : 'bg-[url(/images/xp/icons/Default.png)]'} "
                        style:background-image="{file_icon(item)}">
                    </div>
                {/if}
                <p class="px-1 mx-0.5 text-[11px] break-words line-clamp-2 text-ellipsis leading-tight text-center text-white
                    {$selectingItems?.includes(item.id) && is_focus ? 'bg-blue-600 text-slate-50' : ''}"
                    style="text-shadow: 1px 1px 2px black;">
                    {item.executable ? item.basename : item.name}
                </p>
                {#if $selectingItems.includes(item.id) && renaming}
                    <textarea
                        autofocus
                        on:keydown={e => e.key == 'Enter' && end_renaming(e, item)}
                        on:blur={(e) => end_renaming(e, item)}
                        class="absolute max-h-[40px] left-0 top-[40px] right-0 bottom-0 overflow-hidden 
                        outline-none border-1 border-slate-900 text-[11px] font-MSSS z-50 resize-none"
                    >{item.name}</textarea>
                {/if}
                
            </div>

        {/each}
        
    </div>

    <RecycleBin style="width: {cell_size}px;height: {cell_size}px;"></RecycleBin>

    {#if rb_visible}
        <div class="absolute pointer-events-none border border-blue-500 bg-blue-500/20"
            style:left="{rb_left}px" style:top="{rb_top}px" style:width="{rb_width}px" style:height="{rb_height}px">
        </div>
    {/if}

</div>

<svelte:options accessors={true}></svelte:options>
<svelte:window on:keydown={on_keydown} on:mousemove={on_mousemove} on:mouseup={on_mouseup}></svelte:window>