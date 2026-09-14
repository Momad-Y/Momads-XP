<svelte:options accessors={true} />

<script lang="ts">
    import { onMount, unmount } from 'svelte';
    import Window from '../../../lib/components/xp/Window.svelte';
    import Menu from '../../../lib/components/xp/Menu.svelte';
    import { runningPrograms, zIndex } from '../../../lib/store';
    import { required } from '../../../lib/types';
    import {
        card_code,
        SUITS,
        type Card,
    } from '../../../lib/games/solitaire/deck';
    import {
        auto_complete_available,
        auto_finish,
        can_move,
        deal,
        draw_from_stock,
        has_won,
        move,
        type Game,
        type Source,
        type Target,
    } from '../../../lib/games/solitaire/klondike';
    import type {
        MenuBarEntry,
        ProgramInstance,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    export let id: string;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;

    let game: Game = deal(Math.random, 1);
    let reduced_motion = false;
    /** The in-flight drag, or null. Reassigned, never mutated in place. */
    let dragging: { from: Source; cards: Card[]; x: number; y: number } | null =
        null;
    /** Set when auto-complete ran and could not finish; hides the button. */
    let auto_complete_stalled = false;

    export let options: WindowOptions = {
        title: 'Solitaire',
        icon: '/assets/icons/solitaire.png',
        id,
        width: 700,
        height: 520,
    };

    // READ-ONLY derivations only. See the note in minesweeper.svelte: a write
    // from inside a `$:` block does not invalidate sibling `$:` blocks.
    $: won = has_won(game);
    $: can_finish = auto_complete_available(game) && !auto_complete_stalled;

    let menu: MenuBarEntry[];
    $: menu = [
        {
            name: 'Game',
            items: [
                [
                    {
                        name: 'Deal',
                        action: () => {
                            restart(game.draw);
                        },
                    },
                ],
                [
                    {
                        name: 'Draw One',
                        check: game.draw === 1,
                        action: () => {
                            restart(1);
                        },
                    },
                    {
                        name: 'Draw Three',
                        check: game.draw === 3,
                        action: () => {
                            restart(3);
                        },
                    },
                ],
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
        // One-shot read in onMount, not in a `$:` block.
        reduced_motion = globalThis.matchMedia(
            '(prefers-reduced-motion: reduce)',
        ).matches;
    });

    function restart(draw: 1 | 3) {
        game = deal(Math.random, draw);
        dragging = null;
        auto_complete_stalled = false;
    }

    /**
     * Auto-complete, and stop offering it if it could not finish.
     *
     * `auto_complete_available` means the position is fully VISIBLE, not that
     * it is winnable by sending top cards home — an Ace buried under its own 2
     * deadlocks. Without this flag the button would sit there doing nothing on
     * every further click.
     */
    function finish() {
        game = auto_finish(game);
        if (!has_won(game)) auto_complete_stalled = true;
    }

    function face_of(card: Card): string {
        return card.face_up
            ? `/assets/cards/${card_code(card)}.png`
            : '/assets/cards/back.png';
    }

    /** Send a card to whichever foundation will take it. XP's double-click. */
    function auto_home(from: Source) {
        for (let i = 0; i < SUITS.length; i++) {
            const to: Target = { pile: 'foundation', index: i };
            if (can_move(game, from, to)) {
                game = move(game, from, to);
                return;
            }
        }
    }

    function start_drag(from: Source, cards: Card[], event: PointerEvent) {
        if (cards.length === 0) return;
        // Capture so the drag survives the pointer leaving the card — the
        // floating run under the cursor would otherwise steal the events.
        const el = event.currentTarget;
        if (el instanceof Element) el.setPointerCapture(event.pointerId);
        dragging = { from, cards, x: event.clientX, y: event.clientY };
    }

    function move_drag(event: PointerEvent) {
        if (dragging == null) return;
        dragging = { ...dragging, x: event.clientX, y: event.clientY };
    }

    function end_drag(event: PointerEvent) {
        const active = dragging;
        dragging = null;
        if (active == null) return;
        // Hit-test what is under the pointer rather than tracking enter/leave:
        // the floating cards sit under the cursor and would swallow them.
        const target = document
            .elementsFromPoint(event.clientX, event.clientY)
            .find((el) => el instanceof HTMLElement && el.dataset.drop != null);
        if (!(target instanceof HTMLElement)) return;
        const kind = target.dataset.drop;
        const index = Number(target.dataset.index ?? '0');
        if (kind !== 'tableau' && kind !== 'foundation') return;
        game = move(game, active.from, { pile: kind, index });
    }

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'solitaire instance'));
    }
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div slot="content" class="absolute inset-0 flex flex-col bg-xp-yellow">
        <Menu {menu} focused={window?.z_index === $zIndex} />

        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
            class="sol-felt relative grow select-none overflow-hidden bg-[#0a6b3d] p-3"
            data-reduced-motion={reduced_motion}
            on:pointermove={move_drag}
            on:pointerup={end_drag}
            on:pointercancel={end_drag}
        >
            <!-- top row: stock, waste, foundations -->
            <div class="mb-4 flex gap-3">
                <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
                <div
                    class="sol-stock h-[96px] w-[71px] shrink-0 rounded border-2 border-white/30 bg-black/20"
                    on:click={() => {
                        game = draw_from_stock(game);
                    }}
                >
                    {#if game.stock.length > 0}
                        <img
                            class="h-full w-full rounded"
                            src="/assets/cards/back.png"
                            alt="stock"
                        />
                    {/if}
                </div>

                <div class="sol-waste h-[96px] w-[71px] shrink-0">
                    {#if game.waste.at(-1) != null}
                        {@const top = game.waste[game.waste.length - 1]}
                        {#if top != null}
                            <img
                                class="sol-card sol-face-up h-full w-full cursor-grab rounded shadow"
                                src={face_of(top)}
                                alt={card_code(top)}
                                data-rank={top.rank}
                                on:pointerdown={(e) => {
                                    start_drag({ pile: 'waste' }, [top], e);
                                }}
                                on:dblclick={() => {
                                    auto_home({ pile: 'waste' });
                                }}
                            />
                        {/if}
                    {/if}
                </div>

                <div class="grow"></div>

                {#each game.foundations as pile, index (index)}
                    <div
                        class="sol-foundation h-[96px] w-[71px] shrink-0 rounded border-2 border-white/30"
                        data-drop="foundation"
                        data-index={index}
                    >
                        {#each pile.slice(-1) as top (card_code(top))}
                            <img
                                class="sol-card pointer-events-none h-full w-full rounded"
                                src={face_of(top)}
                                alt={card_code(top)}
                            />
                        {/each}
                    </div>
                {/each}
            </div>

            <!-- tableau -->
            <div class="sol-tableau flex gap-3">
                {#each game.tableau as pile, col (col)}
                    <div
                        class="relative h-[300px] w-[71px] shrink-0 rounded border-2 border-white/20"
                        data-drop="tableau"
                        data-index={col}
                    >
                        {#each pile as card, row (`${card.suit}${String(card.rank)}`)}
                            <img
                                class="sol-card absolute left-0 w-[71px] rounded shadow
                                    {card.face_up
                                    ? 'sol-face-up cursor-grab'
                                    : ''}"
                                style:top="{row * 20}px"
                                src={face_of(card)}
                                alt={card.face_up
                                    ? card_code(card)
                                    : 'face down'}
                                data-rank={card.face_up ? card.rank : ''}
                                on:pointerdown={(e) => {
                                    if (!card.face_up) return;
                                    start_drag(
                                        {
                                            pile: 'tableau',
                                            index: col,
                                            depth: pile.length - 1 - row,
                                        },
                                        pile.slice(row),
                                        e,
                                    );
                                }}
                                on:dblclick={() => {
                                    if (!card.face_up) return;
                                    auto_home({
                                        pile: 'tableau',
                                        index: col,
                                        depth: pile.length - 1 - row,
                                    });
                                }}
                            />
                        {/each}
                    </div>
                {/each}
            </div>

            <!-- the dragged run, following the pointer -->
            {#if dragging != null}
                <div
                    class="pointer-events-none fixed z-50"
                    style:left="{dragging.x - 35}px"
                    style:top="{dragging.y - 20}px"
                >
                    {#each dragging.cards as card, i (`${card.suit}${String(card.rank)}`)}
                        <img
                            class="absolute w-[71px] rounded shadow-lg"
                            style:top="{i * 20}px"
                            src={face_of(card)}
                            alt={card_code(card)}
                        />
                    {/each}
                </div>
            {/if}

            {#if won}
                <div
                    class="sol-won absolute inset-0 flex items-center justify-center bg-black/40"
                >
                    <div class="rounded bg-xp-yellow px-6 py-4 text-center">
                        <p class="text-[13px] font-bold text-slate-800">
                            You won!
                        </p>
                        <button
                            class="mt-2 border border-slate-500 bg-slate-200 px-3 py-1 text-[11px]"
                            on:click={() => {
                                restart(game.draw);
                            }}>Deal again</button
                        >
                    </div>
                </div>
            {:else if can_finish}
                <button
                    class="sol-autocomplete absolute bottom-3 right-3 border border-slate-500 bg-slate-200 px-3 py-1 text-[11px]"
                    on:click={() => {
                        finish();
                    }}>Auto-complete</button
                >
            {/if}
        </div>
    </div>
</Window>
