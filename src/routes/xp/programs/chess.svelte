<svelte:options accessors={true} />

<script lang="ts">
    import { onDestroy, onMount, unmount } from 'svelte';
    import { Chess, type Square } from 'chess.js';
    import Window from '../../../lib/components/xp/Window.svelte';
    import { runningPrograms } from '../../../lib/store';
    import { required } from '../../../lib/types';
    import {
        create_engine,
        type Engine,
    } from '../../../lib/games/chess/engine';
    import {
        LEVELS,
        LEVEL_LABELS,
        type Level,
    } from '../../../lib/games/chess/difficulty';
    import { to_uci } from '../../../lib/games/chess/uci';
    import type {
        ProgramInstance,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    export let id: string;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;

    type Opponent = 'computer' | 'two-player';

    /*
     * `as const` is load-bearing, not decoration. It makes `${file}${rank}`
     * infer as chess.js's own `Square` union, so every call below type-checks
     * without a cast — and `no-unsafe-type-assertion` is an error in this repo.
     */
    const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
    const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

    let game = new Chess();
    let selected: Square | null = null;
    let opponent: Opponent = 'computer';
    let level: Level = 'easy';
    let engine: Engine | null = null;
    let thinking = false;
    /**
     * chess.js mutates in place, so there is no new object for Svelte to see.
     * Everything the view reads is pulled into this snapshot, which is
     * REASSIGNED after every mutation — the same reassign-to-invalidate
     * pattern the other two games use, and the reason no `$:` block here
     * writes state.
     *
     * DECLARED LAST, and it must stay here. `snapshot()` calls `describe()`,
     * which reads `opponent` and `thinking`; initialising `view` above them
     * hits their temporal dead zone and throws before the window renders at
     * all. Function declarations hoist — `let` bindings do not.
     */
    let view = snapshot();

    export let options: WindowOptions = {
        title: 'Chess',
        icon: '/assets/icons/chess.png',
        id,
        width: 460,
        height: 516,
    };

    // Read-only derivation. `view` is the invalidation signal.
    $: legal_targets =
        selected == null
            ? []
            : game.moves({ square: selected, verbose: true }).map((m) => m.to);

    function snapshot() {
        return {
            board: game.board(),
            history: game.history(),
            status: describe(),
        };
    }

    function refresh() {
        view = snapshot();
    }

    function describe(): string {
        if (game.isCheckmate()) {
            return game.turn() === 'w'
                ? 'Checkmate — black wins'
                : 'Checkmate — white wins';
        }
        if (game.isStalemate()) return 'Stalemate — draw';
        if (game.isDraw()) return 'Draw';
        if (thinking) return 'Thinking…';
        const side = game.turn() === 'w' ? 'White' : 'Black';
        const check = game.inCheck() ? ' — check' : '';
        return opponent === 'computer' && game.turn() === 'w'
            ? `Your move${check}`
            : `${side} to move${check}`;
    }

    function piece_src(colour: string, type: string): string {
        return `/assets/chess/${colour}${type.toUpperCase()}.svg`;
    }

    onMount(() => {
        // One-shot init in onMount, never in a `$:` block.
        engine = create_engine();
    });

    onDestroy(() => {
        // The window can close mid-search; dispose settles any in-flight
        // promise and terminates the worker so nothing leaks per open.
        engine?.dispose();
        engine = null;
    });

    function uci_history(): string[] {
        return game.history({ verbose: true }).map((m) => to_uci(m));
    }

    async function reply() {
        if (opponent !== 'computer' || engine == null) return;
        if (game.isGameOver()) return;
        thinking = true;
        refresh();
        const best = await engine.best_move(level, uci_history());
        thinking = false;
        if (best == null) {
            refresh();
            return;
        }
        // The engine answers in UCI square names; narrow them through the
        // board's own names rather than asserting.
        const from = square_named(best.from);
        const to = square_named(best.to);
        if (from == null || to == null) {
            refresh();
            return;
        }
        game.move({ from, to, promotion: best.promotion ?? 'q' });
        refresh();
    }

    /** All 64 names, typed. Built from the const tuples above. */
    const SQUARE_NAMES: Square[] = RANKS.flatMap((rank) =>
        FILES.map((file) => `${file}${rank}` as const),
    );

    function square_named(value: string): Square | null {
        return SQUARE_NAMES.find((s) => s === value) ?? null;
    }

    function on_square(name: Square) {
        if (thinking) return;
        if (game.isGameOver()) return;
        if (opponent === 'computer' && game.turn() !== 'w') return;

        if (selected == null) {
            const piece = game.get(name);
            if (piece != null && piece.color === game.turn()) selected = name;
            return;
        }
        if (selected === name) {
            selected = null;
            return;
        }
        try {
            // chess.js THROWS on an illegal move in v1; it does not return
            // null, so there is no null branch to write here.
            game.move({ from: selected, to: name, promotion: 'q' });
            selected = null;
            refresh();
            void reply();
        } catch {
            // chess.js throws on an illegal move rather than returning null.
            // Selecting one of your own pieces instead is the friendly read.
            const piece = game.get(name);
            selected =
                piece != null && piece.color === game.turn() ? name : null;
        }
    }

    function new_game() {
        game = new Chess();
        selected = null;
        thinking = false;
        refresh();
    }

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'chess instance'));
    }
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div
        slot="content"
        class="absolute inset-0 flex flex-col gap-2 overflow-auto bg-xp-yellow p-2"
    >
        <div class="flex flex-wrap items-center gap-2 text-[11px]">
            <label class="flex items-center gap-1">
                Opponent
                <select
                    class="border border-slate-500 text-[11px]"
                    bind:value={opponent}
                >
                    <option value="computer">Computer</option>
                    <option value="two-player">Two players</option>
                </select>
            </label>
            <label class="flex items-center gap-1">
                Difficulty
                <select
                    class="border border-slate-500 text-[11px]"
                    bind:value={level}
                >
                    {#each LEVELS as l (l)}
                        <option value={l}>{LEVEL_LABELS[l]}</option>
                    {/each}
                </select>
            </label>
            <button
                class="border border-slate-500 bg-slate-200 px-2 py-[2px]"
                on:click={new_game}>New Game</button
            >
        </div>

        <div
            class="chess-board mx-auto grid w-[352px] shrink-0 border-2 border-slate-700"
            style:grid-template-columns="repeat(8, 44px)"
        >
            {#each RANKS as rank, r (rank)}
                {#each FILES as file, f (file)}
                    {@const name = `${file}${rank}` as const}
                    {@const cell = view.board[r]?.[f]}
                    <button
                        class="chess-square relative h-[44px] w-[44px]
                            {(r + f) % 2 === 0
                            ? 'bg-[#f0d9b5]'
                            : 'bg-[#b58863]'}
                            {selected === name
                            ? 'ring-2 ring-inset ring-yellow-400'
                            : ''}"
                        data-square={name}
                        aria-label={name}
                        on:click={() => {
                            on_square(name);
                        }}
                    >
                        {#if cell != null}
                            <img
                                class="chess-piece h-full w-full"
                                src={piece_src(cell.color, cell.type)}
                                alt="{cell.color}{cell.type}"
                            />
                        {/if}
                        {#if legal_targets.includes(name)}
                            <span
                                class="pointer-events-none absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/30"
                            ></span>
                        {/if}
                    </button>
                {/each}
            {/each}
        </div>

        <p
            class="chess-status text-center text-[11px] font-bold text-slate-800"
        >
            {view.status}
        </p>

        <ol
            class="chess-history flex flex-wrap gap-x-2 gap-y-0 overflow-auto px-2 text-[11px] text-slate-700"
        >
            {#each view.history as san, i (`${String(i)}-${san}`)}
                <li>{i % 2 === 0 ? `${String(i / 2 + 1)}.` : ''}{san}</li>
            {/each}
        </ol>
    </div>
</Window>
