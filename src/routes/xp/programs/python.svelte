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
    import type { FromRuntime } from '../../../lib/python/protocol';
    import {
        initial_repl_state,
        on_eof,
        on_interrupt,
        on_runtime_message,
        on_submit,
        prompt_text,
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
    import { CLEAR_LINE_RIGHT, CR } from '../../../lib/term/ansi';
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

    function write(text: string) {
        term?.write(text);
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

    function redraw() {
        const p = prompt_text(repl);
        write(CR + CLEAR_LINE_RIGHT + p + line_state.buffer);
        const back = line_state.buffer.length - line_state.cursor;
        if (back > 0) write(`\x1b[${String(back)}D`);
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
            write('\x07'); // the only remaining effect kind
        }
        if (!repl.awaiting) redraw();
    }

    function on_ready() {
        write(PYTHON_LOADING);
        if (frame != null) {
            client = create_python_client(frame, {
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
