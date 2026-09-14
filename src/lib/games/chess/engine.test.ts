import { describe, expect, it, vi } from 'vitest';
import { create_engine, type EngineWorker } from './engine';
import { LIMITS } from './difficulty';

/**
 * A fake engine: records the commands sent, replays scripted output. The real
 * one is a Worker, which vitest has no business booting — this is where the
 * message-ordering and teardown bugs live, and they are all expressible here.
 */
function fake(): {
    worker: EngineWorker;
    sent: string[];
    emit: (line: string) => void;
} {
    const sent: string[] = [];
    let listener: ((e: { data: string }) => void) | undefined;
    return {
        sent,
        emit: (line) => listener?.({ data: line }),
        worker: {
            postMessage: (c) => sent.push(c),
            terminate: vi.fn(),
            addEventListener: (_type, l) => {
                listener = l;
            },
        },
    };
}

describe('chess engine adapter', () => {
    it('handshakes with uci and resolves ready on uciok', async () => {
        const f = fake();
        const engine = create_engine(() => f.worker);
        expect(f.sent).toEqual(['uci']);
        f.emit('id name Stockfish 2019-08-15 Multi-Variant');
        f.emit('uciok');
        await expect(engine.ready).resolves.toBeUndefined();
    });

    it('sends skill, position and go, then resolves the bestmove', async () => {
        const f = fake();
        const engine = create_engine(() => f.worker);
        f.emit('uciok');
        await engine.ready;

        const pending = engine.best_move('easy', ['e2e4']);
        expect(f.sent).toEqual([
            'uci',
            `setoption name Skill Level value ${String(LIMITS.easy.skill)}`,
            'position startpos moves e2e4',
            `go depth ${String(LIMITS.easy.depth)}`,
        ]);

        f.emit('info depth 5 score cp 12 pv e7e5'); // must be ignored
        f.emit('bestmove e7e6 ponder b1c3');
        await expect(pending).resolves.toEqual({ from: 'e7', to: 'e6' });
    });

    it('resolves null when the engine has no move', async () => {
        const f = fake();
        const engine = create_engine(() => f.worker);
        f.emit('uciok');
        await engine.ready;
        const pending = engine.best_move('easy', []);
        f.emit('bestmove (none)');
        await expect(pending).resolves.toBeNull();
    });

    it('does not answer a stale request when a new one supersedes it', async () => {
        /*
         * The window lets a player start a new game while the engine is still
         * searching. Without request tagging the first `bestmove` would settle
         * the SECOND promise, and the engine would play a move from a position
         * that no longer exists.
         */
        const f = fake();
        const engine = create_engine(() => f.worker);
        f.emit('uciok');
        await engine.ready;

        const first = engine.best_move('easy', ['e2e4']);
        const second = engine.best_move('easy', ['d2d4']);
        f.emit('bestmove d7d5');

        await expect(second).resolves.toEqual({ from: 'd7', to: 'd5' });
        await expect(first).resolves.toBeNull();
    });

    it('terminates the worker on dispose, and only once', async () => {
        // Opening and closing the Chess window repeatedly must not leak an
        // engine and its WASM heap per open.
        const f = fake();
        const engine = create_engine(() => f.worker);
        f.emit('uciok');
        await engine.ready;
        engine.dispose();
        engine.dispose();
        expect(f.worker.terminate).toHaveBeenCalledTimes(1);
    });

    it('resolves an in-flight request on dispose rather than hanging', async () => {
        // A promise left pending across a window close would keep the
        // component's closure — and everything it captured — alive.
        const f = fake();
        const engine = create_engine(() => f.worker);
        f.emit('uciok');
        await engine.ready;
        const pending = engine.best_move('easy', []);
        engine.dispose();
        await expect(pending).resolves.toBeNull();
    });

    it('refuses further work once disposed', async () => {
        const f = fake();
        const engine = create_engine(() => f.worker);
        f.emit('uciok');
        await engine.ready;
        engine.dispose();
        const after = f.sent.length;
        await expect(engine.best_move('hard', ['e2e4'])).resolves.toBeNull();
        expect(f.sent).toHaveLength(after); // nothing sent to a dead worker
    });

    it('resolves ready on dispose so a caller awaiting it cannot hang', async () => {
        const f = fake();
        const engine = create_engine(() => f.worker);
        engine.dispose(); // disposed before the handshake ever completed
        await expect(engine.ready).resolves.toBeUndefined();
    });
});
