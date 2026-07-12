<script lang="ts">
    import { mount } from 'svelte';
    import { queueProgram } from '../../lib/store';
    import { my_pictures_id, my_music_id } from '../../lib/system';
    import * as utils from '../../lib/utils';
    import { required } from '../../lib/types';
    import type { MountedComponent, VfsItem } from '../../lib/types';
    const { click_outside } = utils;

    /** One start-menu entry; `null` renders as a separator. */
    interface StartMenuItem {
        name: string;
        icon: string;
        path?: string;
        font?: string;
        fs_item?: Partial<VfsItem>;
        /** CSS `top` offset of the level-2 flyout. */
        top?: string;
        link?: string;
        webapp?: unknown;
        items?: (StartMenuItem | null)[];
    }

    let col_1: (StartMenuItem | null)[] = [
        {
            name: 'Internet Explorer',
            icon: '/images/xp/icons/InternetExplorer6.png',
            path: './programs/internet_explorer.svelte',
            font: 'bold',
        },
        null,
        {
            name: 'Media Player Classic',
            icon: '/images/xp/icons/MPC.png',
            path: './programs/media_player_classic.svelte',
        },
        {
            name: 'Paint',
            icon: '/images/xp/icons/Paint.png',
            path: './programs/paint.svelte',
        },
    ];

    let col_2: (StartMenuItem | null)[] = [
        {
            name: 'My Pictures',
            icon: '/images/xp/icons/MyPictures.png',
            path: './programs/my_computer.svelte',
            fs_item: { id: my_pictures_id },
            font: 'bold',
        },
        {
            name: 'My Music',
            icon: '/images/xp/icons/MyMusic.png',
            path: './programs/my_computer.svelte',
            fs_item: { id: my_music_id },
            font: 'bold',
        },
        {
            name: 'My Computer',
            icon: '/images/xp/icons/MyComputer.png',
            path: './programs/my_computer.svelte',
            font: 'bold',
        },
        null,
        {
            name: 'Control Panel',
            icon: '/images/xp/icons/ControlPanel.png',
            path: './programs/my_computer.svelte',
        },
        {
            name: 'Display Properties',
            icon: '/images/xp/icons/DisplayProperties.png',
            path: './programs/display_properties.svelte',
        },
        null,
        {
            name: 'Search',
            icon: '/images/xp/icons/Search.png',
            path: '',
        },
        {
            name: 'Run...',
            icon: '/images/xp/icons/Run.png',
            path: '',
        },
    ];

    let programs: (StartMenuItem | null)[] = [
        {
            name: 'Display Properties',
            icon: '/images/xp/icons/DisplayProperties.png',
            path: './programs/display_properties.svelte',
        },
        {
            name: 'Windows Catalog',
            icon: '/images/xp/icons/WindowsCatalog.png',
            path: '',
        },
        {
            name: 'Windows Update',
            icon: '/images/xp/icons/WindowsUpdate.png',
            path: '',
        },
        null,
        {
            name: 'Accessories',
            icon: '/images/xp/icons/StartMenuPrograms.png',
            top: '-100px',
            items: [
                {
                    name: 'Accessibility',
                    icon: '/images/xp/icons/StartMenuPrograms.png',
                    items: [
                        {
                            name: 'Accessibility Wizard',
                            icon: '/images/xp/icons/AccessibilityWizard.png',
                            path: '',
                        },
                        {
                            name: 'Magnifier',
                            icon: '/images/xp/icons/Magnifier.png',
                            path: '',
                        },
                        {
                            name: 'Narrator',
                            icon: '/images/xp/icons/Narrator.png',
                            path: '',
                        },
                        {
                            name: 'On-Screen Keyboard',
                            icon: '/images/xp/icons/On-ScreenKeyboard.png',
                            path: '',
                        },
                        {
                            name: 'Utility Manager',
                            icon: '/images/xp/icons/BAT.png',
                            path: '',
                        },
                    ],
                },
                {
                    name: 'Communications',
                    icon: '/images/xp/icons/StartMenuPrograms.png',
                    items: [
                        {
                            name: 'Hyper Terminal',
                            icon: '/images/xp/icons/HyperTerminal.png',
                            path: '',
                        },
                        {
                            name: 'Network Connections',
                            icon: '/images/xp/icons/NetworkConnections.png',
                            path: '',
                        },
                        {
                            name: 'Network Setup Wizard',
                            icon: '/images/xp/icons/NetworkSetup.png',
                            path: '',
                        },
                        {
                            name: 'New Connection Wizard',
                            icon: '/images/xp/icons/NewNetworkConnection.png',
                            path: '',
                        },
                        {
                            name: 'Wireless Network Setup Wizard',
                            icon: '/images/xp/icons/WirelessNetworkSetup.png',
                            path: '',
                        },
                    ],
                },
                {
                    name: 'Entertainment',
                    icon: '/images/xp/icons/StartMenuPrograms.png',
                    items: [
                        {
                            name: 'Sound Recorder',
                            icon: '/images/xp/icons/Volume.png',
                            path: '',
                        },
                        {
                            name: 'Volume Control',
                            icon: '/images/xp/icons/VolumeLevel.png',
                            path: '',
                        },
                        {
                            name: 'Windows Media Player',
                            icon: '/images/xp/icons/WindowsMediaPlayer9.png',
                            path: '',
                        },
                    ],
                },
                {
                    name: 'System Tools',
                    icon: '/images/xp/icons/StartMenuPrograms.png',
                    items: [
                        {
                            name: 'Backup',
                            icon: '/images/xp/icons/BackupWizard.png',
                            path: '',
                        },
                        {
                            name: 'Character Map',
                            icon: '/images/xp/icons/Charmap.png',
                            path: '',
                        },
                        {
                            name: 'Disk Cleanup',
                            icon: '/images/xp/icons/DiskCleanup.png',
                            path: '',
                        },
                        {
                            name: 'Disk Defragmenter',
                            icon: '/images/xp/icons/DiskDefragmenter.png',
                            path: '',
                        },
                        {
                            name: 'Files and Settings Transfer Wizard',
                            icon: '/images/xp/icons/FileandSettingsTransferWizard.png',
                            path: '',
                        },
                        {
                            name: 'Scheduled Tasks',
                            icon: '/images/xp/icons/ScheduledTasks.png',
                            path: '',
                        },
                        {
                            name: 'Security Center',
                            icon: '/images/xp/icons/SecurityCenter.png',
                            path: '',
                        },
                        {
                            name: 'System Information',
                            icon: '/images/xp/icons/SystemInformation.png',
                            path: '',
                        },
                        {
                            name: 'System Restore',
                            icon: '/images/xp/icons/SystemRestore.png',
                            path: '',
                        },
                    ],
                },
                {
                    name: 'Address Book',
                    icon: '/images/xp/icons/AddressBook.png',
                    path: '',
                },
                {
                    name: 'Calculator',
                    icon: '/images/xp/icons/Calculator.png',
                    path: '',
                },
                {
                    name: 'Command Prompt',
                    icon: '/images/xp/icons/CommandPrompt.png',
                    path: '',
                },
                {
                    name: 'Notepad',
                    icon: '/images/xp/icons/Notepad.png',
                    path: '',
                },
                {
                    name: 'Paint',
                    icon: '/images/xp/icons/Paint.png',
                    path: '',
                },
                {
                    name: 'Program Compatibility Wizard',
                    icon: '/images/xp/icons/HelpandSupport.png',
                    path: '',
                },
                {
                    name: 'Remote Desktop Connection',
                    icon: '/images/xp/icons/RemoteDesktop.png',
                    path: '',
                },
                {
                    name: 'Synchronize',
                    icon: '/images/xp/icons/Synchronize.png',
                    path: '',
                },
                {
                    name: 'Tour Windows Xp',
                    icon: '/images/xp/icons/TourXP.png',
                    path: '',
                },
                {
                    name: 'Windows Explorer',
                    icon: '/images/xp/icons/Explorer.png',
                    path: '',
                },
                {
                    name: 'Wordpad',
                    icon: '/images/xp/icons/Wordpad.png',
                    path: '',
                },
            ],
        },
        {
            name: 'Startup',
            icon: '/images/xp/icons/StartMenuPrograms.png',
            items: [],
        },
        {
            name: 'Internet Explorer',
            icon: '/images/xp/icons/InternetExplorer6.png',
            path: './programs/internet_explorer.svelte',
            font: 'bold',
        },
        null,
        {
            name: 'Media Player Classic',
            icon: '/images/xp/icons/MPC.png',
            path: './programs/media_player_classic.svelte',
        },
        {
            name: 'Paint',
            icon: '/images/xp/icons/Paint.png',
            path: './programs/paint.svelte',
        },
    ];

    let programs_open = false;
    let ap_open = false; // All Programs desktop flyout visible
    let open_l2: string | null = null; // name of open level-2 item (e.g. "Accessories")
    let open_l3: string | null = null; // name of open level-3 item (e.g. "System Tools")
    let l2_timer: ReturnType<typeof setTimeout> | undefined;
    let l3_timer: ReturnType<typeof setTimeout> | undefined;

    function hide() {
        let el = required(
            document.querySelector('#start-menu'),
            'start menu element',
        );
        if (!el.classList.contains('hidden')) {
            el.classList.add('hidden');
        }
        programs_open = false;
        ap_open = false;
        open_l2 = null;
        open_l3 = null;
        clearTimeout(l2_timer);
        clearTimeout(l3_timer);
    }

    function launch(item: StartMenuItem) {
        console.log(item);
        let { path, fs_item, webapp, link } = item;
        if (link) {
            open_link(link);
        } else if (path) {
            queueProgram.set({
                path,
                fs_item,
                webapp,
            });
        }
        hide();
    }

    function open_link(link: string) {
        queueProgram.set({
            path: './programs/internet_explorer.svelte',
            fs_item: { url: link },
        });
    }

    async function show_shutdown_panel() {
        const ShutDownPanel = (await import('./shutdown_panel.svelte')).default;
        const panel: MountedComponent = mount(ShutDownPanel, {
            target: required(
                document.querySelector('#desktop'),
                'desktop element',
            ),
            props: { get_self: () => panel },
        });
        hide();
    }
