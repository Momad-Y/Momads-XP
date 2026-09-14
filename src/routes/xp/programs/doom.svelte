<svelte:options accessors={true} />

<script lang="ts">
    import { onDestroy, unmount } from 'svelte';
    import Window from '../../../lib/components/xp/Window.svelte';
    import { runningPrograms, systemVolume } from '../../../lib/store';
    import { required } from '../../../lib/types';
    import {
        browser_host,
        start_doom,
        type DoomSession,
    } from '../../../lib/games/doom/dosbox_adapter';
    import type {
        ProgramInstance,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    export let id: string;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;

    let screen_el: HTMLCanvasElement | undefined;
    let shell_el: HTMLDivElement | undefined;
    let session: DoomSession | null = null;
    let ctx: AudioContext | undefined;
    let gain: GainNode | undefined;
    let next_play_at = 0;
    let state: 'idle' | 'starting' | 'running' | 'failed' = 'idle';
    let error_text = '';
    /**
     * Bound to Window's own `minimized` rather than read off
     * `window?.minimized`.
     *
     * Both work — `Window.svelte` declares `accessors={true}`, which exposes
     * its props as signals, so reading `window.minimized` from a reactive
     * statement here does track it. That was checked, not assumed: reverting
     * to `window?.minimized` and removing this binding still passes the
     * minimize/restore E2E.
     *
     * The binding is kept because it is explicit. It states the dependency in
     * the markup instead of relying on accessor-signal behaviour that is easy
     * to break from the other side of the boundary — dropping `accessors`
     * from Window.svelte would silently stop the pause working, and nothing
     * in this file would look wrong.
     */
    let is_minimized = false;
    /** Set before any teardown, so an in-flight `launch()` can bail. */
    let destroyed = false;

    export let options: WindowOptions = {
        title: 'DOOM',
        icon: '/assets/icons/doom.png',
        id,
        width: 640,
        height: 480,
        aspect_ratio: 4 / 3,
    };

    // Read-only derivations. Nothing in a `$:` block writes state.
    $: if (gain != null) gain.gain.value = $systemVolume;
    // Pausing is a method call, not a state write, so a reactive statement is
    // the right place for it — a minimized DOOM must stop burning a core.
    $: sync_running(is_minimized);

    function sync_running(minimized: boolean) {
        if (session == null) return;
        if (minimized) {
            session.pause();
            session.set_muted(true);
        } else {
            session.resume();
            session.set_muted(false);
        }
    }

    /**
     * DOOM starts from a click, and that is not merely a nicety.
     *
     * An AudioContext constructed outside a user gesture starts suspended and
     * plays nothing — `music_player.svelte` documents the same constraint. The
     * context is therefore built SYNCHRONOUSLY here, before the first `await`;
     * anything after one is no longer inside the gesture.
     *
     * It also defers ~4MB of emulator and game bytes until the visitor
     * actually wants DOOM, rather than on window open.
     */
    function begin() {
        if (state !== 'idle') return;
        state = 'starting';

        ctx = new AudioContext();
        gain = ctx.createGain();
        gain.gain.value = $systemVolume;
        gain.connect(ctx.destination);
        next_play_at = ctx.currentTime;

        void launch();
    }

    async function launch() {
        try {
            const canvas = required(screen_el, 'doom canvas');
            /*
             * Hand the canvas to the emulator's worker, which paints it
             * directly. js-dos's worker transport never invokes its own
             * `onFrame` consumer — measured — so forwarding pixels ourselves
             * draws nothing at all. A canvas can only be transferred once,
             * which is fine: DOOM starts once per window.
             */
            const started = await start_doom(
                browser_host,
                canvas.transferControlToOffscreen(),
                push_audio,
            );
            /*
             * The window can be closed DURING the await above — it is several
             * seconds of downloading ~4MB and booting an emulator, which is
             * exactly when someone changes their mind. `onDestroy` has already
             * run by then and saw `session` still null, so without this the
             * emulator it just finished starting would run forever with
             * nobody holding a reference to stop it.
             */
            if (destroyed) {
                void started.dispose();
                return;
            }
            session = started;
            state = 'running';
            screen_el?.focus();
        } catch (error) {
            state = 'failed';
            error_text =
                error instanceof Error ? error.message : 'DOOM failed to start';
        }
    }

    /** Queue one buffer from the emulator, scheduled back to back. */
    function push_audio(samples: Float32Array) {
        const context = ctx;
        const sink = gain;
        if (context == null || sink == null || samples.length === 0) return;
        // js-dos pushes interleaved stereo at 44.1kHz.
        const frames = Math.floor(samples.length / 2);
        if (frames === 0) return;
        const buffer = context.createBuffer(2, frames, 44100);
        const left = buffer.getChannelData(0);
        const right = buffer.getChannelData(1);
        for (let i = 0; i < frames; i++) {
            left[i] = samples[i * 2] ?? 0;
            right[i] = samples[i * 2 + 1] ?? 0;
        }
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(sink);
        // Never schedule in the past, or buffers stack up and crackle.
        next_play_at = Math.max(next_play_at, context.currentTime);
        source.start(next_play_at);
        next_play_at += frames / 44100;
    }

    /**
     * Game input must not reach the desktop.
     *
     * At least six components bind `svelte:window` Escape handlers, and the
     * arrow keys scroll. `stopPropagation` keeps them all out while the canvas
     * holds focus — and only while it holds focus, so Escape still closes menus
     * everywhere else.
     */
    function on_key(event: KeyboardEvent, pressed: boolean) {
        if (session == null) return;
        event.stopPropagation();
        event.preventDefault();
        session.key(event.code, pressed);
    }

    function toggle_fullscreen() {
        const el = shell_el;
        if (el == null) return;
        if (document.fullscreenElement == null) void el.requestFullscreen();
        else void document.exitFullscreen();
    }

    /** Escape is owned by the browser in fullscreen, so the menu gets a button. */
    function send_menu_key() {
        session?.key('Escape', true);
        setTimeout(() => session?.key('Escape', false), 50);
        screen_el?.focus();
    }

    onDestroy(() => {
        destroyed = true;
        // Terminate the emulator and release the audio graph. Without this,
        // opening and closing DOOM leaks a DOSBox worker and an AudioContext
        // per open — the browser caps contexts, so it fails visibly.
        void session?.dispose();
        session = null;
        void ctx?.close();
        ctx = undefined;
        gain = undefined;
    });

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'doom instance'));
    }
