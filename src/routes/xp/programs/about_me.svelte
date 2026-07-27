<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import RButton from '../../../lib/components/xp/RButton.svelte';
    import Menu from '../../../lib/components/xp/Menu.svelte';
    import Dialog from '../../../lib/components/xp/Dialog.svelte';
    import { mount, unmount } from 'svelte';
    import { queueProgram, runningPrograms } from '../../../lib/store';
    import { profile } from '../../../lib/profile';
    import { PROJECTS_FOLDER_ID } from '../../../lib/generated/vfs_ids';
    import { required } from '../../../lib/types';
    import type {
        MenuBarEntry,
        MountedComponent,
        ProgramInstance,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    export let id: string;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;
    export let exec_path: string | undefined = undefined;

    const sidebar = [
        {
            name: 'Social Links',
            links: profile.social.map((s) => ({
                label: s.platform,
                url: s.url,
            })),
            lines: [] as string[],
        },
        {
            name: 'Skills',
            links: [] as { label: string; url: string }[],
            lines: Object.keys(profile.skills),
        },
        {
            name: 'Languages',
            links: [] as { label: string; url: string }[],
            lines: profile.languages.map((l) => `${l.language} — ${l.level}`),
        },
    ];

    const collapsed: Record<string, boolean> = {};

    function open_projects() {
        queueProgram.set({
            path: './programs/my_computer.svelte',
            fs_item: { id: PROJECTS_FOLDER_ID },
        });
    }

    function open_resume() {
        queueProgram.set({ path: './programs/pdf_viewer.svelte' });
    }

    function show_about_dialog() {
        const target = required(
            document.querySelector('#desktop'),
            'desktop element',
        );
        const dialog: MountedComponent = mount(Dialog, {
            target,
            props: {
                title: 'About Momad',
                message: `${profile.meta.name} — ${profile.meta.title}, ${profile.meta.location}. Built into Momad's XP. Very Professional.`,
                icon: '/assets/icons/about-me.png',
                get_self: () => dialog,
                buttons: [
                    {
                        name: 'OK',
                        focus: true,
                        action: () => {
                            void unmount(dialog);
                        },
                    },
                ],
            },
        });
    }

    const menu: MenuBarEntry[] = [
        {
            name: 'File',
            items: [
                [
                    {
                        name: 'Close',
                        action: () => {
                            destroy();
                        },
                    },
                ],
            ],
        },
        {
            name: 'View',
            items: [
                [
                    { name: 'My Projects', action: open_projects },
                    { name: 'My Resume', action: open_resume },
                ],
            ],
        },
        {
            name: 'Help',
            items: [[{ name: 'About Momad', action: show_about_dialog }]],
        },
    ];

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'about_me instance'));
    }

    export let options: WindowOptions = {
        title: 'About Me',
        icon: '/assets/icons/about-me.png',
        id,
        exec_path,
        width: 700,
        height: 540,
        min_width: 520,
        min_height: 380,
    };
</script>

