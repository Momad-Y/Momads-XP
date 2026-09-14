import { go_commands, type Level } from './difficulty';
import { is_uciok, parse_bestmove, type BestMove } from './uci';

/** Where the vendored engine is served from. */
export const ENGINE_URL = '/js/stockfish/stockfish.wasm.js';

/**
 * The slice of `Worker` this adapter needs, so a test can supply a fake
 * without booting WebAssembly.
 */
export interface EngineWorker {
    postMessage: (command: string) => void;
    terminate: () => void;
    addEventListener: (
        type: 'message',
        listener: (event: { data: string }) => void,
    ) => void;
}

export interface Engine {
    /** Resolves once the engine has answered `uci` — or on dispose. */
    ready: Promise<void>;
    best_move: (
        level: Level,
        moves: readonly string[],
    ) => Promise<BestMove | null>;
    dispose: () => void;
}

/**
 * A Worker is the only option, not a preference.
 *
 * `stockfish.js@10.0.2` has NO main-thread API: the script assigns a global
 * `onmessage` and calls a global `postMessage`, so it only functions as a
 * worker. Verified by running it. It also locates its own `.wasm` beside
 * itself (Emscripten's `locateFile` is `scriptDirectory + path`, and in a
 * worker `scriptDirectory` derives from `self.location.href`), which is why
 * serving from `/js/stockfish/` needs no configuration at all.
 */
const default_spawn = (): EngineWorker => new Worker(ENGINE_URL);

export function create_engine(
    spawn: () => EngineWorker = default_spawn,
): Engine {
    const worker = spawn();
    let disposed = false;

    let resolve_ready: () => void = () => undefined;
    const ready = new Promise<void>((resolve) => {
        resolve_ready = resolve;
    });

    /*
     * Every request carries an id, and only the newest one is live.
     *
     * UCI has no correlation id of its own — a `bestmove` line is just a line
     * — so without this the reply to an abandoned search would settle the
     * promise for the current one, and the engine would play a move from a
     * position that no longer exists.
     */
    let current: {
        id: number;
        settle: (move: BestMove | null) => void;
    } | null = null;
    let next_id = 0;

    function settle_current(move: BestMove | null) {
        const pending = current;
        current = null;
        pending?.settle(move);
    }

    worker.addEventListener('message', (event) => {
        const line = typeof event.data === 'string' ? event.data : '';
        if (is_uciok(line)) {
            resolve_ready();
            return;
        }
        if (current == null) return;
        // `parse_bestmove` returns null for every `info` line AND for
        // `bestmove (none)`, so distinguish "not a bestmove line" from "no
        // move exists" before settling.
        if (!line.trim().startsWith('bestmove')) return;
        settle_current(parse_bestmove(line));
    });

    worker.postMessage('uci');

    return {
        ready,
        best_move: (level, moves) => {
            if (disposed) return Promise.resolve(null);
            // Abandon whatever was in flight; its reply is no longer wanted.
            settle_current(null);
            const id = ++next_id;
            const promise = new Promise<BestMove | null>((resolve) => {
                current = { id, settle: resolve };
            });
            for (const command of go_commands(level, moves)) {
                worker.postMessage(command);
            }
            return promise;
        },
        dispose: () => {
            if (disposed) return;
            disposed = true;
            // Settle before terminating: a promise left pending would keep the
            // component's closure, and everything it captured, alive.
            settle_current(null);
            resolve_ready();
            worker.terminate();
        },
    };
}
