import { describe, it, expect } from 'vitest';
import {
    initial_repl_state,
    is_exit_command,
    on_eof,
    on_interrupt,
    on_runtime_message,
    on_submit,
    prompt_text,
    PS1,
    PS2,
    type ReplEffect,
    type ReplState,
} from './repl';
import { strip_ansi } from '../term/ansi';

/** Everything the REPL asked the terminal to print, as plain text. */
function printed(effects: readonly ReplEffect[]): string {
    return strip_ansi(
        effects
            .filter((e) => e.kind === 'write')
            .map((e) => e.text)
            .join(''),
    );
}

function kinds(effects: readonly ReplEffect[]): string[] {
    return effects.map((e) => e.kind);
}

const READY: ReplState = { ready: true, awaiting: false, block_open: false };

describe('on_submit', () => {
    it('sends ONE line, never an accumulated block', () => {
        // The bug this guards: `PyodideConsole.push()` appends to its OWN
        // buffer and re-joins it, so sending the accumulated block
        // double-concatenates and EVERY multi-line block became an
        // IndentationError. Shipped, and invisible to the test suite of the
        // day because this logic lived in a .svelte file.
        const opened = on_submit(READY, 'def f():');
        expect(opened.effects).toContainEqual({
            kind: 'exec',
            source: 'def f():',
        });

        const continued = on_submit(opened.state, '    return 41');
        const execs = continued.effects.filter((e) => e.kind === 'exec');
        expect(execs).toHaveLength(1);
        expect(execs[0]).toEqual({ kind: 'exec', source: '    return 41' });
        // The crucial part: the first line must NOT come along for the ride.
        expect(execs[0]?.source).not.toContain('def f():');
    });

    it('marks the session busy so a stray key cannot redraw over output', () => {
        expect(on_submit(READY, '1 + 1').state.awaiting).toBe(true);
    });

    it('refuses to evaluate before the runtime is ready', () => {
        const result = on_submit(initial_repl_state(), '1 + 1');
        expect(kinds(result.effects)).not.toContain('exec');
        expect(printed(result.effects)).toContain('>>>');
    });

    it('intercepts every spelling of exit, and evaluates none of them', () => {
        for (const text of [
            'exit',
            'quit',
            'exit()',
            'quit()',
            '  exit ( ) ',
        ]) {
            const result = on_submit(READY, text);
            expect(kinds(result.effects), text).toContain('exit');
            expect(kinds(result.effects), text).not.toContain('exec');
        }
    });

    it('does not mutate the state it is given', () => {
        const before = Object.freeze({ ...READY });
        on_submit(before, '1 + 1');
        expect(before.awaiting).toBe(false);
    });
});

describe('is_exit_command', () => {
    it('accepts what CPython accepts', () => {
        for (const text of ['exit', 'quit', 'exit()', 'quit()', ' exit ( ) ']) {
            expect(is_exit_command(text), text).toBe(true);
        }
    });

    it('leaves real code alone', () => {
        // `exit(1)` takes an argument and is genuinely a call; `exiting` is a
        // name. Swallowing either would make the REPL lie about what it ran.
        for (const text of ['exit(1)', 'exiting', 'my_exit()', 'print(exit)']) {
            expect(is_exit_command(text), text).toBe(false);
        }
    });
});

describe('on_interrupt', () => {
    it('at an IDLE prompt keeps the session alive', () => {
        // The other shipped bug: Ctrl+C always terminated and respawned the
        // worker, so pressing it out of habit to clear a line silently
        // destroyed every variable the visitor had defined. That is a restart,
        // not an interrupt.
        const result = on_interrupt(READY);
        expect(kinds(result.effects)).not.toContain('restart');
        expect(printed(result.effects)).toContain('KeyboardInterrupt');
        expect(result.state.ready).toBe(true);
    });

    it('while BUSY restarts, and says the session is gone', () => {
        // A running worker cannot be interrupted without SharedArrayBuffer, so
        // terminate-and-respawn is the only lever — and it has to be honest
        // about the cost.
        const busy: ReplState = { ...READY, awaiting: true };
        const result = on_interrupt(busy);
        expect(kinds(result.effects)).toContain('restart');
        expect(printed(result.effects)).toContain('session state cleared');
        expect(result.state.ready).toBe(false);
        expect(result.state.awaiting).toBe(false);
    });

    it('abandons an open block so the continuation prompt cannot strand', () => {
        const mid: ReplState = { ...READY, block_open: true };
        expect(on_interrupt(mid).state.block_open).toBe(false);
    });
});

describe('on_eof', () => {
    it('ends the session, leaving the host to decide what that means', () => {
        expect(kinds(on_eof(READY).effects)).toContain('exit');
    });
});

