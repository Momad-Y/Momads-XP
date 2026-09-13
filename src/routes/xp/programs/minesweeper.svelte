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
    $: mine_display = String(Math.max(flags_left(board), 0)).padStart(3, '0');
    $: time_display = String(Math.min(seconds, 999)).padStart(3, '0');
    $: face =
        board.status === 'lost' ? ':(' : board.status === 'won' ? 'B)' : ':)';
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
                        class="ms-face h-[26px] w-[26px] border-2 border-l-white border-t-white border-r-slate-500 border-b-slate-500 bg-[#c0c0c0] text-[11px] leading-none"
                        aria-label="New game"
                        on:click={restart}>{face}</button
                    >
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
                                <span class="text-red-700">F</span>
                            {:else if cell.state === 'revealed' && cell.mine}
                                <span>*</span>
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
