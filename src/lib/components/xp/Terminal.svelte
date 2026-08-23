<script lang="ts">
    /**
     * The xterm.js seam, shared by CMD and the Python REPL.
     *
     * Everything DOM-shaped lives here and nothing else does: the line editor,
     * the theme and the ANSI helpers are pure modules under `src/lib/term/`
     * with real unit tests. This component is deliberately thin because
     * `.svelte` is coverage-exempt — the split is what keeps the logic inside
     * the diff-coverage gate instead of hiding from it.
     *
     * Gate 4 removed the plan's jsdom dependency: jsdom returns an empty
     * `getComputedStyle().height` for every element, which is the same NaN
     * that makes `FitAddon.fit()` fail silently — so a jsdom test could not
     * distinguish fixed from broken. Sizing is verified by e2e instead, which
     * is the only environment that can see it.
     */
    import { onMount, onDestroy } from 'svelte';
    import type { Terminal as XTerm } from '@xterm/xterm';
    import type { FitAddon } from '@xterm/addon-fit';
    import {
        TERMINAL_FONT_FAMILY,
        TERMINAL_FONT_SIZE,
        XP_CONSOLE_THEME,
    } from '../../term/theme';

    /** Called once the terminal exists and has been sized. */
    export let on_ready: (term: XTerm) => void = () => {};
    /** Raw chunks from the keyboard/paste, straight to the caller's readline. */
    export let on_data: (data: string) => void = () => {};

    let host: HTMLDivElement;
    let term: XTerm | undefined;
    let fit: FitAddon | undefined;
    let observer: ResizeObserver | undefined;

    /**
     * ONE disposal latch, gating every write path.
     *
     * A late chunk — an easter-egg animation frame, or a `print()` arriving
     * from the Python runtime after the window closed — writes into a disposed
     * xterm and throws asynchronously into no handler. The plan's original
     * version covered the animations and forgot the runtime.
     */
    let disposed = false;
    export function is_disposed(): boolean {
        return disposed;
    }

    /** Safe write: silently drops output once the window has gone. */
    export function write(text: string): void {
        if (disposed || term == null) return;
        term.write(text);
    }

    export function clear(): void {
        if (disposed || term == null) return;
        term.clear();
    }

    export function focus(): void {
        if (disposed || term == null) return;
        term.focus();
    }

    function refit() {
        // `fit()` returns SILENTLY when the parent's computed height is `auto`
        // (parseInt("auto") -> NaN), which is exactly what a flex child without
        // an explicit height gives. The wrapper below therefore sets a real
        // height, and this guard keeps a zero-sized container from producing a
        // 0x0 terminal.
        if (disposed || fit == null) return;
        if (host.clientHeight < 1 || host.clientWidth < 1) return;
        try {
            fit.fit();
        } catch {
            // A fit against a detached node is not worth surfacing to the user.
        }
    }

    onMount(() => {
        // A ref object, not a bare `let`: the flag is written from the cleanup
        // closure and read inside the async one, and TypeScript's flow
        // analysis narrows a plain boolean to `false` across that boundary.
        const mount_state = { cancelled: false };
        void (async () => {
            // Dynamically imported so xterm (~89 KB gz) stays out of the entry
            // bundle; `verify-build.mjs` asserts no `.xterm-` rules reach the
            // entry CSS.
            const [{ Terminal }, { FitAddon }] = await Promise.all([
                import('@xterm/xterm'),
                import('@xterm/addon-fit'),
            ]);
            await import('@xterm/xterm/css/xterm.css');
            if (mount_state.cancelled) return;

            term = new Terminal({
                fontFamily: TERMINAL_FONT_FAMILY,
                fontSize: TERMINAL_FONT_SIZE,
                theme: { ...XP_CONSOLE_THEME },
                cursorBlink: true,
                convertEol: false,
                scrollback: 2000,
            });
            fit = new FitAddon();
            term.loadAddon(fit);
            term.open(host);

            // Keyboard is bound HERE, on xterm's own textarea — never on
            // `svelte:window`. session-handoff.md §8 rule 2 names "four
            // svelte:window listeners each deciding in isolation" as the root
            // cause of three shipped defects, and Escape belongs to
            // Dialog.svelte.
            term.onData((data) => {
                if (!disposed) on_data(data);
            });

            // Nothing in this repo drove FitAddon before — there was zero
            // ResizeObserver anywhere in src/ — so a resized window left the
            // terminal frozen at 80x24 with no error to debug from.
            observer = new ResizeObserver(() => {
                refit();
            });
            observer.observe(host);

            // Deferred a frame past the window's open transition: measuring
            // mid-animation yields a size that is about to change.
            requestAnimationFrame(() => {
                refit();
                if (!disposed && term != null) on_ready(term);
            });
        })();

        return () => {
            mount_state.cancelled = true;
        };
    });

    onDestroy(() => {
        disposed = true;
        observer?.disconnect();
        observer = undefined;
        term?.dispose();
        term = undefined;
        fit = undefined;
    });
</script>

<!--
    An EXPLICIT height, not `flex-1` alone: FitAddon reads
    getComputedStyle(parent).height and parses it as an integer, so a parent
    resolving to `auto` silently produces NaN and fit() no-ops.
-->
<div class="relative grow overflow-hidden bg-black" style:min-height="0">
    <div bind:this={host} class="absolute inset-0"></div>
</div>
