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
    import { feed, initial_state } from '../../../lib/term/readline';
    import type { ReadlineState } from '../../../lib/term/readline';
    import {
        CLEAR_LINE_RIGHT,
        colour,
        CR,
        CRLF,
        FG_GREY,
        FG_RED,
        FG_YELLOW,
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

    /** §3.2's pre-loaded greeting. */
    const GREETING = 'print("Welcome to Momad\'s XP")';

    const PS1 = colour('>>>', '\x1b[38;2;53;114;165m') + ' ';
    const PS2 = colour('...', FG_GREY) + ' ';

    let term: TerminalHandle | undefined;
    let frame: HTMLIFrameElement | undefined;
    let client: PythonClient | undefined;

    let state: ReadlineState = initial_state();
    let ready = false;
    /** Accumulated lines of a multi-line block, per PyodideConsole. */
    let block: string[] = [];
    let awaiting = false;

    function write(text: string) {
        term?.write(text);
    }
    function write_lines(lines: string[]) {
        for (const line of lines) write(line + CRLF);
    }
    function prompt() {
        write(block.length > 0 ? PS2 : PS1);
    }
    function redraw() {
        const p = block.length > 0 ? PS2 : PS1;
        write(CR + CLEAR_LINE_RIGHT + p + state.buffer);
        const back = state.buffer.length - state.cursor;
        if (back > 0) write(`\x1b[${String(back)}D`);
    }

    function on_runtime(message: FromRuntime) {
        if (term?.is_disposed() === true) return;

        switch (message.kind) {
            case 'loading':
                // Skip the sandbox handshake — it is plumbing, not progress.
                if (message.detail === 'Sandbox ready') return;
                write_lines([colour(`… ${message.detail}`, FG_GREY)]);
                return;
            case 'ready':
                ready = true;
                // SPLIT the banner: it is multi-line, and writing it as one
                // string leaves bare \n characters in the stream. xterm does
                // not translate those — a bare \n moves the cursor DOWN
                // without returning it to column 0, so the second line starts
                // wherever the first ended and the banner staircases. Caught
                // on a parity screenshot, which is what the loop is for.
                write_lines([
                    ...message.banner
                        .trimEnd()
                        .split('\n')
                        .map((l) => l.trimEnd()),
                    '',
                ]);
                prompt();
                term?.focus();
                return;
            case 'stdout':
                write(message.text.replace(/\n/g, CRLF));
                return;
            case 'stderr':
                write(colour(message.text.replace(/\n/g, CRLF), FG_RED));
                return;
            case 'result': {
                awaiting = false;
                if (message.status === 'incomplete') {
                    // PyodideConsole says the block is unfinished — that is
                    // CPython's own codeop, so `def f():` continues correctly.
                    prompt();
                    return;
                }
                block = [];
                if (message.repr != null) write_lines([message.repr]);
                prompt();
                return;
            }
            case 'error':
                ready = false;
                awaiting = false;
                // Clear the block too: leaving it non-empty renders a `...`
                // continuation prompt that can never advance, because submit()
                // returns early while !ready.
                block = [];
                write_lines([
                    '',
                    colour(message.message, FG_YELLOW),
                    colour(
                        'The window still works — close it and try again once you are back online.',
                        FG_GREY,
                    ),
                ]);
                return;
        }
    }

    function submit(line: string) {
        write(CRLF);
        if (!ready) {
            prompt();
            return;
        }
        // ONE LINE, never the joined block. `PyodideConsole.push()` appends to
        // its OWN buffer and re-joins (console.py: `self.buffer.append(line);
        // source = "\n".join(self.buffer)`), so sending the accumulated block
        // double-concatenates it:
        //   push("def f():")                 -> incomplete, buffer kept
        //   push("def f():\n    return 41")  -> IndentationError
        // Every multi-line block was a syntax error and the function was never
        // defined. `block` is kept ONLY to choose PS1 vs PS2.
        block = [...block, line];
        awaiting = true;
        client?.exec(line);
    }

    function on_data(data: string) {
        const result = feed(state, data);
        state = result.state;

        for (const effect of result.effects) {
            if (effect.kind === 'submit') {
                submit(effect.line);
                return;
            }
            if (effect.kind === 'interrupt') {
                // Terminate-and-respawn is the ONLY interrupt available:
                // setInterruptBuffer needs SharedArrayBuffer, which needs
                // COOP/COEP, which §5 records as breaking other embeds here.
                // It is a RESTART, and saying so is the honest UI.
                write('^C' + CRLF);
                write_lines([
                    colour(
                        'Restarting Python… (session state cleared)',
                        FG_YELLOW,
                    ),
                ]);
                ready = false;
                block = [];
                awaiting = false;
                client?.restart();
                return;
            }
            write('\x07'); // the only remaining effect kind
        }
        if (!awaiting) redraw();
    }

    function on_ready() {
        write_lines([colour('Loading Python runtime…', FG_GREY)]);
        if (frame != null) {
            client = create_python_client(frame, {
                on_message: on_runtime,
                greeting: GREETING,
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
