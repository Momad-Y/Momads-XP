<script lang="ts">
    import * as utils from '../../lib/utils';
    import { onMount, createEventDispatcher } from 'svelte';
    import { set, get } from 'idb-keyval';
    import axios from 'axios';
    import { hardDrive, wallpaper, contextMenu } from '../../lib/store';
    import { bliss_wallpaper, SortOptions, SortOrders } from '../../lib/system';
    import { required } from '../../lib/types';
    import { SEED_VERSION, shouldReseed } from '../../lib/seed';
    import type {
        ContextMenuRequest,
        LoadPageEvent,
        VfsItem,
    } from '../../lib/types';
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- legacy component-event dispatcher kept as-is; migrating to callback props is a behavior change outside the type-only conversion
    const dispatcher = createEventDispatcher<{ load_page: LoadPageEvent }>();

    /**
     * The persisted hard drive as it may exist in IndexedDB from older
     * versions: items can still carry the legacy `files` / `folders` split
     * that `migrate_files_format` folds into `children`.
     */
    type StoredHardDrive = Record<
        string,
        VfsItem & { files?: string[]; folders?: string[] }
    >;

    let assets_loaded = false;

    const images = [
        '/images/ms.png',
        '/images/radio_check.png',
        '/images/xp_loading_logo.jpg',
        '/images/xp_logo.png',
        '/images/xp_logo_horizontal.png',
        '/images/wallpapers/Ascent.jpg',
        '/images/wallpapers/Autumn.jpg',
        '/images/wallpapers/Azul.jpg',
        '/images/wallpapers/Bliss.jpg',
        '/images/wallpapers/Follow.jpg',
        '/images/wallpapers/Friend.jpg',
        '/images/wallpapers/Moonflower.jpg',
        '/images/wallpapers/Radiance.jpg',
        '/images/wallpapers/Redmoondesert.jpg',
        '/images/wallpapers/Tulips.jpg',
        '/images/wallpapers/Wind.jpg',
        '/images/xp/battery_cell.png',
        '/images/xp/checkmark.png',
        '/images/xp/copying.gif',
        '/images/xp/crt_monitor.png',
        '/images/xp/radio_check.png',
        '/images/xp/start_btn_normal.png',
        '/images/xp/icons/876.png',
        '/images/xp/icons/ApplicationWindow.png',
        '/images/xp/icons/Back.png',
        '/images/xp/icons/CommandPrompt.png',
        '/images/xp/icons/ControlPanel.png',
        '/images/xp/icons/Default.png',
        '/images/xp/icons/Desktop.png',
        '/images/xp/icons/Email.png',
        '/images/xp/icons/Exit.png',
        '/images/xp/icons/Favorites.png',
        '/images/xp/icons/FolderClosed.png',
        '/images/xp/icons/FolderView-Classic.png',
        '/images/xp/icons/FolderView.png',
        '/images/xp/icons/Forward.png',
        '/images/xp/icons/Go.png',
        '/images/xp/icons/IEHistory.png',
        '/images/xp/icons/IEHome.png',
        '/images/xp/icons/IERefresh.png',
        '/images/xp/icons/IEStop.png',
        '/images/xp/icons/InternetExplorer6.png',
        '/images/xp/icons/InternetShortcut.png',
        '/images/xp/icons/JPG.png',
        '/images/xp/icons/LocalDisk.png',
        '/images/xp/icons/MPC.png',
        '/images/xp/icons/Maximize.png',
        '/images/xp/icons/Minimize.png',
        '/images/xp/icons/Mute.png',
        '/images/xp/icons/MyComputer.png',
        '/images/xp/icons/MyMusic.png',
        '/images/xp/icons/MyNetworkPlaces.png',
        '/images/xp/icons/MyPictures.png',
        '/images/xp/icons/NewFolder.png',
        '/images/xp/icons/Paint.png',
        '/images/xp/icons/Power.png',
        '/images/xp/icons/Programs.png',
        '/images/xp/icons/Publishtoweb.png',
        '/images/xp/icons/RAR.png',
        '/images/xp/icons/RecycleBinempty.png',
        '/images/xp/icons/RecycleBinfull.png',
        '/images/xp/icons/RemovableMedia.png',
        '/images/xp/icons/Restart.png',
        '/images/xp/icons/Restore.png',
        '/images/xp/icons/Search.png',
        '/images/xp/icons/SecurityError.png',
        '/images/xp/icons/SharedFolder.png',
        '/images/xp/icons/Standby.png',
        '/images/xp/icons/StartMenuPrograms.png',
        '/images/xp/icons/StartMenuProgramsAlt.png',
        '/images/xp/icons/Stop.png',
        '/images/xp/icons/URL.png',
        '/images/xp/icons/Up.png',
        '/images/xp/icons/Volume.png',
        '/images/xp/icons/WindowsPictureandFaxViewer.png',
        '/images/xp/icons/explorerproperties.png',
    ];

    const audios = ['/audio/xp_shutdown.mp3', '/audio/xp_startup.mp3'];

    const fonts = [
        '/fonts/levi.ttf',
        '/fonts/ms_sans_serif.ttf',
        '/fonts/ms_sans_serif_bold.ttf',
        '/fonts/trebuchet.ttf',
    ];

    const empties = ['/empty/empty.png'];

    let core_ready = false; // hardDrive + wallpaper seeded — the desktop cannot mount without them
    let booted = false;

    onMount(async () => {
        await load_hard_drive();
        await load_wallpaper();
        core_ready = true;

        load_assets([...audios, ...images, ...fonts, ...empties], () => {
            assets_loaded = true;
        });

        // wait at least 3s (aesthetic), then up to 7s more for assets
        await utils.sleep(3000);
        let waited = 3000;
        while (!assets_loaded && waited < 10000) {
            await utils.sleep(500);
            waited += 500;
        }

        finish_boot();
    });

    /**
     * §2.1: click anywhere or press any key to skip. Asset fetches already
     * fired and keep loading in the background; the VFS seed is the one hard
     * dependency, so skipping is ignored until it has landed.
     */
    function skip_boot() {
        if (!core_ready) return;
        finish_boot();
    }

    function finish_boot() {
        if (booted) return;
        booted = true;
        preload_iframes();
        preload_context_menus();
        dispatcher('load_page', { url: './xp/login.svelte' });
    }

    // local copy of app.html's global — this module must not race the inline <script>
    // that defines window.load_assets (the CDN script above it can stall parsing)
    function load_assets(assets: string[], completion: () => void) {
        void Promise.allSettled(
            assets.map((asset) =>
                fetch(asset)
                    .then((res) => res.blob())
                    .catch(() => null),
            ),
        ).then(completion);
    }

    async function load_hard_drive() {
        const cached = await get<StoredHardDrive>('hard_drive');
        const stored_version = await get<string>('hard_drive_seed_version');
        let hard_drive = cached;
        if (cached == null || shouldReseed(stored_version)) {
            try {
                hard_drive = (
                    await axios.get<StoredHardDrive>('/json/hard_drive.json')
                ).data;
                await set('hard_drive', hard_drive);
                await set('hard_drive_seed_version', SEED_VERSION);
            } catch (error) {
                // Re-seed fetch failed (offline / flaky network). A returning
                // visitor has a perfectly usable cached drive — boot from it
                // instead of bricking on a black screen; retry next boot.
                // A first-time visitor has no fallback: rethrow.
                if (cached == null) throw error;
                console.error(
                    'VFS re-seed fetch failed; booting from cached drive',
                    error,
                );
                hard_drive = cached;
            }
        }
        if (hard_drive == null) throw new Error('VFS seed unavailable');
        migrate_files_format(hard_drive);
        hardDrive.set(hard_drive);
    }

    function migrate_files_format(drive: StoredHardDrive) {
        const now = new Date().getTime();
        for (const key of Object.keys(drive)) {
            const obj = required(drive[key], 'fs item ' + key);
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- persisted pre-migration data may genuinely miss this field despite the type
            if (obj.children == null) {
                obj.children = [
                    ...required(obj.files, 'legacy files of ' + key),
                    ...required(obj.folders, 'legacy folders of ' + key),
                ];
                delete obj.files;
                delete obj.folders;
            }
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- persisted pre-migration data may genuinely miss this field despite the type
            if (obj.date_created == null) {
                obj.date_created = now;
            }
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- persisted pre-migration data may genuinely miss this field despite the type
            if (obj.date_modified == null) {
                obj.date_modified = now;
            }
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- persisted pre-migration data may genuinely miss this field despite the type
            if (obj.sort_option == null) {
                obj.sort_option = SortOptions.NONE;
            }
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- persisted pre-migration data may genuinely miss this field despite the type
            if (obj.sort_order == null) {
                obj.sort_order = SortOrders.ASCENDING;
            }
        }
    }

    async function load_wallpaper() {
        $wallpaper = (await get<string>('wallpaper')) ?? null;
        if ($wallpaper == null) {
            $wallpaper = bliss_wallpaper;
            await set('wallpaper', bliss_wallpaper);
        }
    }

    function preload_iframes() {
        const urls = ['/html/jspaint/index.html'];
        const parent = required(
            document.querySelector('#iframe-preload'),
            'iframe preload element',
        );
        for (const url of urls) {
            const iframe = document.createElement('iframe');
            iframe.style.position = 'absolute';
            iframe.style.inset = '0';
            iframe.src = url;
            iframe.onload = () => {
                console.log('loaded ', url);
                iframe.remove();
            };
            parent.appendChild(iframe);
        }
    }

    function preload_context_menus() {
        // dummy requests: the goal is just to warm the dynamic imports of the
        // context-menu factories (the built menus are discarded right after)
        const dummy_item: VfsItem = {
            id: '',
            type: 'file',
            name: '',
            basename: '',
            ext: '',
            children: [],
            date_created: 0,
            date_modified: 0,
            sort_option: SortOptions.NONE,
            sort_order: SortOrders.ASCENDING,
        };
        const requests: ContextMenuRequest[] = [
            {
                x: -1000,
                y: -1000,
                type: 'ProgramTile',
                originator: { window: undefined, options: {} },
            },
            { x: -1000, y: -1000, type: 'Desktop', originator: { id: '' } },
            { x: -1000, y: -1000, type: 'FSVoid', originator: { id: '' } },
            {
                x: -1000,
                y: -1000,
                type: 'FSItem',
                originator: {
                    item: dummy_item,
                    open: () => undefined,
                    rename: () => undefined,
                },
            },
            { x: -1000, y: -1000, type: 'RecycleBin', originator: null },
        ];
        for (const request of requests) {
            contextMenu.set(request);
        }
        contextMenu.set(null);
    }
