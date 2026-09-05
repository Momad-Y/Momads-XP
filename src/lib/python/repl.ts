/**
 * The Python REPL's DECISIONS, as a pure state machine.
 *
 * WHY THIS EXISTS: this logic lived inside `python.svelte`, where it was
 * exempt from the diff-coverage gate — and it is not simple logic. Two of the
 * nastiest bugs in Phase 3 were here: sending the accumulated block instead of
 * one line (every multi-line block was an `IndentationError`), and treating an
 * idle Ctrl+C as a restart (which silently destroyed every variable the
 * visitor had defined). Neither could be caught by a unit test, because there
 * were no unit tests to catch them with.
 *
 * It became worth extracting the moment CMD gained the ability to host a
 * session in its own window: a second copy of these semantics would drift from
 * the first, which is the single most repeated defect shape in this repo — one
 * rule applied at several call sites, each deciding separately.
 *
 * The HOST keeps what is genuinely host-specific: the iframe, the client, the
 * xterm handle, and what `exit` means. Everything else is decided here.
 */
import { colour, CRLF, FG_GREY, FG_RED, FG_YELLOW } from '../term/ansi';
import { sanitise_runtime_text } from './sanitise';
import type { FromRuntime } from './protocol';

/**
 * Python's own prompt colours, NOT the terminal accent.
 *
 * A session hosted inside CMD keeps these even when `color` has repainted the
 * shell: the visitor is looking at a different program, and the prompt is how
 * they tell which one is reading their keystrokes.
 */
export const PS1 = colour('>>>', '\x1b[38;2;53;114;165m') + ' ';
export const PS2 = colour('...', FG_GREY) + ' ';

export interface ReplState {
    /** The runtime has announced its banner and can evaluate. */
    readonly ready: boolean;
    /** A line has been sent and no result has come back yet. */
    readonly awaiting: boolean;
    /**
     * `PyodideConsole` is mid-block, so the continuation prompt is shown.
     *
     * Tracked as a flag rather than as the accumulated lines: the block itself
     * lives in the runtime's own buffer, and keeping a second copy here is
     * precisely what caused the double-concatenation bug.
     */
    readonly block_open: boolean;
    /**
     * The runtime announced its banner at least once this session.
     *
     * Distinguishes "never came up" — where the CDN is the likely cause and
     * "are you online?" is the right question — from "came up and then died",
     * where it is not. Measured: `import js; js.self.close()` kills the worker
     * with no error event and no network involved.
     */
    readonly started: boolean;
}

export type ReplEffect =
    /** Raw bytes for the terminal; line endings are already correct. */
    | { kind: 'write'; text: string }
    /** Hand this ONE line to the runtime. */
    | { kind: 'exec'; source: string }
    /** Terminate and respawn — the only interrupt lever available. */
    | { kind: 'restart' }
    | { kind: 'focus' }
    /**
     * The session is over. The HOST decides what that means: the standalone
     * app closes its window, a CMD-hosted session returns to the shell.
     */
    | { kind: 'exit' };

export interface ReplResult {
    readonly state: ReplState;
    readonly effects: readonly ReplEffect[];
}

/**
 * How long a statement may run in silence before the terminal says something.
 *
 * Four seconds: long enough that ordinary work — `import numpy`, a few million
 * loop iterations — finishes first, short enough that a visitor who typed an
 * accidental infinite loop is not left staring at nothing.
 */
export const BUSY_HINT_MS = 4000;

/** What the terminal says when a statement has gone quiet for too long. */
export const BUSY_HINT_TEXT = 'still running — press Ctrl+C to stop it';

export function initial_repl_state(): ReplState {
    return { ready: false, awaiting: false, block_open: false, started: false };
}

/** PS1 or PS2, depending on whether a block is open. Also used for redraws. */
export function prompt_text(state: ReplState): string {
    return state.block_open ? PS2 : PS1;
}

function line(text: string): ReplEffect {
    return { kind: 'write', text: text + CRLF };
}

function prompt(state: ReplState): ReplEffect {
    return { kind: 'write', text: prompt_text(state) };
}

/**
 * `exit`, `exit()`, `quit`, `quit()` — with or without parentheses, exactly as
 * CPython accepts them.
 *
 * Intercepted BEFORE the runtime sees them. Pyodide has no process to exit, so
 * `exit()` raises SystemExit and dumps a six-frame traceback through
 * webloop/asyncio/console internals, which reads as a crash rather than as
 * "the interpreter closed".
 */
export function is_exit_command(text: string): boolean {
    return /^\s*(exit|quit)\s*(\(\s*\))?\s*$/.test(text);
}