</script>

<Window
    {options}
    bind:this={window}
    bind:minimized={is_minimized}
    on_click_close={destroy}
>
    <div
        slot="content"
        class="absolute inset-0 flex flex-col bg-black"
        data-paused={is_minimized}
        bind:this={shell_el}
    >
        <div
            class="flex shrink-0 items-center gap-2 bg-xp-yellow px-2 py-1 text-[11px]"
        >
            <button
                class="border border-slate-500 bg-slate-200 px-2 py-[1px]"
                on:click={toggle_fullscreen}>Full Screen</button
            >
            <button
                class="border border-slate-500 bg-slate-200 px-2 py-[1px] disabled:opacity-50"
                disabled={state !== 'running'}
                on:click={send_menu_key}>Menu (Esc)</button
            >
            <span class="text-slate-600">
                Arrows move · Ctrl fires · Space opens
            </span>
        </div>

        <div class="relative grow">
            <canvas
                bind:this={screen_el}
                class="doom-screen h-full w-full bg-black"
                style:image-rendering="pixelated"
                tabindex="0"
                aria-label="DOOM"
                on:keydown={(e) => {
                    on_key(e, true);
                }}
                on:keyup={(e) => {
                    on_key(e, false);
                }}
                on:click={() => screen_el?.focus()}
            ></canvas>

            {#if state !== 'running'}
                <div
                    class="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black text-center"
                >
                    {#if state === 'failed'}
                        <p class="text-[12px] text-red-400">{error_text}</p>
                    {:else if state === 'starting'}
                        <p class="text-[12px] text-slate-300">Loading DOOM…</p>
                    {:else}
                        <button
                            class="doom-start border border-slate-500 bg-slate-200 px-4 py-2 text-[12px] text-slate-900"
                            on:click={begin}>Click to start DOOM</button
                        >
                        <p class="text-[11px] text-slate-400">
                            Shareware episode one · id Software
                        </p>
                    {/if}
                </div>
            {/if}
        </div>
    </div>
</Window>
