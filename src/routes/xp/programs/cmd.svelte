<svelte:options accessors={true} />

<script lang="ts">
    import { onDestroy, tick, unmount } from 'svelte';
    import Window from '../../../lib/components/xp/Window.svelte';
    import { runningPrograms } from '../../../lib/store';
    import { required } from '../../../lib/types';
    import Terminal from '../../../lib/components/xp/Terminal.svelte';
    import { profile } from '../../../lib/profile';
    import { execute, with_trailing_blank } from '../../../lib/cmd/registry';
    import { DEFAULT_ACCENT, run_color } from '../../../lib/cmd/color';
    import { feed, initial_state } from '../../../lib/term/readline';
    import type { ReadlineState } from '../../../lib/term/readline';
    import {
        CLEAR_LINE_RIGHT,
        CLEAR_SCREEN,
        colour,
        CR,
        CRLF,
        CURSOR_HOME,
        DIM,
        ETX,
        FG_BRIGHT_GREEN,
        FG_GREY,
        HIDE_CURSOR,
        SHOW_CURSOR,
    } from '../../../lib/term/ansi';
    import {
        advance,
        init_columns,
        MATRIX_FRAME_MS,
        MATRIX_INTRO,
        MATRIX_INTRO_PAUSE_MS,
        render_frame,
    } from '../../../lib/cmd/matrix';
    import {
        create_python_client,
        SANDBOX_ATTR,
        SANDBOX_URL,
    } from '../../../lib/python/client';
    import type { PythonClient } from '../../../lib/python/client';
    import type { FromRuntime } from '../../../lib/python/protocol';
    import {
        initial_repl_state,
        on_eof as py_on_eof,
        on_interrupt as py_on_interrupt,
        on_runtime_message,
        on_submit as py_on_submit,
        prompt_text,
        PYTHON_GREETING,
        PYTHON_LOADING,
    } from '../../../lib/python/repl';
    import type {
        ReplEffect,
        ReplResult,
        ReplState,
    } from '../../../lib/python/repl';
    import {
        BEAT_GAP_MS,
        DOT_INTERVAL_MS,
        HACK_SCRIPT,
        PROGRESS_FRAME_MS,
        PROGRESS_WIDTH,
        progress_bar,
    } from '../../../lib/cmd/hack';
    import {
        TERMINAL_MIN_HEIGHT,
        TERMINAL_MIN_WIDTH,
    } from '../../../lib/term/theme';
    import type { TerminalHandle } from '../../../lib/term/theme';
    import type {
        ProgramInstance,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    export let id: string;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;
    // `const`, not `let`: work_space passes this to every program, but a
    // terminal has no child modal to mount into. `export let` would add a
    // warning to a count CLAUDE.md forbids growing.
    export const parentNode: HTMLElement | undefined = undefined;
    export let exec_path: string | undefined = undefined;

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'cmd instance'));
    }

    const SHELL_TITLE = 'momad@xp:~';
    /**
     * Real terminals retitle themselves for the foreground program, and with
     * the shell and the interpreter now sharing one window it is the only
     * outward sign of which is reading your keystrokes. The ICON deliberately
     * does not change: someone hunting the taskbar for their terminal looks for
     * the terminal's icon.
     */
    const PYTHON_TITLE = 'momad@xp:~ — python';

    export let options: WindowOptions = {
        title: SHELL_TITLE,
        icon: '/images/xp/icons/CommandPrompt.png',
        id,
        exec_path,
        width: 720,
        height: 460,
        min_width: TERMINAL_MIN_WIDTH,
        min_height: TERMINAL_MIN_HEIGHT,
        resizable: true,
    };

    const PROMPT = colour('momad@xp', FG_BRIGHT_GREEN) + ':~$ ';

    let term: TerminalHandle | undefined;
    let state: ReadlineState = initial_state();

    /**
     * `python` runs IN this window, as a shell runs a child process — so the
     * terminal has two modes and the shell is only one of them.
     *
     * The REPL's semantics are NOT reimplemented here. They live in
     * `src/lib/python/repl.ts` and are shared with the standalone Python app,
     * because two copies of "one line per push, idle Ctrl+C survives, exit()
     * is intercepted" would drift — and both of those rules have already been
     * wrong once each.
     */
    let mode: 'shell' | 'python' = 'shell';
    let py_frame: HTMLIFrameElement | undefined;
    let py_client: PythonClient | undefined;
    let py: ReplState = initial_repl_state();
    /**
     * A SEPARATE line editor for the interpreter.
     *
     * Sharing one history would put `ls` and `import sys` in the same Up-arrow
     * ring, which is not how running python from a shell behaves — and the
     * shell's history has to survive the session and still be there afterwards.
     */
    let py_line: ReadlineState = initial_state();

    /**
     * Easter-egg cancellation, as a GENERATION COUNTER rather than a boolean
     * latch.
     *
     * Two reasons. First, this repo has a scar from a latch assumed to reset
     * itself (`rename_cancelled`), and a counter cannot get stuck: every run
     * takes a fresh generation, so a stale loop simply loses the comparison.
     * Second, a boolean mutated from another closure gets narrowed to `false`
     * by TypeScript's flow analysis, which turns the guard into dead code the
     * linter then rejects.
     */
    /**
     * PER WINDOW, like cmd.exe's `color` — which affects the console it was
     * typed into and no other. A shared store would recolour every open
     * terminal at once, which is not what the command means.
     */
    // Explicitly `string`: XP_CONSOLE_THEME is `as const`, so DEFAULT_ACCENT
    // narrows to its literal and would reject any other colour.
    let accent: string = DEFAULT_ACCENT;

    let animation_generation = 0;
    let animation_running = false;

    /**
     * Returns the terminal to a usable state and reissues the prompt.
     *
     * Per animation, because they do not leave the same mess: `hack` scrolls
     * normally and only needs a newline, while `matrix` has hidden the cursor
     * and painted over the whole grid. Cancellation used to write CRLF +
     * prompt unconditionally from `on_data`, which would strand the matrix
     * with no cursor.
     */
    let animation_teardown: () => void = () => {};

    /**
     * True while ONLY Ctrl+C ends the running animation.
     *
     * `hack` is finite, so any key skipping it is a courtesy. `matrix` runs
     * until interrupted, and for a full-screen effect a stray keystroke ending
     * it is the wrong default — so it swallows everything else, and its intro
     * says so before it starts.
     */
    let animation_needs_ctrl_c = false;

    function cancel_animation() {
        animation_generation++;
        animation_running = false;
        const teardown = animation_teardown;
        animation_teardown = () => {};
        animation_needs_ctrl_c = false;
        teardown();
    }

    function write(text: string) {
        term?.write(text);
    }

    function write_lines(lines: string[]) {
        for (const line of lines) write(line + CRLF);
    }

    function prompt() {
        write(PROMPT);
    }

    /** Redraw the current input line in place, cursor included. */
    function redraw() {
        // \r to column 0, clear right, reprint. Cheaper and steadier than
        // tracking individual cursor moves, and it cannot desynchronise.
        //
        // Mode-aware on BOTH counts: the prompt and the buffer both come from
        // whichever session is in the foreground. Reprinting the shell's
        // prompt in front of a Python line is how a redraw desynchronises.
        const line = mode === 'python' ? py_line : state;
        const p = mode === 'python' ? prompt_text(py) : PROMPT;
        write(CR + CLEAR_LINE_RIGHT + p + line.buffer);
        const back = line.buffer.length - line.cursor;
        if (back > 0) write(`\x1b[${String(back)}D`);
    }

    // ---------------------------------------------------------------------
    // The hosted Python session.
    // ---------------------------------------------------------------------

    function run_python_effects(effects: readonly ReplEffect[]) {
        for (const effect of effects) {
            switch (effect.kind) {
                case 'write':
                    write(effect.text);
                    break;
                case 'exec':
                    py_client?.exec(effect.source);
                    break;
                case 'restart':
                    py_client?.restart();
                    break;
                case 'focus':
                    term?.focus();
                    break;
                case 'exit':
                    // The ONE policy this host decides differently from the
                    // standalone app: `exit()` and Ctrl+D end the interpreter
                    // and hand the shell back, exactly as they do when you run
                    // python from a real terminal. Closing the window here
                    // would throw away the shell session too.
                    stop_python();
                    break;
            }
        }
    }

    function apply_python(result: ReplResult) {
        py = result.state;
        run_python_effects(result.effects);
    }

    function on_python_message(message: FromRuntime) {
        // A late message from a runtime whose session has already ended must
        // not paint over the shell prompt.
        if (mode !== 'python' || term?.is_disposed() === true) return;
        apply_python(on_runtime_message(py, message));
    }

    async function start_python() {
        mode = 'python';
        py = initial_repl_state();
        py_line = initial_state();
        window?.update_title(PYTHON_TITLE);
        write(PYTHON_LOADING);

        // The iframe is rendered by the `{#if}` below, so it does not exist
        // until Svelte has flushed. Creating the client before that would
        // attach to nothing and the handshake would never start.
        await tick();
        if (py_frame == null || term?.is_disposed() === true) return;
        py_client = create_python_client(py_frame, {
            on_message: on_python_message,
            greeting: PYTHON_GREETING,
        });
    }

    function stop_python() {
        py_client?.dispose();
        py_client = undefined;
        // Dropping `mode` unmounts the iframe, which takes the worker and the
        // ~30 MB runtime with it. Keeping it alive so a later `python` starts
        // instantly would be a lie about what `exit()` did, and would leak a
        // runtime per session the visitor ever opened.
        mode = 'shell';
        py = initial_repl_state();
        window?.update_title(SHELL_TITLE);
        prompt();
    }

    function on_python_data(data: string) {
        const result = feed(py_line, data);
        py_line = result.state;

        for (const effect of result.effects) {
            if (effect.kind === 'submit') {
                apply_python(py_on_submit(py, effect.line));
                return;
            }
            if (effect.kind === 'interrupt') {
                apply_python(py_on_interrupt(py));
                return;
            }
            if (effect.kind === 'eof') {
                apply_python(py_on_eof(py));
                return;
            }
            write('\x07'); // the only remaining effect kind
        }
        if (!py.awaiting) redraw();
    }

    function sleep(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Hand the prompt back — but ONLY for the run that is still current.
     *
     * A cancelled run must not write here: `on_data` already emitted the CRLF
     * and reissued the prompt the moment the key landed, so doing it again
     * leaves a duplicate prompt on screen. The generation check covers the
     * second case too, where a new egg has already started and the outgoing
     * loop would otherwise print a prompt into the middle of it.
     */
    function finish_animation(generation: number) {
        if (generation !== animation_generation) return;
        animation_running = false;
        animation_teardown = () => {};
        if (term?.is_disposed() === true) return;
        write(CRLF);
        prompt();
    }

    /**
     * Full-screen rain, until Ctrl+C.
     *
     * The `disposed` check inside the loop is not belt-and-braces: closing the
     * window mid-animation leaves the loop scheduled, and a write into a
     * disposed xterm throws asynchronously into no handler. It is the ONLY
     * thing besides Ctrl+C that ends this one, so it carries more weight here
     * than it did when the egg stopped by itself after 60 frames.
     */
    async function run_matrix() {
        const generation = ++animation_generation;
        animation_running = true;
        animation_needs_ctrl_c = true;
        animation_teardown = () => {
            // Cursor back BEFORE the clear, so a teardown that races disposal
            // cannot leave the terminal permanently cursorless.
            write(SHOW_CURSOR + CLEAR_SCREEN);
            write('^C' + CRLF);
            prompt();
        };
        const superseded = () => generation !== animation_generation;

        // Say how to leave BEFORE trapping the keyboard, and give it a beat to
        // be read. Starting the rain instantly would bury the one line that
        // explains the only way out.
        for (const line of MATRIX_INTRO) {
            write(
                colour(
                    line.text,
                    line.aside ? DIM + FG_BRIGHT_GREEN : FG_BRIGHT_GREEN,
                ) + CRLF,
            );
        }
        await sleep(MATRIX_INTRO_PAUSE_MS);
        if (superseded() || term?.is_disposed() === true) return;

        write(CLEAR_SCREEN + HIDE_CURSOR);

        let grid = required(term, 'terminal').size();
        let columns = init_columns(grid.cols, grid.rows);

        while (!superseded() && term?.is_disposed() !== true) {
            // Re-read every frame: the window is resizable, and a grid frozen
            // at the size the egg started at would leave a dead margin down one
            // side after a drag.
            const size = required(term, 'terminal').size();
            if (size.cols !== grid.cols || size.rows !== grid.rows) {
                grid = size;
                columns = init_columns(grid.cols, grid.rows);
            }

            // Home rather than clear: clearing first flashes the background
            // between frames, and every cell is overwritten anyway.
            write(CURSOR_HOME + render_frame(columns, grid.rows).join(CRLF));
            columns = advance(columns, grid.rows);
            await sleep(MATRIX_FRAME_MS);
        }

        // No `finish_animation` here. This egg only ever ends by cancellation,
        // which has already run the teardown, or by disposal, where there is
        // nothing left to write to.
        if (!superseded()) animation_running = false;
    }

    /**
     * Walk `HACK_SCRIPT`. The component owns the CLOCK and nothing else — what
     * is said lives in `src/lib/cmd/hack.ts`, where it is unit-tested.
     *
     * EVERY write goes through the accent, the trailing dots included. They
     * used to be written bare, so the step text followed `color` while the dots
     * after it stayed in the default foreground.
     */
    async function run_hack() {
        const generation = ++animation_generation;
        animation_running = true;
        animation_teardown = () => {
            write(CRLF);
            prompt();
        };
        const superseded = () => generation !== animation_generation;
        const accent = (text: string) => {
            write(colour(text, FG_BRIGHT_GREEN));
        };
        // DIM over the SAME palette slot, not grey: an aside needs to read
        // quieter than the steps without dropping off the accent that `color`
        // repaints.
        const aside = (text: string) => {
            write(colour(text, DIM + FG_BRIGHT_GREEN));
        };

        for (const beat of HACK_SCRIPT) {
            if (superseded() || term?.is_disposed() === true) break;

            if (beat.kind === 'step') {
                accent(`[*] ${beat.text}`);
                for (let d = 0; d < beat.dots; d++) {
                    await sleep(DOT_INTERVAL_MS);
                    if (superseded()) break;
                    accent('.');
                }
                if (superseded()) break;
                accent(` ${beat.tag}`);
                write(CRLF);
            } else if (beat.kind === 'progress') {
                accent(`[*] ${beat.label}`);
                write(CRLF);
                for (let f = 0; f <= PROGRESS_WIDTH; f++) {
                    if (superseded()) break;
                    // CR, not a fresh line: the bar redraws in place. Its width
                    // is constant by construction, so nothing is left behind.
                    write(CR);
                    accent(progress_bar(f));
                    await sleep(PROGRESS_FRAME_MS);
                }
                if (superseded()) break;
                write(CRLF);
            } else if (beat.kind === 'line') {
                accent(beat.text);
                write(CRLF);
            } else {
                aside(beat.text);
                write(CRLF);
            }

            await sleep(BEAT_GAP_MS);
        }

        finish_animation(generation);
    }

    function submit(line: string) {
        write(CRLF);
        const name = line.trim().split(/\s+/)[0] ?? '';

        // `exit` closes the terminal, as it does in any shell. Not a registry
        // command: it acts on the WINDOW rather than producing output, and the
        // command layer is deliberately pure `(args, profile) => string[]`.
        if (name === 'exit' || name === 'quit') {
            destroy();
            return;
        }

        if (name === 'color') {
            const args = line.trim().split(/\s+/).slice(1);
            const result = run_color(args, accent);
            if (result.accent != null) {
                accent = result.accent;
                // Applied BEFORE the confirmation is written, so the line
                // announcing the change is itself drawn in the new colour.
                term?.set_accent(accent);
            }
            write_lines(with_trailing_blank(result.lines));
            prompt();
            return;
        }
        if (name === 'clear') {
            write(CLEAR_SCREEN);
            prompt();
            return;
        }
        if (name === 'python') {
            void start_python();
            return;
        }
        if (name === 'matrix') {
            void run_matrix();
            return;
        }
        if (name === 'hack') {
            void run_hack();
            return;
        }

        write_lines(execute(line, profile));
        prompt();
    }

    function on_data(data: string) {
        // A running animation swallows the keystroke and stops — every real
        // terminal toy behaves this way, and a visitor who cannot type is
        // trapped.
        if (animation_running) {
            // `matrix` runs until interrupted and ignores everything else; its
            // intro is what makes that discoverable. `hack` is finite, so any
            // key skips it.
            if (animation_needs_ctrl_c && data !== ETX) return;
            cancel_animation();
            return;
        }

        if (mode === 'python') {
            on_python_data(data);
            return;
        }

        const result = feed(state, data);
        state = result.state;

        for (const effect of result.effects) {
            if (effect.kind === 'submit') {
                submit(effect.line);
                return;
            }
            if (effect.kind === 'interrupt') {
                write('^C' + CRLF);
                prompt();
                return;
            }
            if (effect.kind === 'eof') {
                // Ctrl+D on an empty line closes the terminal, as it does in
                // any real shell.
                write(CRLF);
                destroy();
                return;
            }
            write('\x07'); // bell — the only remaining effect kind
        }
        redraw();
    }

    onDestroy(() => {
        // Closing the window mid-session must not leave the client listening on
        // the shared `window` message bus.
        py_client?.dispose();
        py_client = undefined;
    });

    function on_ready() {
        // §3.2's startup banner. The third line was amended for Phase 3: the
        // original told visitors to try `ls` and `cd experience`, which are
        // Phase 6 commands — so the terminal's own first screen would have
        // advertised two commands that answer "not available yet".
        write_lines([
            colour("Welcome to Momad's XP Terminal", FG_BRIGHT_GREEN),
            "Type 'help' to see available commands.",
            colour(
                "Type 'about' to start, or 'projects' to see what I have built.",
                FG_GREY,
            ),
            '',
        ]);
        prompt();
        term?.focus();
    }
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div slot="content" class="flex h-full w-full flex-col bg-black">
        <Terminal bind:this={term} {on_ready} {on_data} />
        <!--
            Mounted only while a session is running, so leaving the interpreter
            actually frees the runtime.

            The isolation boundary is the same as the standalone app's:
            `allow-scripts` WITHOUT allow-same-origin gives the runtime an
            opaque origin — no IndexedDB (the VFS), Origin: null on every
            fetch, and no access to our storage or cookies. Hidden because it
            renders nothing; the terminal above is the UI.
        -->
        {#if mode === 'python'}
            <iframe
                bind:this={py_frame}
                title="Python runtime (isolated)"
                src={SANDBOX_URL}
                sandbox={SANDBOX_ATTR}
                referrerpolicy="no-referrer"
                class="pointer-events-none absolute h-0 w-0 border-0 opacity-0"
            ></iframe>
        {/if}
    </div>
</Window>
