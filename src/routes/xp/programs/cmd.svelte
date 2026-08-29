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
        FG_BRIGHT_GREEN,
        FG_GREY,
    } from '../../../lib/term/ansi';
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

    const HACK_STEPS = [
        'Bypassing mainframe firewall',
        'Injecting recursive polymorphic payload',
        'Rerouting through 7 proxies',
        'Decrypting RSA-8192 with a paperclip',
        'Downloading the entire internet',
    ];

    /**
     * Run an easter egg until it finishes or ANY key cancels it.
     *
     * The `disposed` check is not belt-and-braces: closing the window mid
     * animation leaves this loop scheduled, and a write into a disposed xterm
     * throws asynchronously into no handler.
     */
    async function run_animation(kind: 'matrix' | 'hack') {
        const generation = ++animation_generation;
        animation_running = true;
        const frames = kind === 'matrix' ? 60 : HACK_STEPS.length;
        const superseded = () => generation !== animation_generation;

        for (let i = 0; i < frames; i++) {
            if (superseded() || term?.is_disposed() === true) break;
            if (kind === 'matrix') {
                write(random_matrix_row(70) + CRLF);
                await new Promise((r) => setTimeout(r, 45));
            } else {
                write(colour(`[*] ${HACK_STEPS[i] ?? ''}`, FG_BRIGHT_GREEN));
                for (let d = 0; d < 3; d++) {
                    if (superseded()) break;
                    await new Promise((r) => setTimeout(r, 180));
                    write('.');
                }
                write(CRLF);
            }
        }

        const was_cancelled = superseded();
        if (!was_cancelled) animation_running = false;
        if (term?.is_disposed() === true) return;
        if (kind === 'hack' && !was_cancelled) {
            write(
                colour('ACCESS GRANTED — just kidding.', FG_BRIGHT_GREEN) +
                    CRLF,
            );
        }
        write(CRLF);
        prompt();
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
        if (name === 'matrix' || name === 'hack') {
            void run_animation(name);
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
