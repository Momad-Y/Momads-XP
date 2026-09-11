<svelte:options accessors={true} />

<script lang="ts">
    import { onDestroy, unmount } from 'svelte';
    import Window from '../../../lib/components/xp/Window.svelte';
    import { runningPrograms, systemVolume } from '../../../lib/store';
    import { profile } from '../../../lib/profile';
    import { required } from '../../../lib/types';
    import {
        TRACKS,
        GENRES,
        format_duration,
    } from '../../../lib/music/manifest';
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

    /*
     * Groups for display only. `TRACKS` is already ordered genre-by-genre by
     * the generator, so each group is a contiguous run and `offset` is the
     * index of its first track in the FLAT list. Everything else — select,
     * next_index, prev_index, `ended` — keeps working on flat indices, which is
     * what keeps prev/next walking the whole library instead of stopping at a
     * genre boundary.
     */
    const groups = GENRES.map((genre) => ({
        dir: genre.dir,
        name: genre.name,
        offset: TRACKS.findIndex((t) => t.genre === genre.dir),
        tracks: TRACKS.filter((t) => t.genre === genre.dir),
    })).filter((g) => g.tracks.length > 0);

    /*
     * Genres collapse, and only the one being played is open.
     *
     * Fifteen tracks under five headers is a 20-row list in a 470px window,
     * which pushed the transport controls off unless the window was dragged
     * taller. Collapsed, the whole library is five rows plus whatever plays.
     *
     * A LIST of open genres, not one: opening a second should not shut a first
     * the visitor deliberately expanded. Opening is driven from `select`
     * rather than a reactive statement — the reactive version read the open
     * list, so Svelte re-ran it whenever that list changed and it instantly
     * undid a collapse, making the playing genre impossible to close.
     */
    let open_genres: readonly string[] = [
        TRACKS[index_for(fs_item)]?.genre ?? '',
    ];

    function open_genre(dir: string): void {
        if (!open_genres.includes(dir)) open_genres = [...open_genres, dir];
    }

    function toggle_genre(dir: string): void {
        open_genres = open_genres.includes(dir)
            ? open_genres.filter((g) => g !== dir)
            : [...open_genres, dir];
    }

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
        // Follow the track across a genre boundary — including `ended`
        // advancing into the next genre, which would otherwise leave the
        // visitor staring at closed headers with sound coming from nowhere.
        const genre = TRACKS[next]?.genre;
        if (genre != null) open_genre(genre);
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

        <div class="flex items-center gap-2 px-3 pb-1">
            <!-- Art sits BESIDE the title, never in place of the visualiser:
                 the canvas above is a Phase 3 exit criterion, and removing a
                 shipped feature to make room for a new one is a bad trade. -->
            {#if track?.cover != null}
                <!--
                    Cropped to the measured box: covers pulled from YouTube are
                    16:9 thumbnails letterboxed into a square, so a plain
                    object-cover shows the bands rather than the art. `iw/w`
                    scales the box up to fill the slot and the negative offsets
                    slide it into place; `max-w-none` is needed because
                    Tailwind's preflight caps images at 100%.
                -->
                <div
                    data-testid="cover-art"
                    class="relative h-10 w-10 shrink-0 overflow-hidden rounded-sm border border-black/40"
                >
                    {#if track.cover_box != null}
                        <img
                            src={track.cover}
                            alt=""
                            class="absolute max-w-none"
                            style:width="{(track.cover_box.iw /
                                track.cover_box.w) *
                                100}%"
                            style:left="{(-track.cover_box.x /
                                track.cover_box.w) *
                                100}%"
                            style:top="{(-track.cover_box.y /
                                track.cover_box.h) *
                                100}%"
                        />
                    {:else}
                        <img
                            src={track.cover}
                            alt=""
                            class="h-full w-full object-cover"
                        />
                    {/if}
                </div>
            {:else}
                <div
                    data-testid="cover-art"
                    class="h-10 w-10 shrink-0 rounded-sm border border-black/40 bg-contain bg-center bg-no-repeat opacity-70"
                    style:background-image="url(/images/xp/icons/WindowsMediaPlayer9.png)"
                ></div>
            {/if}
            <div class="min-w-0">
                <div class="truncate text-[12px] font-bold">
                    {track?.title ?? 'No track'}
                </div>
                {#if track?.artist != null}
                    <div class="truncate text-[11px] opacity-80">
                        {track.artist}
                    </div>
                {/if}
            </div>
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
            {#each groups as group (group.name)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                    data-testid="genre-header"
                    class="sticky top-0 flex cursor-pointer items-center justify-between bg-[#d6e5f5] px-2 py-[3px] text-[11px] font-bold text-[#1c3f75] hover:bg-[#c5dbf0]"
                    role="button"
                    tabindex="0"
                    aria-expanded={open_genres.includes(group.dir)}
                    on:click={() => {
                        toggle_genre(group.dir);
                    }}
                >
                    <span>{group.name}</span>
                    <span class="flex items-center gap-1 opacity-70">
                        <span class="text-[10px] font-normal"
                            >{group.tracks.length}</span
                        >
                        <svg
                            class="h-2 w-2 fill-current transition-transform duration-150 {open_genres.includes(
                                group.dir,
                            )
                                ? 'rotate-90'
                                : ''}"
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 256 512"
                            ><path
                                d="M246.6 278.6c12.5-12.5 12.5-32.8 0-45.3l-128-128c-9.2-9.2-22.9-11.9-34.9-6.9s-19.8 16.6-19.8 29.6l0 256c0 12.9 7.8 24.6 19.8 29.6s25.7 2.2 34.9-6.9l128-128z"
                            /></svg
                        >
                    </span>
                </div>
                {#each open_genres.includes(group.dir) ? group.tracks : [] as t, n (t.id)}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <div
                        data-testid="track-row"
                        class="flex cursor-pointer justify-between px-2 py-[3px] {group.offset +
                            n ===
                        index
                            ? 'bg-[#316ac5] text-white'
                            : 'hover:bg-blue-100'}"
                        role="button"
                        tabindex="0"
                        on:click={() => {
                            select(group.offset + n);
                        }}
                    >
                        <span class="truncate">{t.title}</span>
                        <span class="shrink-0 pl-2 opacity-70"
                            >{format_duration(t.duration_s)}</span
                        >
                    </div>
                {/each}
            {/each}
        </div>

        <div
            data-testid="music-notice"
            class="px-3 pb-2 text-[10px] leading-tight opacity-70"
        >
            {profile.music.notice}
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