</script>

<div
    id="start-menu"
    class="absolute left-0 w-[390px] max-w-full z-20 flex flex-col shadow-lg rounded-t-md hidden"
    style="bottom: 100%; background-color: rgb(66, 130, 214);"
    use:click_outside
    on:click_outside={hide}
>
    <div
        class="h-[3px] absolute top-0 left-[3px] right-[3px]"
        style="background: linear-gradient(to right, transparent 0px, rgba(255, 255, 255, 0.3) 1%, rgba(255, 255, 255, 0.5) 2%, rgba(255, 255, 255, 0.5) 95%, rgba(255, 255, 255, 0.3) 98%, rgba(255, 255, 255, 0.2) 99%, transparent 100%);
    box-shadow: rgb(14 96 203) 0px -1px 1px inset;"
    ></div>

    <div
        class="w-full h-[70px] rounded-t-md shrink-0"
        style:background-image="linear-gradient(rgb(24, 104, 206) 0%, rgb(14, 96, 203) 12%, rgb(14, 96, 203) 20%, rgb(17, 100, 207) 32%, rgb(22, 103, 207) 33%, rgb(27, 108, 211) 47%, rgb(30, 112, 217) 54%, rgb(36, 118, 220) 60%, rgb(41, 122, 224) 65%, rgb(52, 130, 227) 77%, rgb(55, 134, 229) 79%, rgb(66, 142, 233) 90%, rgb(71, 145, 235) 100%)"
    ></div>

    <div
        class="shrink-0 h-[2px] w-full"
        style:background-image="linear-gradient(to right, rgba(0, 0, 0, 0) 0%, rgb(218, 136, 74) 50%, rgba(0, 0, 0, 0) 100%)"
    ></div>

    <div class="bg-slate-50 mx-0.5 relative flex flex-row">
        <!-- ── Mobile: All Programs full-panel accordion overlay ── -->
        {#if programs_open}
            <div
                class="absolute inset-0 z-30 bg-slate-50 flex flex-col sm:hidden"
            >
                <div
                    class="flex items-center px-3 py-2 border-b-2 border-blue-300 bg-[#c5d9f1] shrink-0"
                >
                    <div
                        class="flex items-center cursor-pointer mr-3"
                        on:click|stopPropagation={() => {
                            programs_open = false;
                            open_l2 = null;
                            open_l3 = null;
                        }}
                    >
                        <svg
                            class="w-3 h-3 fill-blue-800 mr-1"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 256 512"
                        >
                            <path
                                d="M9.4 278.6c-12.5-12.5-12.5-32.8 0-45.3l128-128c9.2-9.2 22.9-11.9 34.9-6.9s19.8 16.6 19.8 29.6l0 256c0 12.9-7.8 24.6-19.8 29.6s-25.7 2.2-34.9-6.9l-128-128z"
                            />
                        </svg>
                        <span class="text-[11px] font-bold text-blue-800"
                            >Back</span
                        >
                    </div>
                    <span class="text-[11px] font-bold text-slate-700"
                        >All Programs</span
                    >
                </div>
                <div class="overflow-y-auto flex-1">
                    {#each programs as item}
                        {#if item == null}
                            <div
                                class="h-px bg-slate-200 mx-2 my-0.5 shrink-0"
                            ></div>
                        {:else}
                            <div>
                                <div
                                    class="flex items-center px-3 py-2.5 group/mp hover:bg-blue-500 cursor-pointer border-b border-slate-100"
                                    on:click|stopPropagation={() => {
                                        if (item.items) {
                                            open_l2 =
                                                open_l2 === item.name
                                                    ? null
                                                    : item.name;
                                            open_l3 = null;
                                        } else {
                                            launch(item);
                                        }
                                    }}
                                >
                                    <div
                                        class="w-5 h-5 bg-contain mr-2.5 shrink-0"
                                        style:background-image="url({item.icon})"
                                    ></div>
                                    <div
                                        class="text-[12px] text-slate-800 group-hover/mp:text-white grow"
                                    >
                                        {item.name}
                                    </div>
                                    {#if item.items}
                                        <svg
                                            class="w-3 h-3 shrink-0 fill-slate-400 group-hover/mp:fill-white transition-transform duration-150 {open_l2 ===
                                            item.name
                                                ? 'rotate-90'
                                                : ''}"
                                            xmlns="http://www.w3.org/2000/svg"
                                            viewBox="0 0 256 512"
                                        >
                                            <path
                                                d="M246.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-128-128c-9.2-9.2-22.9-11.9-34.9-6.9s-19.8 16.6-19.8 29.6l0 256c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9l128-128z"
                                            />
                                        </svg>
                                    {/if}
                                </div>
                                {#if item.items && open_l2 === item.name}
                                    <div class="bg-[#eef3fb]">
                                        {#each item.items as subitem}
                                            {#if subitem == null}
                                                <div
                                                    class="h-px bg-slate-200 mx-2 my-0.5"
                                                ></div>
                                            {:else}
                                                <div>
                                                    <div
                                                        class="flex items-center pl-7 pr-3 py-2 group/mps hover:bg-blue-500 cursor-pointer border-b border-[#dde8f8]"
                                                        on:click|stopPropagation={() => {
                                                            if (subitem.items) {
                                                                open_l3 =
                                                                    open_l3 ===
                                                                    subitem.name
                                                                        ? null
                                                                        : subitem.name;
                                                            } else {
                                                                launch(subitem);
                                                            }
                                                        }}
                                                    >
                                                        <div
                                                            class="w-4 h-4 bg-contain mr-2 shrink-0"
                                                            style:background-image="url({subitem.icon})"
                                                        ></div>
                                                        <div
                                                            class="text-[11px] text-slate-700 group-hover/mps:text-white grow"
                                                        >
                                                            {subitem.name}
                                                        </div>
                                                        {#if subitem.items}
                                                            <svg
                                                                class="w-3 h-3 shrink-0 fill-slate-400 group-hover/mps:fill-white transition-transform duration-150 {open_l3 ===
                                                                subitem.name
                                                                    ? 'rotate-90'
                                                                    : ''}"
                                                                xmlns="http://www.w3.org/2000/svg"
                                                                viewBox="0 0 256 512"
                                                            >
                                                                <path
                                                                    d="M246.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-128-128c-9.2-9.2-22.9-11.9-34.9-6.9s-19.8 16.6-19.8 29.6l0 256c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9l128-128z"
                                                                />
                                                            </svg>
                                                        {/if}
                                                    </div>
                                                    {#if subitem.items && open_l3 === subitem.name}
                                                        <div
                                                            class="bg-[#dce8f8]"
                                                        >
                                                            {#each subitem.items.filter((el) => el != null) as subsubitem}
                                                                <div
                                                                    class="flex items-center pl-11 pr-3 py-2 group/mpss hover:bg-blue-500 cursor-pointer border-b border-[#cdd9ec]"
                                                                    on:click|stopPropagation={() =>
                                                                        launch(
                                                                            subsubitem,
                                                                        )}
                                                                >
                                                                    <div
                                                                        class="w-4 h-4 bg-contain mr-2 shrink-0"
                                                                        style:background-image="url({subsubitem.icon})"
                                                                    ></div>
                                                                    <div
                                                                        class="text-[11px] text-slate-700 group-hover/mpss:text-white grow"
                                                                    >
                                                                        {subsubitem.name}
                                                                    </div>
                                                                </div>
                                                            {/each}
                                                        </div>
                                                    {/if}
                                                </div>
                                            {/if}
                                        {/each}
                                    </div>
                                {/if}
                            </div>
                        {/if}
                    {/each}
                </div>
            </div>
        {/if}

        <!-- ── Left column ── -->
        <div class="w-1/2 flex flex-col shrink-0 px-1">
            {#each col_1 as item}
                {#if item == null}
                    <div
                        class="my-0.5 mx-auto w-5/6 h-[2px] bg-slate-200 shrink-0"
                    ></div>
                {:else}
                    <div
                        class="flex flex-row items-center shrink-0 p-1 group/c1 hover:bg-blue-500"
                        on:mouseenter={() => {
                            ap_open = false;
                            open_l2 = null;
                            open_l3 = null;
                        }}
                        on:click={() => launch(item)}
                    >
                        <div
                            class="w-8 h-8 bg-contain mr-1"
                            style:background-image="url({item.icon})"
                        ></div>
                        <div
                            class="text-[11px] group-hover/c1:text-white text-black {item.font ==
                            'bold'
                                ? 'font-bold'
                                : ''}"
                        >
                            {item.name}
                        </div>
                    </div>
                {/if}
            {/each}
            <div
                class="my-0.5 mx-auto w-5/6 h-[2px] bg-slate-200 shrink-0"
            ></div>
            <!-- All Programs button + desktop hover flyout -->
            <!-- All Programs button + desktop JS-state flyout -->
            <div class="relative shrink-0">
                <div
                    class="flex pl-9 py-2 items-center flex-row cursor-pointer hover:bg-blue-500 group/ap-btn"
                    class:bg-blue-500={ap_open}
                    on:mouseenter={() => (ap_open = true)}
                    on:click|stopPropagation={() => {
                        programs_open = !programs_open;
                        open_l2 = null;
                        open_l3 = null;
                    }}
                >
                    <div
                        class="font-bold text-[11px] group-hover/ap-btn:text-white"
                        class:text-white={ap_open}
                        class:text-black={!ap_open}
                    >
                        All Programs
                    </div>
                    <div
                        class="w-4 h-4 ml-1 bg-contain bg-[url(/images/xp/icons/876.png)]"
                    ></div>
                </div>

                <!-- Desktop flyout: JS state, hidden on mobile -->
                {#if ap_open}
                    <div
                        class="hidden sm:block absolute z-10 bottom-0 left-[90%] w-[250px] shadow-xl border-t border-l-4 border-blue-500 bg-slate-50"
                    >
                        {#each programs as item}
                            {#if item == null}
                                <div
                                    class="my-0.5 mx-auto w-5/6 h-[1px] bg-slate-200 shrink-0"
                                ></div>
                            {:else}
                                <!-- Delay before changing open_l2 so diagonal mouse movement to L2 panel doesn't flicker -->
                                <div
                                    class="flex flex-row items-center grow p-1 group/l1 relative cursor-pointer hover:bg-blue-500"
                                    class:bg-blue-500={open_l2 === item.name}
                                    on:mouseenter={() => {
                                        clearTimeout(l2_timer);
                                        l2_timer = setTimeout(() => {
                                            open_l2 = item.items
                                                ? item.name
                                                : null;
                                            open_l3 = null;
                                        }, 180);
                                    }}
                                    on:click={() => {
                                        if (!item.items) launch(item);
                                    }}
                                >
                                    <div
                                        class="w-5 h-5 bg-contain mr-1 shrink-0"
                                        style:background-image="url({item.icon})"
                                    ></div>
                                    <div
                                        class="text-[11px] grow text-slate-800 group-hover/l1:text-white"
                                        class:text-white={open_l2 === item.name}
                                    >
                                        {item.name}
                                    </div>
                                    <div class="w-[10px] shrink-0">
                                        {#if item.items != null}
                                            <svg
                                                class="w-[10px] h-[10px] fill-slate-900 group-hover/l1:fill-white"
                                                class:fill-white={open_l2 ===
                                                    item.name}
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 256 512"
                                                ><path
                                                    d="M246.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-128-128c-9.2-9.2-22.9-11.9-34.9-6.9s-19.8 16.6-19.8 29.6l0 256c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9l128-128z"
                                                /></svg
                                            >
                                        {/if}
                                    </div>
                                    {#if item.items != null && open_l2 === item.name}
                                        <!-- Level-2: stays open until another L1 item is entered -->
                                        <div
                                            class="absolute z-20 left-full w-[200px] shadow-xl border-t border-b border-l-4 border-blue-500 bg-slate-50"
                                            style:top={item.top ?? '0'}
                                        >
                                            {#if item.items.length == 0}
                                                <div
                                                    class="h-6 text-slate-400 text-[11px] w-full px-4 flex items-center"
                                                >
                                                    (Empty)
                                                </div>
                                            {/if}
                                            {#each item.items as subitem}
                                                {#if subitem == null}
                                                    <div
                                                        class="my-0.5 mx-auto w-5/6 h-[1px] bg-slate-200 shrink-0"
                                                    ></div>
                                                {:else}
                                                    <div
                                                        class="flex flex-row items-center grow p-1 group/l2 relative cursor-pointer hover:bg-blue-500"
                                                        class:bg-blue-500={open_l3 ===
                                                            subitem.name}
                                                        on:mouseenter={() => {
                                                            clearTimeout(
                                                                l3_timer,
                                                            );
                                                            l3_timer =
                                                                setTimeout(
                                                                    () => {
                                                                        open_l3 =
                                                                            subitem.items
                                                                                ? subitem.name
                                                                                : null;
                                                                    },
                                                                    180,
                                                                );
                                                        }}
                                                        on:click={() => {
                                                            if (!subitem.items)
                                                                launch(subitem);
                                                        }}
                                                    >
                                                        <div
                                                            class="w-5 h-5 bg-contain mr-1 shrink-0"
                                                            style:background-image="url({subitem.icon})"
                                                        ></div>
                                                        <div
                                                            class="text-[11px] grow text-slate-800 group-hover/l2:text-white"
                                                            class:text-white={open_l3 ===
                                                                subitem.name}
                                                        >
                                                            {subitem.name}
                                                        </div>
                                                        <div
                                                            class="w-[10px] shrink-0"
                                                        >
                                                            {#if subitem.items != null}
                                                                <svg
                                                                    class="w-[10px] h-[10px] fill-slate-900 group-hover/l2:fill-white"
                                                                    class:fill-white={open_l3 ===
                                                                        subitem.name}
                                                                    xmlns="http://www.w3.org/2000/svg"
                                                                    viewBox="0 0 256 512"
                                                                    ><path
                                                                        d="M246.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-128-128c-9.2-9.2-22.9-11.9-34.9-6.9s-19.8 16.6-19.8 29.6l0 256c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9l128-128z"
                                                                    /></svg
                                                                >
                                                            {/if}
                                                        </div>
                                                        {#if subitem.items != null && open_l3 === subitem.name}
                                                            <!-- Level-3 -->
                                                            <div
                                                                class="absolute z-30 top-0 left-full w-[220px] shadow-xl border-t border-b border-l-4 border-blue-500 bg-slate-50"
                                                            >
                                                                {#each subitem.items as subsubitem}
                                                                    {#if subsubitem == null}
                                                                        <div
                                                                            class="my-0.5 mx-auto w-5/6 h-[1px] bg-slate-200 shrink-0"
                                                                        ></div>
                                                                    {:else}
                                                                        <div
                                                                            class="flex flex-row items-center grow p-1 group/l3 hover:bg-blue-500 cursor-pointer"
                                                                            on:click={() =>
                                                                                launch(
                                                                                    subsubitem,
                                                                                )}
                                                                        >
                                                                            <div
                                                                                class="w-5 h-5 bg-contain mr-1 shrink-0"
                                                                                style:background-image="url({subsubitem.icon})"
                                                                            ></div>
                                                                            <div
                                                                                class="text-[11px] text-slate-800 group-hover/l3:text-white grow"
                                                                            >
                                                                                {subsubitem.name}
                                                                            </div>
                                                                        </div>
                                                                    {/if}
                                                                {/each}
                                                            </div>
                                                        {/if}
                                                    </div>
                                                {/if}
                                            {/each}
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        {/each}
                    </div>
                {/if}
            </div>
        </div>

        <!-- ── Right column ── -->
        <div class="w-1/2 flex flex-col shrink-0 px-1 bg-blue-200">
            {#each col_2 as item}
                {#if item == null}
                    <div
                        class="my-0.5 mx-auto w-5/6 h-[1px] bg-blue-100 shrink-0"
                    ></div>
                {:else}
                    <div
                        class="flex flex-row items-center shrink-0 p-1 group/c2 hover:bg-blue-500"
                        on:click={() => launch(item)}
                    >
                        <div
                            class="w-7 h-7 bg-contain mr-1"
                            style:background-image="url({item.icon})"
                        ></div>
                        <div
                            class="text-[11px] group-hover/c2:text-white text-slate-800 {item.font ==
                            'bold'
                                ? 'font-bold'
                                : ''}"
                        >
                            {item.name}
                        </div>
                    </div>
                {/if}
            {/each}
        </div>
    </div>

    <div
        class="w-full h-[40px] shrink-0 flex items-center justify-end px-2"
        style:background-image="linear-gradient(rgb(66, 130, 214) 0%, rgb(59, 133, 224) 3%, rgb(65, 138, 227) 5%, rgb(65, 138, 227) 17%, rgb(60, 135, 226) 21%, rgb(55, 134, 228) 26%, rgb(52, 130, 227) 29%, rgb(46, 126, 225) 39%, rgb(35, 116, 223) 49%, rgb(32, 114, 219) 57%, rgb(25, 110, 219) 62%, rgb(23, 107, 216) 72%, rgb(20, 104, 213) 75%, rgb(17, 101, 210) 83%, rgb(15, 97, 203) 88%)"
    >
        <div
            class="p-1 rounded-sm hover:brightness-110 flex flex-row items-center"
            on:click={show_shutdown_panel}
        >
            <div
                class="w-6 h-6 bg-[url(/images/xp/icons/Logout.png)] bg-contain"
            ></div>
            <span class="text-slate-50 text-[11px] ml-1">Log Off</span>
        </div>
        <div
            class="p-1 ml-2 rounded-sm hover:brightness-110 flex flex-row items-center"
            on:click={show_shutdown_panel}
        >
            <div
                class="w-6 h-6 bg-[url(/images/xp/icons/Power.png)] bg-contain"
            ></div>
            <span class="text-slate-50 text-[11px] ml-1">Turn Off Computer</span
            >
        </div>
    </div>
</div>
