<svelte:options accessors={true} />

<script lang="ts">
    import { unmount } from 'svelte';
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
        DIM,
        FG_BRIGHT_GREEN,
        FG_GREY,
    } from '../../../lib/term/ansi';
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

    export let options: WindowOptions = {
        title: 'momad@xp:~',
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

    function cancel_animation() {
        animation_generation++;
        animation_running = false;
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
        write(CR + CLEAR_LINE_RIGHT + PROMPT + state.buffer);
        const back = state.buffer.length - state.cursor;
        if (back > 0) write(`\x1b[${String(back)}D`);
    }

    const MATRIX_GLYPHS =
        'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789';

    function random_matrix_row(width: number): string {
        let row = '';
        for (let i = 0; i < width; i++) {
            row +=
                Math.random() < 0.12
                    ? (MATRIX_GLYPHS[
                          Math.floor(Math.random() * MATRIX_GLYPHS.length)
                      ] ?? ' ')
                    : ' ';
        }
        return colour(row, FG_BRIGHT_GREEN);
    }

    const MATRIX_FRAME_COUNT = 60;
    const MATRIX_FRAME_MS = 45;

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
        if (term?.is_disposed() === true) return;
        write(CRLF);
        prompt();
    }

    /**
     * The `disposed` check inside the loops is not belt-and-braces: closing the
     * window mid-animation leaves the loop scheduled, and a write into a
     * disposed xterm throws asynchronously into no handler.
     */
    async function run_matrix() {
        const generation = ++animation_generation;
        animation_running = true;
        const superseded = () => generation !== animation_generation;

        for (let i = 0; i < MATRIX_FRAME_COUNT; i++) {
            if (superseded() || term?.is_disposed() === true) break;
            write(random_matrix_row(70) + CRLF);
            await sleep(MATRIX_FRAME_MS);
        }

        finish_animation(generation);
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
            cancel_animation();
            write(CRLF);
            prompt();
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
    </div>
</Window>
