import { describe, it, expect } from 'vitest';
import { statSync } from 'node:fs';
import { format_duration, TRACKS } from './manifest';
import hard_drive from '../../../static/json/hard_drive.json';

describe('TRACKS', () => {
    it('has unique ids and unique filenames', () => {
        const ids = TRACKS.map((t) => t.id);
        const files = TRACKS.map((t) => t.filename);
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(files).size).toBe(files.length);
    });

    it('every file exists and its size_kb matches the committed bytes', () => {
        // size_kb is hand-written on purpose: statSync'ing it at generation
        // time would make the mp3 bytes an input to SEED_VERSION, so
        // regenerating a track would silently re-seed every returning visitor.
        // This test is what keeps the hand-written value honest.
        for (const track of TRACKS) {
            const bytes = statSync(`static/audio/music/${track.filename}`).size;
            expect(Math.round(bytes / 1024)).toBe(track.size_kb);
        }
    });

    it('serves every track from the app origin, never a remote URL', () => {
        // A CORS-cross-origin element makes a MediaElementAudioSourceNode
        // output SILENCE into the graph — playback still works, but the
        // analyser reads zeros and the visualiser dies with only a console
        // warning. The phase guide says "local files only" for the same reason.
        for (const track of TRACKS) {
            expect(track.url.startsWith('/audio/music/')).toBe(true);
            expect(track.url).not.toMatch(/^https?:/);
        }
    });

    it('is seeded into My Music with matching ids, names and sizes', () => {
        // The manifest is the single source of truth and generate-vfs derives
        // the seed from it. This asserts the derivation actually happened —
        // otherwise the player and Explorer would disagree about what exists.
        const drive: Record<string, { name?: string; size?: number }> =
            hard_drive;
        for (const track of TRACKS) {
            const item = drive[track.id];
            expect(
                item,
                `track ${track.id} missing from the seed`,
            ).toBeDefined();
            expect(item?.name).toBe(`${track.title}.mp3`);
            expect(item?.size).toBe(track.size_kb);
        }
    });

    it('totals more than 1 MB, so Details and the status bar disagree', () => {
        // SPECIFICATION handoff §8 rule 1: the Details Size column is ALWAYS
        // KB with separators, while the status bar picks a unit. Until now no
        // VISIBLE folder held more than 1 MB, so the divergence was
        // untestable and documented as a deliberate coverage gap. My Music
        // closes it — and an e2e now asserts both spellings in one window, so
        // the next person to "unify" the two rules gets a red test instead of
        // five re-spelled Desktop items.
        const total = TRACKS.reduce((sum, t) => sum + t.size_kb, 0);
        expect(total).toBeGreaterThan(1024);
    });

    it('gives every track a positive duration', () => {
        for (const track of TRACKS) {
            expect(track.duration_s).toBeGreaterThan(0);
        }
    });
});

describe('format_duration', () => {
    it('formats as m:ss with a padded seconds field', () => {
        expect(format_duration(0)).toBe('0:00');
        expect(format_duration(5)).toBe('0:05');
        expect(format_duration(42)).toBe('0:42');
        expect(format_duration(60)).toBe('1:00');
        expect(format_duration(125)).toBe('2:05');
    });

    it('truncates fractional seconds rather than rounding up', () => {
        // Rounding up would show "0:43" for a 42.6s track that has not
        // finished, and the seek bar would look like it overran.
        expect(format_duration(42.9)).toBe('0:42');
    });

    it('is 0:00 for NaN, Infinity and negatives', () => {
        // `audio.duration` is NaN until metadata loads, which is the state the
        // player renders in first.
        expect(format_duration(Number.NaN)).toBe('0:00');
        expect(format_duration(Number.POSITIVE_INFINITY)).toBe('0:00');
        expect(format_duration(-3)).toBe('0:00');
    });
});

describe('.mp3 file association', () => {
    it('keeps MPC as the default and adds the Music Player second', async () => {
        // Order is the whole decision. MPC stays doctypes['.mp3'][0] because
        // that is the shipped double-click behaviour; every other consumer
        // (viewer.svelte, desktop_folder.svelte, favorites.ts) takes [0]
        // unconditionally, so changing it would regress every existing
        // Explorer double-click. The Music Player is [1], which is what makes
        // CMFSItem render the "Open With" submenu at all — it does so only
        // when there are >= 2 handlers.
        const { doctypes } = await import('../system');
        const handlers = doctypes['.mp3'] ?? [];
        expect(handlers).toHaveLength(2);
        expect(handlers[0]?.path).toBe(
            './programs/media_player_classic.svelte',
        );
        expect(handlers[1]?.path).toBe('./programs/music_player.svelte');
    });

    it('is listed in the Folder Options registered file types', async () => {
        // A shipped surface (folder_options.svelte, asserted by
        // xp_chrome_a.spec.ts). A new association without a row here makes the
        // dialog contradict the behaviour — call site #11 of the twelve.
        const { profile } = await import('../profile');
        const exts = profile.folderOptions.fileTypes.types.map((t) => t.ext);
        expect(exts).toContain('.mp3');
    });
});