export function on_runtime_message(
    state: ReplState,
    message: FromRuntime,
): ReplResult {
    switch (message.kind) {
        case 'loading':
            // The sandbox handshake is plumbing, not progress.
            if (message.detail === 'Sandbox ready')
                return { state, effects: [] };
            return {
                state,
                effects: [line(colour(`… ${message.detail}`, FG_GREY))],
            };

        case 'ready': {
            const next = { ...state, ready: true, started: true };
            // SPLIT the banner. It is multi-line, and writing it as one string
            // leaves bare \n characters in the stream; xterm does not translate
            // those, so a bare \n moves down WITHOUT returning to column 0 and
            // the banner staircases across the screen.
            const banner = sanitise_runtime_text(message.banner)
                .trimEnd()
                .split('\n')
                .map((l) => l.trimEnd());
            return {
                state: next,
                effects: [
                    ...banner.map(line),
                    line(''),
                    prompt(next),
                    { kind: 'focus' },
                ],
            };
        }

        case 'stdout':
            return {
                state,
                effects: [
                    {
                        kind: 'write',
                        text: sanitise_runtime_text(message.text).replace(
                            /\n/g,
                            CRLF,
                        ),
                    },
                ],
            };

        case 'stderr':
            return {
                state,
                effects: [
                    {
                        kind: 'write',
                        text: colour(
                            sanitise_runtime_text(message.text).replace(
                                /\n/g,
                                CRLF,
                            ),
                            FG_RED,
                        ),
                    },
                ],
            };

        case 'result': {
            if (message.status === 'incomplete') {
                // `PyodideConsole` says the block is unfinished — that is
                // CPython's own `codeop`, so `def f():` continues correctly.
                const next = { ...state, awaiting: false, block_open: true };
                return { state: next, effects: [prompt(next)] };
            }
            const next = { ...state, awaiting: false, block_open: false };
            return {
                state: next,
                effects: [
                    ...(message.repr != null
                        ? [line(sanitise_runtime_text(message.repr))]
                        : []),
                    prompt(next),
                ],
            };
        }

        case 'save':
            /**
             * Handled BEFORE this function is ever called — `client.ts`
             * intercepts it and routes it to `host_fs`.
             *
             * The case exists so the switch stays exhaustive (without it,
             * TS2366: this function has no default and no trailing return),
             * and it deliberately emits NOTHING. That is the invariant §0 of
             * the spec is built on and this feature had to preserve: no
             * message from the runtime can make this pure state machine reach
             * storage. `repl.test.ts` asserts the emptiness.
             */
            return { state, effects: [] };

        case 'error': {
            // Close the block too: leaving it open renders a `...` prompt that
            // can never advance, because a submit returns early while !ready.
            const next = {
                ...state,
                ready: false,
                awaiting: false,
                block_open: false,
            };
            return {
                state: next,
                effects: [
                    line(''),
                    line(
                        colour(
                            sanitise_runtime_text(message.message),
                            FG_YELLOW,
                        ),
                    ),
                    line(
                        colour(
                            state.started
                                ? 'The interpreter stopped. Press Ctrl+C to restart it.'
                                : 'Try again once you are back online.',
                            FG_GREY,
                        ),
                    ),
                ],
            };
        }
    }
}

export function on_submit(state: ReplState, text: string): ReplResult {
    const newline: ReplEffect = { kind: 'write', text: CRLF };

    if (is_exit_command(text)) {
        return { state, effects: [newline, { kind: 'exit' }] };
    }
    if (!state.ready) {
        return { state, effects: [newline, prompt(state)] };
    }

    // ONE LINE, never an accumulated block. `PyodideConsole.push()` appends to
    // its OWN buffer and re-joins it (`self.buffer.append(line); source =
    // "\n".join(self.buffer)`), so sending the block double-concatenates it:
    //   push("def f():")                 -> incomplete, buffer kept
    //   push("def f():\n    return 41")  -> IndentationError
    // Every multi-line block was a syntax error and the function was never
    // defined.
    const next = { ...state, awaiting: true, block_open: true };
    return { state: next, effects: [newline, { kind: 'exec', source: text }] };
}

export function on_interrupt(state: ReplState): ReplResult {
    const echo: ReplEffect = { kind: 'write', text: '^C' + CRLF };

    // IDLE: behave like CPython — abandon the current input and give a fresh
    // prompt. The session SURVIVES. Terminating here would mean that pressing
    // Ctrl+C out of habit to clear a line destroyed every variable defined so
    // far, which is a restart, not an interrupt.
    // A session that is not READY has already lost its state, so the idle
    // branch below would hand back a prompt that can never accept input —
    // every submit returns early while `!ready`. That was a dead end whose
    // only exit was closing the window.
    if (!state.awaiting && state.ready) {
        const next = { ...state, block_open: false };
        return {
            state: next,
            effects: [
                echo,
                line(colour('KeyboardInterrupt', FG_RED)),
                prompt(next),
            ],
        };
    }

    // BUSY: a running worker cannot be interrupted. `setInterruptBuffer` needs
    // SharedArrayBuffer, which needs COOP/COEP, which §5 records as breaking
    // other embeds here. Terminate-and-respawn is the only lever, so say
    // plainly that it costs the session.
    return {
        state: { ...state, ready: false, awaiting: false, block_open: false },
        effects: [
            echo,
            line(
                colour('Restarting Python… (session state cleared)', FG_YELLOW),
            ),
            { kind: 'restart' },
        ],
    };
}

/** Ctrl+D on an empty line — ends the session, as it does in a real terminal. */
export function on_eof(state: ReplState): ReplResult {
    return {
        state,
        effects: [{ kind: 'write', text: CRLF }, { kind: 'exit' }],
    };
}

/** §3.2's pre-loaded greeting, evaluated before the banner is announced. */
export const PYTHON_GREETING = 'print("Welcome to Momad\'s XP")';

/** Shown while the runtime downloads, by every host. */
export const PYTHON_LOADING = colour('Loading Python runtime…', FG_GREY) + CRLF;