describe('on_runtime_message', () => {
    it('hides the sandbox handshake, which is plumbing not progress', () => {
        const result = on_runtime_message(initial_repl_state(), {
            kind: 'loading',
            detail: 'Sandbox ready',
        });
        expect(result.effects).toEqual([]);
    });

    it('reports real loading steps', () => {
        const result = on_runtime_message(initial_repl_state(), {
            kind: 'loading',
            detail: 'Downloading Pyodide',
        });
        expect(printed(result.effects)).toContain('Downloading Pyodide');
    });

    it('splits the banner so it cannot staircase', () => {
        // xterm does not translate a bare \n: it moves DOWN without returning
        // to column 0, so an unsplit banner walks diagonally across the screen.
        const result = on_runtime_message(initial_repl_state(), {
            kind: 'ready',
            banner: 'Python 3.13.2\nType "help" for more.\n',
        });
        const text = printed(result.effects);
        expect(text).not.toMatch(/[^\r]\n/);
        expect(text).toContain('Python 3.13.2');
        expect(result.state.ready).toBe(true);
        expect(kinds(result.effects)).toContain('focus');
    });

    it('shows the continuation prompt only while a block is open', () => {
        const incomplete = on_runtime_message(
            { ...READY, awaiting: true },
            { kind: 'result', repr: null, status: 'incomplete' },
        );
        expect(incomplete.state.block_open).toBe(true);
        expect(printed(incomplete.effects)).toContain('...');

        const complete = on_runtime_message(incomplete.state, {
            kind: 'result',
            repr: '41',
            status: 'complete',
        });
        expect(complete.state.block_open).toBe(false);
        expect(printed(complete.effects)).toContain('41');
        expect(printed(complete.effects)).toContain('>>>');
    });

    it('prints nothing extra when a statement has no repr', () => {
        const result = on_runtime_message(
            { ...READY, awaiting: true },
            { kind: 'result', repr: null, status: 'complete' },
        );
        expect(printed(result.effects)).toBe(strip_ansi(PS1));
    });

    it('clears the busy flag on every terminal result', () => {
        for (const status of [
            'complete',
            'incomplete',
            'syntax-error',
        ] as const) {
            const result = on_runtime_message(
                { ...READY, awaiting: true },
                { kind: 'result', repr: null, status },
            );
            expect(result.state.awaiting, status).toBe(false);
        }
    });

    it('translates newlines in stdout and stderr for xterm', () => {
        const out = on_runtime_message(READY, {
            kind: 'stdout',
            text: 'a\nb\n',
        });
        expect(printed(out.effects)).not.toMatch(/[^\r]\n/);

        const err = on_runtime_message(READY, {
            kind: 'stderr',
            text: 'Traceback\n  line 1\n',
        });
        expect(printed(err.effects)).not.toMatch(/[^\r]\n/);
        expect(printed(err.effects)).toContain('Traceback');
    });

    it('an error closes the block, or the prompt strands forever', () => {
        // A `...` prompt left open can never advance: a submit returns early
        // while !ready, so the visitor types into a REPL that answers nothing.
        const result = on_runtime_message(
            { ready: true, awaiting: true, block_open: true },
            { kind: 'error', message: 'Python runtime unavailable' },
        );
        expect(result.state.block_open).toBe(false);
        expect(result.state.ready).toBe(false);
        expect(result.state.awaiting).toBe(false);
        expect(printed(result.effects)).toContain('Python runtime unavailable');
    });
});

describe('prompt_text', () => {
    it('is PS1 at the top level and PS2 inside a block', () => {
        expect(prompt_text(initial_repl_state())).toBe(PS1);
        expect(prompt_text({ ...READY, block_open: true })).toBe(PS2);
    });
});

describe('a save message reaches nothing', () => {
    it('emits no effects at all', () => {
        // The invariant the whole isolation argument rests on: no message
        // from the runtime can make this pure state machine touch storage.
        // `client.ts` intercepts `save` before this is called; the case exists
        // only to keep the switch exhaustive (TS2366 without it).
        const state = initial_repl_state();
        const result = on_runtime_message(state, {
            kind: 'save',
            files: [{ name: 'a.py', text: 'x' }],
        });
        expect(result.effects).toEqual([]);
        expect(result.state).toBe(state);
    });

    it('is the ONLY kind that emits nothing but write or focus', () => {
        // Guards the invariant directly: if a future message kind gains an
        // exec/exit/restart effect, this fails.
        const allowed = new Set(['write', 'focus']);
        const messages: Parameters<typeof on_runtime_message>[1][] = [
            { kind: 'loading', detail: 'x' },
            { kind: 'ready', banner: 'b' },
            { kind: 'stdout', text: 'x' },
            { kind: 'stderr', text: 'x' },
            { kind: 'result', repr: null, status: 'complete' },
            { kind: 'error', message: 'x' },
            { kind: 'save', files: [] },
        ];
        for (const message of messages) {
            for (const effect of on_runtime_message(
                initial_repl_state(),
                message,
            ).effects) {
                expect(allowed.has(effect.kind), message.kind).toBe(true);
            }
        }
    });
});
