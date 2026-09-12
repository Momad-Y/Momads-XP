<svelte:options accessors={true} />

<script lang="ts">
    import { onDestroy, onMount, unmount, tick } from 'svelte';
    import { SvelteMap } from 'svelte/reactivity';
    import Window from '../../../lib/components/xp/Window.svelte';
    import {
        runningPrograms,
        systemVolume,
        hardDrive,
    } from '../../../lib/store';
    import { profile } from '../../../lib/profile';
    import { required } from '../../../lib/types';
    import { my_music_id } from '../../../lib/system';
    import * as fs from '../../../lib/fs';
    import {
        TRACKS,
        format_duration,
        format_optional_duration,
    } from '../../../lib/music/manifest';
    import { build_library, metadata_index } from '../../../lib/music/library';
    import {
        bar_heights,
        create_source_cache,
        effective_volume,
        next_index,
        prev_index,
        progress_ratio,
        seek_target,
    } from '../../../lib/music/player';
    import type { LibraryTrack } from '../../../lib/music/library';
    import type {
        ProgramInstance,
        VfsItem,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    export let id: string;
    /**
     * Set when launched through Explorer's Open With on an .mp3. Without this
     * the clicked file was discarded and playback always started at the first
     * track, which made the second `doctypes['.mp3']` entry — the whole reason
     * the association was changed — do nothing.
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

    // ── the library ─────────────────────────────────────────────────────────
    /**
     * THE LIBRARY IS THE DRIVE, not the generated manifest.
     *
     * The manifest survives only as a metadata sidecar (art, artist, duration
     * — see music/library.ts). Everything the player LISTS comes from the
     * `My Music` subtree of `$hardDrive`, so deleting a song in Explorer
     * removes it here, deleting a genre folder removes its header, emptying
     * one leaves the header at zero, and a folder or a song the visitor adds
     * shows up without the player knowing anything about it in advance.
     *
     * Rebuilt on every drive write anywhere in the shell. That is cheap — it
     * is a walk of one small subtree — but it is why nothing derived from it
     * may hold state: see `learned` and `object_urls`, which are deliberately
     * outside it.
     */
    const META = metadata_index(TRACKS);

    $: library = build_library(
        $hardDrive ?? {},
        my_music_id,
        META,
        profile.music.unsorted_label,
    );
    $: flat = library.flat;

    /**
     * The playing track, BY ID. An index would silently re-point at another
     * song the moment a track above it was deleted.
     */
    let current_id: string | null = null;
    let paused = true;
    let current_time = 0;
    /** NaN until a file is actually loaded; `progress_ratio` already guards. */
    let duration = Number.NaN;
    let app_volume = 0.8;
    let src: string | undefined;

    $: track = flat.find((t) => t.id === current_id);
    $: index = track == null ? -1 : flat.indexOf(track);

    /**
     * Open the first track once, on mount.
     *
     * NOT from a `$:` block, and this cost an afternoon. In Svelte 5's legacy
     * mode a reactive statement is a pre-effect, and STATE WRITTEN FROM INSIDE
     * ONE DOES NOT INVALIDATE THE OTHER `$:` STATEMENTS. Selecting the first
     * track from a reactive statement therefore set `current_id` and even set
     * the audio `src` — while `track` and `index`, both derived from
     * `current_id` in their own `$:` blocks, stayed frozen at their initial
     * values forever. The player opened showing "No track" and no cover, with
     * a perfectly good src loaded, and nothing in the console. The identical
     * call from a click handler propagates normally.
     *
     * `onMount` runs after the first reactive pass, so the library is already
     * built; the drive is seeded during boot, long before any program can be
     * launched.
     */
    onMount(() => {
        if (flat.length > 0) void select(initial_id(), false);
    });

    function initial_id(): string | null {
        const wanted =
            fs_item == null
                ? undefined
                : flat.find(
                      (t) =>
                          t.id === fs_item?.id ||
                          (fs_item?.url != null && t.url === fs_item.url),
                  );
        return wanted?.id ?? flat[0]?.id ?? null;
    }

    /**
     * The playing track was deleted out from under us — stop.
     *
     * IT ASKS `flat` DIRECTLY rather than reading the derived `index`, and that
     * is not a style preference. Svelte 5 runs legacy `$:` blocks as pre-effects
     * in source order, NOT in dependency order, so a statement declared after
     * this one — `begin()`, which selects the first track — sets `current_id`
     * during a flush in which `index` has already been computed as -1. Reading
     * the stale `index` here therefore fired `stop_playback()` on the selection
     * that had just been made, and the player opened with no track, no `src`
     * and no cover. Depending only on values this statement reads itself
     * removes the ordering question entirely.
     *
     * Terminates: `stop_playback` nulls `current_id`, after which the guard is
     * false. This is the whole point of keying on an id; an index would have
     * quietly slid onto whichever song took its place.
     */
    $: if (current_id != null && !flat.some((t) => t.id === current_id)) {
        stop_playback();
    }

    // ── durations the manifest does not know ────────────────────────────────
    /**
     * Durations learned from the audio element, for the visitor's own files.
     *
     * NOT in the library: that is derived from `$hardDrive` and is thrown away
     * on every drive write anywhere in the shell, so anything written into it
     * would evaporate the next time an icon moved.
     */
    const learned = new SvelteMap<string, number>();

    function remember_duration(): void {
        if (audio == null || current_id == null) return;
        const value = audio.duration;
        if (!Number.isFinite(value) || value <= 0) return;
        learned.set(current_id, value);
    }

    function duration_of(t: LibraryTrack): number | null {
        return t.duration_s ?? learned.get(t.id) ?? null;
    }

    // ── groups ──────────────────────────────────────────────────────────────
    /*
     * Genres collapse, and only the one being played is open.
     *
     * Fifteen tracks under five headers is a 20-row list in a 470px window,
     * which pushed the transport controls off unless the window was dragged
     * taller. Collapsed, the whole library is five rows plus whatever plays.
     *
     * KEYED BY FOLDER ID, not by name: two folders can share a name (the
     * visitor makes one called "Scores"), and a duplicate `{#each}` key throws
     * and stops rendering the entire list.
     *
     * A LIST of open groups, not one: opening a second should not shut a first
     * the visitor deliberately expanded. Opening is driven from `select`
     * rather than a reactive statement — the reactive version read the open
     * list, so Svelte re-ran it whenever that list changed and it instantly
     * undid a collapse, making the playing genre impossible to close.
     */
    let open_groups: readonly string[] = [];

    function open_group(key: string): void {
        if (!open_groups.includes(key)) open_groups = [...open_groups, key];
    }

    function toggle_group(key: string): void {
        open_groups = open_groups.includes(key)
            ? open_groups.filter((g) => g !== key)
            : [...open_groups, key];
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

    // ── sources ─────────────────────────────────────────────────────────────
    /**
     * Object URLs for the visitor's own uploads, one per track, held until the
     * window closes.
     *
     * MEMOISED, and resolved in `select()` rather than in the reactive
     * library: a fresh `createObjectURL` on every rebuild would change `src`
     * on every unrelated drive write — an icon drag, a `date_modified` touch —
     * and each change reloads the element and restarts the song from zero.
     */
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- a pure cache, never read from the markup. A SvelteMap here would re-run the track list every time a blob URL was minted, for no visible difference.
    const object_urls = new Map<string, string>();

    async function resolve_src(t: LibraryTrack): Promise<string | undefined> {
        // A seeded track is served from static/ and needs no resolution.
        if (t.storage_type !== 'local') return t.url ?? undefined;
        const cached = object_urls.get(t.id);
        if (cached != null) return cached;
        try {
            const url = await fs.get_url(t.id);
            if (url == null) return undefined;
            object_urls.set(t.id, url);
            return url;
        } catch {
            // Deleted mid-resolution, or its bytes are gone. A silent row that
            // will not play beats taking the whole window down.
            return undefined;
        }
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

    /**
     * Monotonic, so an out-of-order resolution cannot win.
     *
     * Clicking Next three times starts three `get_url` calls that may settle
     * in any order; without this the last one to RESOLVE would set `src`,
     * rather than the last one the visitor asked for.
     */
    let selection_token = 0;

    async function select(next: string | null, autoplay = true): Promise<void> {
        const token = ++selection_token;
        current_id = next;
        current_time = 0;
        if (next == null) {
            src = undefined;
            return;
        }
        const t = flat.find((x) => x.id === next);
        if (t == null) return;
        // Follow the track across a genre boundary — including `ended`
        // advancing into the next genre, which would otherwise leave the
        // visitor staring at closed headers with sound coming from nowhere.
        open_group(t.group_key);

        const resolved = await resolve_src(t);
        if (token !== selection_token) return;
        src = resolved;
        // `await tick()`, NOT a bare microtask: `src` reaches the element
        // through a reactive statement, and this repo has already been bitten
        // by `$:` landing too late for a synchronous handler.
        await tick();
        if (autoplay && audio != null) {
            ensure_graph();
            void audio.play();
        }
    }

    function stop_playback(): void {
        // Abandon any in-flight resolution, or it would assign `src` after we
        // cleared it and the deleted track would start playing anyway.
        selection_token++;
        current_id = null;
        src = undefined;
        current_time = 0;
        duration = Number.NaN;
        audio?.pause();
    }

    /** Prev/Next, including from the no-track state, where `index` is -1. */
    function step(delta: 1 | -1, autoplay = !paused): void {
        if (flat.length === 0) return;
        if (index < 0) {
            // `prev_index(-1, n)` and `next_index(-1, n)` both return
            // plausible-looking nonsense, so -1 is handled before they see it.
            const edge = delta === 1 ? flat[0] : flat[flat.length - 1];
            void select(edge?.id ?? null, autoplay);
            return;
        }
        const n =
            delta === 1
                ? next_index(index, flat.length)
                : prev_index(index, flat.length);
        void select(flat[n]?.id ?? null, autoplay);
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
        // Object URLs are reference-counted by nothing; if this does not
        // release them, nothing ever will.
        for (const url of object_urls.values()) URL.revokeObjectURL(url);
        object_urls.clear();
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
                    step(-1);
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
                    step(1);
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
            {#each library.groups as group (group.key)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                    data-testid="genre-header"
                    class="sticky top-0 flex cursor-pointer items-center justify-between bg-[#d6e5f5] px-2 py-[3px] text-[11px] font-bold text-[#1c3f75] hover:bg-[#c5dbf0]"
                    role="button"
                    tabindex="0"
                    aria-expanded={open_groups.includes(group.key)}
                    on:click={() => {
                        toggle_group(group.key);
                    }}
                >
                    <span>{group.name}</span>
                    <span class="flex items-center gap-1 opacity-70">
                        <span class="text-[10px] font-normal"
                            >{group.tracks.length}</span
                        >
                        <svg
                            class="h-2 w-2 fill-current transition-transform duration-150 {open_groups.includes(
                                group.key,
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
                {#each open_groups.includes(group.key) ? group.tracks : [] as t (t.id)}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <div
                        data-testid="track-row"
                        class="flex cursor-pointer justify-between px-2 py-[3px] {t.id ===
                        current_id
                            ? 'bg-[#316ac5] text-white'
                            : 'hover:bg-blue-100'}"
                        role="button"
                        tabindex="0"
                        on:click={() => {
                            void select(t.id);
                        }}
                    >
                        <span class="truncate">{t.title}</span>
                        <span class="shrink-0 pl-2 opacity-70"
                            >{format_optional_duration(duration_of(t))}</span
                        >
                    </div>
                {/each}
            {/each}
            {#if library.groups.length === 0}
                <!-- Reachable: the visitor emptied My Music, or is on a drive
                     old enough not to have it. -->
                <div
                    data-testid="empty-library"
                    class="px-2 py-[6px] italic opacity-60"
                >
                    My Music is empty.
                </div>
            {/if}
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
            {src}
            preload="metadata"
            on:durationchange={remember_duration}
            on:ended={() => {
                step(1, true);
            }}
        ></audio>
    </div>
</Window>
