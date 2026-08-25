<svelte:options accessors={true} />

<script lang="ts">
    import { onDestroy, unmount } from 'svelte';
    import Window from '../../../lib/components/xp/Window.svelte';
    import { runningPrograms, systemVolume } from '../../../lib/store';
    import { required } from '../../../lib/types';
    import { TRACKS, format_duration } from '../../../lib/music/manifest';
    import {
        bar_heights,
        create_source_cache,
        effective_volume,
        next_index,
        prev_index,
        progress_ratio,
        seek_target,
    } from '../../../lib/music/player';
    import type {
        ProgramInstance,
        VfsItem,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    export let id: string;
    /**
     * Set when launched through Explorer's Open With on an .mp3. Without this
     * the clicked file was discarded and playback always started at TRACKS[0],
     * which made the second `doctypes['.mp3']` entry — the whole reason the
     * association was changed — do nothing.
     */
    export let fs_item: VfsItem | undefined = undefined;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;
    export const parentNode: HTMLElement | undefined = undefined;
    export let exec_path: string | undefined = undefined;

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'music player instance'));
    }

    export let options: WindowOptions = {
        title: 'Windows Media Player',
        icon: '/images/xp/icons/WindowsMediaPlayer9.png',
        id,
        exec_path,
        width: 480,
        height: 470,
        min_width: 400,
        min_height: 460,
        resizable: true,
    };

    let audio: HTMLAudioElement | undefined;
    let canvas: HTMLCanvasElement | undefined;

    /** Index of the track a launch payload names, or 0. */
    function index_for(item: VfsItem | undefined): number {
        if (item == null) return 0;
        const found = TRACKS.findIndex(
            (t) => t.id === item.id || t.url === item.url,
        );
        return found >= 0 ? found : 0;
    }

    let index = index_for(fs_item);
    let paused = true;
    let current_time = 0;
    let duration = TRACKS[0]?.duration_s ?? 0;
    let app_volume = 0.8;

    $: track = TRACKS[index];
    $: output_volume = effective_volume(app_volume, $systemVolume);
    $: if (audio != null) audio.volume = output_volume;
    $: ratio = progress_ratio(current_time, duration);

    // ── Web Audio ───────────────────────────────────────────────────────────
    let ctx: AudioContext | undefined;
    let analyser: AnalyserNode | undefined;
    let frame_id: number | undefined;

    /**
     * One source node per element, forever.
     *
     * `createMediaElementSource()` is a PERMANENT one-shot binding on the
     * element — a second call throws InvalidStateError, and the check is on
     * the element, so it throws even from a different AudioContext. Without
     * this cache: play works, pause then play throws.
     */
    const source_for = create_source_cache((element: HTMLMediaElement) =>
        required(ctx, 'audio context').createMediaElementSource(element),
    );

    function ensure_graph() {
        // Called ONLY from the play click. An AudioContext created without a
        // user gesture is born suspended, which yields a dead visualiser and
        // no error to explain it.
        if (audio == null) return;
        ctx ??= new AudioContext();
        // resume() FIRST and synchronously: `await ctx.resume()` outside a
        // gesture never settles — the promise neither resolves nor rejects —
        // and any await before it loses transient activation.
        void ctx.resume();

        if (analyser == null) {
            analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.75;
            const source = source_for(audio);
            source.connect(analyser);
            // Connect through to the destination, or the element's own output
            // is muted: once a MediaElementAudioSourceNode exists, the audio
            // is heard ONLY through the graph.
            analyser.connect(ctx.destination);
        }
        // ONLY start the loop if one is not already running. ensure_graph() is
        // called from both play and track-select, and draw() re-schedules
        // itself unconditionally — so every press spawned another rAF chain,
        // each running getByteFrequencyData plus 28 fillRects per frame, while
        // onDestroy could cancel only the newest handle.
        if (frame_id == null) draw();
    }

    function draw() {
        if (analyser == null || canvas == null) return;
        const context = canvas.getContext('2d');
        if (context == null) return;

        const bins = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(bins);

        const { width, height } = canvas;
        context.clearRect(0, 0, width, height);
        context.fillStyle = '#000000';
        context.fillRect(0, 0, width, height);

        const bars = 28;
        const heights = bar_heights(bins, bars);
        const bar_w = width / bars;
        for (let i = 0; i < bars; i++) {
            const h = Math.max(1, (heights[i] ?? 0) * (height - 4));
            const hue = 190 + (heights[i] ?? 0) * 60;
            context.fillStyle = `hsl(${String(hue)} 90% 60%)`;
            context.fillRect(
                i * bar_w + 1,
                height - h - 2,
                Math.max(1, bar_w - 2),
                h,
            );
        }
        frame_id = requestAnimationFrame(draw);
    }

    // ── transport ───────────────────────────────────────────────────────────
    function toggle() {
        if (audio == null) return;
        if (audio.paused) {
            ensure_graph();
            void audio.play();
        } else {
            audio.pause();
        }
    }

    function select(next: number, autoplay = true) {
        index = next;
        current_time = 0;
        // The element reloads on src change; play again if we were playing.
        void Promise.resolve().then(() => {
            if (autoplay && audio != null) {
                ensure_graph();
                void audio.play();
            }
        });
    }

    function on_seek(event: MouseEvent) {
        const bar = event.currentTarget;
        if (!(bar instanceof HTMLElement) || audio == null) return;
        const rect = bar.getBoundingClientRect();
        const r = (event.clientX - rect.left) / rect.width;
        audio.currentTime = seek_target(r, duration);
    }

    onDestroy(() => {
        // Stop the loop AND the sound: a window closed mid-playback that keeps
        // its audio element alive is the worst kind of leak — audible.
        if (frame_id != null) cancelAnimationFrame(frame_id);
        frame_id = undefined;
        audio?.pause();
        void ctx?.close();
    });
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div
        slot="content"
        class="flex h-full w-full flex-col bg-[#3a6ea5] font-Tahoma text-[11px] text-white"
    >
        <!-- visualiser -->
        <div class="m-2 rounded border border-black/40 bg-black p-[2px]">
            <canvas
                bind:this={canvas}
                width="440"
                height="120"
                class="block h-[120px] w-full"
            ></canvas>
        </div>

        <div class="px-3 pb-1 text-[12px] font-bold">
            {track?.title ?? 'No track'}
        </div>

        <!-- seek bar -->
        <div class="px-3">
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
                data-testid="seek-bar"
                class="h-[10px] cursor-pointer rounded-full border border-black/40 bg-black/40"
                on:click={on_seek}
            >
                <div
                    class="h-full rounded-full bg-[#7ec8ff]"
                    style:width="{ratio * 100}%"
                ></div>
            </div>
            <div class="flex justify-between pt-[2px] text-[10px] opacity-80">
                <span>{format_duration(current_time)}</span>
                <span>{format_duration(duration)}</span>
            </div>
        </div>

        <!-- transport -->
        <div class="flex items-center gap-2 px-3 py-2">
            <button
                class="h-[26px] w-[30px] rounded border border-black/40 bg-white/15 hover:bg-white/25"
                aria-label="Previous"
                on:click={() => {
                    select(prev_index(index, TRACKS.length), !paused);
                }}>&#9198;</button
            >
            <button
                data-testid="play-pause"
                class="h-[30px] w-[38px] rounded border border-black/40 bg-white/25 hover:bg-white/35"
                aria-label={paused ? 'Play' : 'Pause'}
                on:click={toggle}>{paused ? '▶' : '⏸'}</button
            >
            <button
                class="h-[26px] w-[30px] rounded border border-black/40 bg-white/15 hover:bg-white/25"
                aria-label="Next"
                on:click={() => {
                    select(next_index(index, TRACKS.length), !paused);
                }}>&#9197;</button
            >

            <span class="ml-2 opacity-80">Vol</span>
            <input
                data-testid="volume"
                type="range"
                min="0"
                max="1"
                step="0.01"
                bind:value={app_volume}
                class="w-[96px]"
                aria-label="Volume"
            />
        </div>

        <!-- track list -->
        <div
            class="mx-2 mb-2 grow overflow-auto rounded border border-black/40 bg-white/95 text-black"
        >
            {#each TRACKS as t, i (t.id)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                    data-testid="track-row"
                    class="flex cursor-pointer justify-between px-2 py-[3px] {i ===
                    index
                        ? 'bg-[#316ac5] text-white'
                        : 'hover:bg-blue-100'}"
                    role="button"
                    tabindex="0"
                    on:click={() => {
                        select(i);
                    }}
                >
                    <span>{t.title}</span>
                    <span class="opacity-70"
                        >{format_duration(t.duration_s)}</span
                    >
                </div>
            {/each}
        </div>

        <audio
            bind:this={audio}
            bind:paused
            bind:currentTime={current_time}
            bind:duration
            src={track?.url}
            preload="metadata"
            on:ended={() => {
                select(next_index(index, TRACKS.length));
            }}
        ></audio>
    </div>
</Window>
