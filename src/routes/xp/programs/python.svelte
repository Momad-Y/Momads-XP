<svelte:options accessors={true} />

<script lang="ts">
    import { onDestroy, unmount } from 'svelte';
    import Window from '../../../lib/components/xp/Window.svelte';
    import Terminal from '../../../lib/components/xp/Terminal.svelte';
    import { runningPrograms } from '../../../lib/store';
    import { required } from '../../../lib/types';
    import {
        create_python_client,
        SANDBOX_ATTR,
        SANDBOX_URL,
    } from '../../../lib/python/client';
    import type { PythonClient } from '../../../lib/python/client';
    import {
        apply_save,
        reset_save_gate,
        save_gate,
    } from '../../../lib/python/host_fs';
    import type { SaveRequest } from '../../../lib/python/save_limits';
    import type { FromRuntime } from '../../../lib/python/protocol';
    import {
        initial_repl_state,
        on_eof,
        on_interrupt,
        on_runtime_message,
        on_submit,
        prompt_text,
        BUSY_HINT_TEXT,
        PYTHON_GREETING,
        PYTHON_LOADING,
    } from '../../../lib/python/repl';
    import type {
        ReplEffect,
        ReplResult,
        ReplState,
    } from '../../../lib/python/repl';
    import { feed, initial_state } from '../../../lib/term/readline';
    import type { ReadlineState } from '../../../lib/term/readline';
    import {
        colour,
        CR,
        CRLF,
        CSI,
        FG_GREY,
        FG_YELLOW,
    } from '../../../lib/term/ansi';
    import {
        DEFAULT_COLS,
        render_line,
        row_of,
    } from '../../../lib/term/render';
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
    export const parentNode: HTMLElement | undefined = undefined;
    export let exec_path: string | undefined = undefined;

    export function destroy() {
        // A session the visitor ended deliberately gets a fresh budget; one
        // we killed for flooding does not.
        reset_save_gate();
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'python instance'));
    }

    export let options: WindowOptions = {
        title: 'Python',
        // Python.png ships in the icon set and was unused — the Start Menu
        // passed the generic ApplicationWindow.png. §3.2 asks for "Python
        // branding" and the correct icon was simply never wired up.
        icon: '/images/xp/icons/Python.png',
        id,
        exec_path,
        width: 720,
        height: 460,
        min_width: TERMINAL_MIN_WIDTH,
        min_height: TERMINAL_MIN_HEIGHT,
        resizable: true,
    };

    let term: TerminalHandle | undefined;
    let frame: HTMLIFrameElement | undefined;
    let client: PythonClient | undefined;

    /**
     * Line editing and REPL semantics are BOTH pure modules now — `readline.ts`
     * and `repl.ts`. This component is the host: it owns the iframe, the
     * client, the xterm handle, and the one policy the module deliberately does
     * not decide, which is what `exit` means. Here it closes the window; a
     * session hosted inside CMD returns to the shell instead.
     */
    let line_state: ReadlineState = initial_state();
    let repl: ReplState = initial_repl_state();

    /**
     * Where `redraw` last left the cursor, and where the line it drew ends,
     * both as COLUMN OFFSETS from the line's first cell.
     *
     * Offsets rather than rows because the window is resizable: xterm reflows
     * a wrapped line when the width changes, so a stored row is measured
     * against a width that no longer exists.
     *
     * Two of them because they are genuinely different places. After Home, or
     * any left-arrow, the cursor sits in the MIDDLE of a wrapped line while
     * the line ends two rows further down — and anything written next has to
     * step down there first or it lands on top of what the visitor typed.
     */
    let cursor_offset = 0;
    let end_offset = 0;

    /**
     * Step off the input line before writing anything else.
     *
     * Every non-redraw write goes through here, so no call site has to
     * remember. `0/0` is the resting state, and the guard makes this a no-op
     * everywhere there is no input line to leave — including the `hack` egg's
     * dot loop, which writes without a newline and must not be sent to
     * column 0.
     */
    function leave_input_line() {
        if (end_offset === 0 && cursor_offset === 0) return;
        const cols = term?.size().cols ?? DEFAULT_COLS;
        const down = row_of(end_offset, cols) - row_of(cursor_offset, cols);
        if (down > 0) term?.write(`${CSI}${String(down)}B${CR}`);
        cursor_offset = 0;
        end_offset = 0;
    }

    function write(text: string) {
        leave_input_line();
        term?.write(text);
    }

    /**
     * The bell, which moves the cursor NOWHERE.
     *
     * Deliberately not `write`: routing a zero-motion byte through it would
     * reset the offsets while the cursor stayed on a wrapped line's second
     * row, and the next redraw would then fail to climb — reprinting the
     * prompt mid-line, which is the exact defect this whole mechanism exists
     * to prevent. Tab-with-no-match and Ctrl+D-mid-line both reach it.
     */
    function bell() {
        term?.write('\x07');
    }

    function run_effects(effects: readonly ReplEffect[]) {
        for (const effect of effects) {
            switch (effect.kind) {
                case 'write':
                    write(effect.text);
                    break;
                case 'exec':
                    client?.exec(effect.source);
                    break;
                case 'restart':
                    client?.restart();
                    break;
                case 'focus':
                    term?.focus();
                    break;
                case 'exit':
                    destroy();
                    break;
            }
        }
    }

    function apply(result: ReplResult) {
        repl = result.state;
        run_effects(result.effects);
    }

    /**
     * Row arithmetic in `src/lib/term/render.ts`, shared with CMD. A traceback
     * recalled from history, or any line longer than the window is wide, wraps
     * — and the single-row redraw this replaced reprinted the prompt onto the
     * last visual row every keystroke thereafter.
     */

    /**
     * A `save` from the runtime. Refusals are printed, not raised: by the time
     * this runs the visitor's `open()` has already returned, so nothing can
     * throw into it. One statement late beats silence, which is the only
     * unacceptable option.
     */
    async function handle_save(message: { files: SaveRequest[] }) {
        const outcome = await apply_save(message, save_gate());
        // A late save from a session that has already ended must not paint
        // over the shell prompt — the same guard `on_python_message` carries.
        if (term?.is_disposed() === true) return;

        for (const line of outcome.lines) {
            write(colour(line, FG_YELLOW) + CRLF);
        }
        // The `result` message has already printed the prompt, so anything
        // written after it leaves the visitor with no prompt until they press
        // a key. Reissue it, as `read_and_print` does.
        if (outcome.lines.length > 0) prompt();

        if (outcome.settled.length > 0) client?.settle(outcome.settled);

        if (outcome.terminate) {
            client?.restart();
        }
    }

    function redraw() {
        const rendered = render_line({
            prompt: prompt_text(repl),
            buffer: line_state.buffer,
            cursor: line_state.cursor,
            cols: term?.size().cols ?? DEFAULT_COLS,
            prev_cursor_offset: cursor_offset,
        });
        term?.write(rendered.text);
        cursor_offset = rendered.cursor_offset;
        end_offset = rendered.end_offset;
    }

    function on_runtime(message: FromRuntime) {
        if (term?.is_disposed() === true) return;
        apply(on_runtime_message(repl, message));
    }

    function on_data(data: string) {
        const result = feed(line_state, data);
        line_state = result.state;

        for (const effect of result.effects) {
            if (effect.kind === 'submit') {
                apply(on_submit(repl, effect.line));
                return;
            }
            if (effect.kind === 'interrupt') {
                apply(on_interrupt(repl));
                return;
            }
            if (effect.kind === 'eof') {
                apply(on_eof(repl));
                return;
            }
            if (effect.kind === 'complete') {
                // Tab does nothing in the interpreter. It was silently
                // swallowed by the line editor before completion existed, so
                // ignoring it explicitly is the no-change behaviour; falling
                // through to the bell below would be a regression.
                return;
            }
            bell(); // the only remaining effect kind
        }
        if (!repl.awaiting) redraw();
    }

    function on_ready() {
        write(PYTHON_LOADING);
        if (frame != null) {
            client = create_python_client(frame, {
                on_save: (message) => {
                    void handle_save(message);
                },
                on_busy: () => {
                    // The runtime is fine and the page is fine — the terminal
                    // just had nothing to say. Tell the visitor Ctrl+C exists.
                    write(colour(BUSY_HINT_TEXT, FG_GREY) + CRLF);
                },
                on_message: on_runtime,
                greeting: PYTHON_GREETING,
            });
        }
    }

    onDestroy(() => {
        client?.dispose();
        client = undefined;
    });
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div slot="content" class="flex h-full w-full flex-col bg-black">
        <Terminal bind:this={term} {on_ready} {on_data} />
        <!--
            The isolation boundary. `allow-scripts` WITHOUT allow-same-origin
            gives the runtime an opaque origin: no IndexedDB (the VFS),
            Origin: null on every fetch, and no access to our storage or
            cookies. Hidden because it renders nothing — the terminal above is
            the UI.
        -->
        <iframe
            bind:this={frame}
            title="Python runtime (isolated)"
            src={SANDBOX_URL}
            sandbox={SANDBOX_ATTR}
            referrerpolicy="no-referrer"
            class="pointer-events-none absolute h-0 w-0 border-0 opacity-0"
        ></iframe>
    </div>
</Window>
