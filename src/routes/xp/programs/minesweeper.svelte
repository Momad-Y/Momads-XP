<svelte:options accessors={true} />

<script lang="ts">
    import { onDestroy, onMount, unmount } from 'svelte';
    import Window from '../../../lib/components/xp/Window.svelte';
    import Menu from '../../../lib/components/xp/Menu.svelte';
    import { runningPrograms, zIndex } from '../../../lib/store';
    import { required } from '../../../lib/types';
    import {
        CELL_PX,
        LEVELS,
        PRESETS,
        window_size,
        type Level,
    } from '../../../lib/games/minesweeper/difficulty';
    import {
        flags_left,
        new_board,
        reveal,
        toggle_flag,
        type Board,
    } from '../../../lib/games/minesweeper/board';
    import type {
        MenuBarEntry,
        ProgramInstance,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    export let id: string;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;

    let level: Level = 'beginner';
    let board: Board = new_board(PRESETS[level]);
    let seconds = 0;
    let timer: ReturnType<typeof setInterval> | undefined;

    /*
     * This default is NOT what sizes the window on the normal launch path.
     * `work_space.svelte` mounts a registered app with an explicit `options`
     * prop built by `to_window_options()`, and Svelte replaces a component
     * default wholesale rather than merging, so the registry's `default_size`
     * is the real source of truth. This exists for the case where the
     * component is mounted outside the registry.
     */
    export let options: WindowOptions = {
        title: 'Minesweeper',
        icon: '/assets/icons/minesweeper.png',
        id,
        ...window_size(PRESETS.beginner),
        resizable: false,
        maximize_btn: false,
    };

    /*
     * READ-ONLY derivations. Nothing in a `$:` block here writes state.
     *
     * In Svelte 5 legacy mode a write from inside a reactive statement does
     * not invalidate the other reactive statements — it has already shipped
     * once in this codebase as the Music Player's frozen title. Every state
     * change below happens in an event handler or the interval callback.
     */
    /*
     * NOT clamped at zero. `flags_left` documents that it may go negative,
     * "exactly as XP's counter does" — over-flagging shows -01, -02 and so on,
     * and clamping contradicted the module it reads from.
     */
    $: mine_display = format_counter(flags_left(board));
    $: time_display = String(Math.min(seconds, 999)).padStart(3, '0');
    $: face = board.status;
    $: preset = PRESETS[level];

    let menu: MenuBarEntry[];
    $: menu = [
        {
            name: 'Game',
            items: [
                [
                    {
                        name: 'New',
                        action: () => {
                            restart();
                        },
                    },
                ],
                LEVELS.map((l) => ({
                    name: PRESETS[l].label,
                    check: l === level,
                    action: () => {
                        set_level(l);
                    },
                })),
                [
                    {
                        name: 'Exit',
                        action: () => {
                            destroy();
                        },
                    },
                ],
            ],
        },
    ];

    onMount(() => {
        // One-shot init belongs here, not in a `$:` block.
        timer = setInterval(() => {
            if (board.status === 'playing') seconds += 1;
        }, 1000);
    });

    onDestroy(() => {
        if (timer != null) clearInterval(timer);
        timer = undefined;
    });

    /** XP's three-digit LED: negatives render as `-01`, not `000`. */
    function format_counter(value: number): string {
        if (value < 0) {
            return `-${String(Math.min(-value, 99)).padStart(2, '0')}`;
        }
        return String(Math.min(value, 999)).padStart(3, '0');
    }

    function restart() {
        board = new_board(PRESETS[level]);
        seconds = 0;
    }

    function set_level(next: Level) {
        level = next;
        restart();
        // REASSIGN, never mutate. `Window.svelte` binds `style:width` to
        // `options.width`; writing the member alone would not invalidate it.
        options = { ...options, ...window_size(PRESETS[next]) };
    }

    function on_cell_down(index: number, event: MouseEvent) {
        if (event.button === 2) {
            event.preventDefault();
            board = toggle_flag(board, index);
        }
    }

    function on_cell_click(index: number) {
        board = reveal(board, index);
    }

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'minesweeper instance'));
    }
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div slot="content" class="absolute inset-0 flex flex-col bg-xp-yellow">
        <Menu {menu} focused={window?.z_index === $zIndex} />

        <div class="grow p-[6px]">
            <div
                class="flex h-full flex-col border-2 border-l-slate-400 border-t-slate-400 border-r-white border-b-white bg-[#c0c0c0] p-[6px]"
            >
                <!-- counter / smiley / timer -->
                <div
                    class="mb-[6px] flex items-center justify-between border-2 border-l-slate-400 border-t-slate-400 border-r-white border-b-white px-[6px] py-[3px]"
                >
                    <span
                        class="ms-mine-count bg-black px-1 font-mono text-[18px] leading-none text-red-600"
                        >{mine_display}</span
                    >
                    <button
                        class="ms-face h-[26px] w-[26px] border-2 border-l-white border-t-white border-r-slate-500 border-b-slate-500 bg-[#c0c0c0] p-[2px] leading-none"
                        aria-label="New game"
                        on:click={restart}
                    >
                        <svg viewBox="0 0 20 20" class="h-full w-full">
                            <circle
                                cx="10"
                                cy="10"
                                r="8.5"
                                fill="#ffff00"
                                stroke="#000"
                                stroke-width="1"
                            />
                            {#if face === 'lost'}
                                <!-- X eyes -->
                                <path
                                    d="M5.5 5.5 L8.5 8.5 M8.5 5.5 L5.5 8.5 M11.5 5.5 L14.5 8.5 M14.5 5.5 L11.5 8.5"
                                    stroke="#000"
                                    stroke-width="1.1"
                                />
                                <path
                                    d="M6 15 Q10 11 14 15"
                                    stroke="#000"
                                    stroke-width="1.2"
                                    fill="none"
                                />
                            {:else if face === 'won'}
                                <!-- sunglasses -->
                                <path
                                    d="M4 7 H16 M9 8 H11"
                                    stroke="#000"
                                    stroke-width="1"
                                />
                                <rect
                                    x="4"
                                    y="7"
                                    width="4.5"
                                    height="3.2"
                                    fill="#000"
                                />
                                <rect
                                    x="11.5"
                                    y="7"
                                    width="4.5"
                                    height="3.2"
                                    fill="#000"
                                />
                                <path
                                    d="M6 13 Q10 16.5 14 13"
                                    stroke="#000"
                                    stroke-width="1.2"
                                    fill="none"
                                />
                            {:else}
                                <circle cx="7" cy="8" r="1.2" fill="#000" />
                                <circle cx="13" cy="8" r="1.2" fill="#000" />
                                <path
                                    d="M6 12.5 Q10 16 14 12.5"
                                    stroke="#000"
                                    stroke-width="1.2"
                                    fill="none"
                                />
                            {/if}
                        </svg>
                    </button>
                    <span
                        class="ms-time bg-black px-1 font-mono text-[18px] leading-none text-red-600"
                        >{time_display}</span
                    >
                </div>

                <!-- the grid -->
                <div
                    class="ms-grid grid border-2 border-l-slate-400 border-t-slate-400 border-r-white border-b-white"
                    style:grid-template-columns="repeat({preset.cols}, {CELL_PX}px)"
                    role="grid"
                    tabindex="-1"
                    on:contextmenu|preventDefault={() => undefined}
                >
                    {#each board.cells as cell, index (index)}
                        <button
                            class="ms-cell flex items-center justify-center font-mono text-[11px] font-bold leading-none
                                {cell.state === 'revealed'
                                ? 'ms-revealed border border-slate-400 bg-[#c0c0c0]'
                                : 'border-2 border-l-white border-t-white border-r-slate-500 border-b-slate-500 bg-[#c0c0c0]'}
                                {cell.state === 'flagged' ? 'ms-flagged' : ''}
                                {cell.state === 'revealed' && cell.mine
                                ? 'ms-mine bg-red-500'
                                : ''}"
                            style:width="{CELL_PX}px"
                            style:height="{CELL_PX}px"
                            data-adjacent={cell.state === 'revealed' &&
                            !cell.mine
                                ? cell.adjacent
                                : ''}
                            aria-label="cell {index}"
                            on:mousedown={(e) => {
                                on_cell_down(index, e);
                            }}
                            on:click={() => {
                                on_cell_click(index);
                            }}
                        >
                            {#if cell.state === 'flagged'}
                                <!-- XP's flag: red pennant on a black pole
                                     with a base. Drawn rather than lettered —
                                     "F" reads as a web page, not as XP. -->
                                <svg viewBox="0 0 16 16" class="h-full w-full">
                                    <path
                                        d="M6 3 L12 5.5 L6 8 Z"
                                        fill="#e00000"
                                    />
                                    <rect
                                        x="5.3"
                                        y="3"
                                        width="1.1"
                                        height="8"
                                        fill="#000"
                                    />
                                    <rect
                                        x="3"
                                        y="11"
                                        width="6"
                                        height="1.3"
                                        fill="#000"
                                    />
                                    <rect
                                        x="4"
                                        y="9.8"
                                        width="4"
                                        height="1.2"
                                        fill="#000"
                                    />
                                </svg>
                            {:else if cell.state === 'revealed' && cell.mine}
                                <svg viewBox="0 0 16 16" class="h-full w-full">
                                    <path
                                        d="M8 2.2 V13.8 M2.2 8 H13.8 M3.9 3.9 L12.1 12.1 M12.1 3.9 L3.9 12.1"
                                        stroke="#000"
                                        stroke-width="1.1"
                                    />
                                    <circle cx="8" cy="8" r="3.4" fill="#000" />
                                    <circle
                                        cx="6.8"
                                        cy="6.8"
                                        r="1"
                                        fill="#fff"
                                    />
                                </svg>
                            {:else if cell.state === 'revealed' && cell.adjacent > 0}
                                <span
                                    class:text-blue-700={cell.adjacent === 1}
                                    class:text-green-700={cell.adjacent === 2}
                                    class:text-red-700={cell.adjacent === 3}
                                    class:text-blue-900={cell.adjacent === 4}
                                    class:text-red-900={cell.adjacent >= 5}
                                    >{cell.adjacent}</span
                                >
                            {/if}
                        </button>
                    {/each}
                </div>
            </div>
        </div>
    </div>
</Window>