</script>

<div class="absolute inset-0 bg-black overflow-hidden text-slate-100">
    <div
        class="absolute top-[50%] -translate-y-[50%] left-[50%] -translate-x-[50%] animate-fadein flex flex-col items-center"
    >
        <img src="/assets/images/xp-logo.png" alt="" width="360px" />
        <div class="xp-loader">
            <div></div>
            <div></div>
            <div></div>
        </div>
    </div>

    <div
        class="absolute left-4 right-4 bottom-6 animate-fadein flex flex-row items-end justify-between gap-2"
    >
        <p class="text-sm sm:text-base font-sans shrink-0">
            For the best experience, Enter Full Screen (F11)
        </p>
        <p class="text-sm sm:text-base font-sans shrink-0">Portfolio</p>
    </div>
</div>

<svelte:window on:click={skip_boot} on:keydown={skip_boot} />

<style>
    .xp-loader {
        width: 150px;
        height: 20px;
        border: 2px solid #b2b2b2;
        border-radius: 7px;
        margin: 0 auto;
        margin-top: 90px;
        padding: 2px 1px;
        overflow: hidden;
        font-size: 0;
    }
    .xp-loader div {
        width: 9px;
        height: 100%;
        background: linear-gradient(
            to bottom,
            #2838c7 0%,
            #5979ef 17%,
            #869ef3 32%,
            #869ef3 45%,
            #5979ef 59%,
            #2838c7 100%
        );
        display: inline-block;
        margin-right: 2px;
        animation: loader 2s infinite;
        animation-timing-function: linear;
    }

    @keyframes loader {
        0% {
            transform: translate(-30px);
        }
        100% {
            transform: translate(150px);
        }
    }
</style>