<!-- eslint-disable svelte/no-useless-mustaches -- long style:background values get line-wrapped by prettier as plain strings, and svelte2tsx cannot parse multi-line style: text (same as my_computer/sidebar.svelte) -->
<Window {options} bind:this={window} on_click_close={destroy}>
    <div
        slot="content"
        class="absolute inset-0 flex flex-col bg-xp-yellow font-Tahoma"
    >
        <!-- menu bar: relative+z so the dropdowns paint above the toolbar
             (Menu's own z-10 needs a positioned/flex context to matter) -->
        <div class="shrink-0 border-b border-stone-300 px-1 relative z-20">
            <Menu {menu} />
        </div>

        <!-- toolbar -->
        <div
            class="shrink-0 flex flex-row items-center gap-1 px-1 py-0.5 border-b border-stone-300"
        >
            <RButton
                title="Back"
                icon="/images/xp/icons/Back.png"
                disabled={true}
            />
            <RButton
                title="Forward"
                icon="/images/xp/icons/Forward.png"
                disabled={true}
            />
            <div class="w-px h-5 bg-stone-300 mx-1"></div>
            <RButton
                title="My Projects"
                icon="/images/xp/icons/FolderClosed.png"
                on_click={open_projects}
            />
            <RButton
                title="My Resume"
                icon="/assets/icons/my-cv.png"
                on_click={open_resume}
            />
        </div>

        <!-- address bar -->
        <div
            class="shrink-0 flex flex-row items-center border-b border-stone-300 text-[11px]"
        >
            <span class="px-2 text-slate-800">Address</span>
            <div class="grow h-[25px] relative bg-white">
                <div
                    class="w-[17px] h-[17px] absolute top-[4px] left-[4px] bg-contain"
                    style:background-image="url(/assets/icons/about-me.png)"
                ></div>
                <span class="absolute left-7 top-[5px] text-slate-900"
                    >About Me</span
                >
            </div>
            <div
                class="w-[30px] h-[20px] bg-[url(/images/xp/icons/Go.png)] bg-center bg-contain bg-no-repeat"
            ></div>
        </div>

        <!-- body -->
        <div class="grow flex flex-row overflow-hidden">
            <!-- sidebar -->
            <div
                class="w-[190px] shrink-0 overflow-auto p-2"
                style:background={'linear-gradient(rgb(137 155 253) 0%, rgb(84 104 212) 100%)'}
            >
                {#each sidebar as section (section.name)}
                    <div
                        class="w-full overflow-hidden flex flex-col mt-2 {collapsed[
                            section.name
                        ]
                            ? 'rounded'
                            : 'rounded-t'}"
                        style:background={'linear-gradient(rgb(246 246 246) 0%, rgb(210 216 252) 100%)'}
                    >
                        <div
                            class="grow-0 h-7 flex flex-row items-center justify-between bg-gradient-to-r from-blue-600 to-blue-700"
                            on:click={() =>
                                (collapsed[section.name] =
                                    !collapsed[section.name])}
                        >
                            <div
                                class="ml-3 leading-none text-slate-50 text-[12px] font-bold"
                            >
                                {section.name}
                            </div>
                        </div>
                        <div
                            class="overflow-hidden {collapsed[section.name]
                                ? 'h-0'
                                : 'p-2'}"
                        >
                            <!-- eslint-disable svelte/no-navigation-without-resolve -- external social URLs, not app routes -->
                            {#each section.links as link (link.label)}
                                <a
                                    href={link.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    class="block mt-1.5 ml-1 text-[12px] text-blue-600 leading-tight underline-offset-2 hover:underline"
                                    >{link.label}</a
                                >
                            {/each}
                            <!-- eslint-enable svelte/no-navigation-without-resolve -->
                            {#each section.lines as line (line)}
                                <p
                                    class="mt-1.5 ml-1 text-[12px] text-blue-600 leading-tight"
                                >
                                    {line}
                                </p>
                            {/each}
                        </div>
                    </div>
                {/each}
            </div>

            <!-- main pane -->
            <div
                class="grow overflow-y-auto p-6"
                style:background={'linear-gradient(rgb(124 140 219) 0%, rgb(99 117 214) 100%)'}
            >
                <div class="flex flex-row items-start gap-4">
                    <img
                        src={profile.meta.avatar}
                        alt={profile.meta.name}
                        class="w-24 h-24 rounded border-2 border-white/80 object-cover shrink-0"
                    />
                    <h1
                        class="text-[28px] font-bold text-slate-50"
                        style="text-shadow: 1px 1px 2px rgba(0,0,0,0.3);"
                    >
                        About Me
                    </h1>
                </div>
                {#each profile.about.bio as paragraph (paragraph)}
                    <p class="mt-4 text-[13px] leading-relaxed text-slate-50">
                        {paragraph}
                    </p>
                {/each}
            </div>
        </div>
    </div>
</Window>
