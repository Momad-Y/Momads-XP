import { describe, expect, it } from 'vitest';
import {
    AUDIO_EXTENSIONS,
    MPC_AUDIO_EXTENSIONS,
    VIDEO_EXTENSIONS,
    is_audio_ext,
    is_video_ext,
} from './media_types';
import { doctypes, icons } from './system';
import mime from './mime.json';

const MUSIC_PLAYER = './programs/music_player.svelte';
const MPC = './programs/media_player_classic.svelte';

/**
 * The association rules, and the four places that used to state them
 * separately. Every test here is one of those disagreements made impossible:
 * `.ogg` was declared video by the player while the music library listed it as
 * audio, and six extensions had no icon or MIME row at all.
 */

describe('the lists themselves', () => {
    it('never calls the same extension both audio and video', () => {
        const both = AUDIO_EXTENSIONS.filter((ext) =>
            VIDEO_EXTENSIONS.includes(ext),
        );
        expect(both).toEqual([]);
    });

    it('is lowercase and dot-prefixed throughout', () => {
        for (const ext of [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS]) {
            expect(ext).toBe(ext.toLowerCase());
            expect(ext.startsWith('.')).toBe(true);
        }
    });

    /* MPC is offered for audio only where it can actually decode it. */
    it('only claims MPC audio support for real audio types', () => {
        for (const ext of MPC_AUDIO_EXTENSIONS) {
            expect(AUDIO_EXTENSIONS).toContain(ext);
        }
    });

    it('matches extensions case-insensitively', () => {
        expect(is_audio_ext('.MP3')).toBe(true);
        expect(is_video_ext('.MP4')).toBe(true);
        expect(is_audio_ext('.mp4')).toBe(false);
        expect(is_video_ext('.mp3')).toBe(false);
        expect(is_audio_ext('.txt')).toBe(false);
    });
});

describe('doctypes follows the lists', () => {
    /*
     * THE ORDER IS THE WHOLE DECISION, and it used to be the other way round.
     * `[0]` is what every double-click takes (viewer.svelte,
     * desktop_folder.svelte, favorites.ts all read it unconditionally).
     */
    it('opens every audio type in the Music Player by default', () => {
        for (const ext of AUDIO_EXTENSIONS) {
            expect(doctypes[ext]?.[0]?.path).toBe(MUSIC_PLAYER);
        }
    });

    it('opens every video type in the video player', () => {
        for (const ext of VIDEO_EXTENSIONS) {
            expect(doctypes[ext]?.[0]?.path).toBe(MPC);
        }
    });

    /*
     * An "Open With" entry that opens a window and plays nothing is worse than
     * no entry, so MPC appears for audio only where it can decode it.
     */
    it('offers MPC for audio only where MPC supports it', () => {
        for (const ext of AUDIO_EXTENSIONS) {
            const paths = (doctypes[ext] ?? []).map((h) => h.path);
            expect(paths.includes(MPC)).toBe(
                MPC_AUDIO_EXTENSIONS.includes(ext),
            );
        }
    });

    it('never offers the Music Player for video — it cannot show a picture', () => {
        for (const ext of VIDEO_EXTENSIONS) {
            const paths = (doctypes[ext] ?? []).map((h) => h.path);
            expect(paths).not.toContain(MUSIC_PLAYER);
        }
    });
});

describe('every associated media type is fully registered', () => {
    /*
     * `file_icon_url` returns null without a row here and Explorer draws a
     * blank glyph — an item must never be openable-but-iconless.
     */
    it('has an icon', () => {
        for (const ext of [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS]) {
            expect(icons[ext], `no icon row for ${ext}`).toBeDefined();
        }
    });

    it('gives audio an audio icon and video a video icon', () => {
        for (const ext of AUDIO_EXTENSIONS) {
            expect(icons[ext]).toBe('MPC_audio.png');
        }
        for (const ext of VIDEO_EXTENSIONS) {
            expect(icons[ext]).toBe('MPC_video.png');
        }
    });

    /*
     * Send To ▸ Local Computer stamps `ext_to_mime(...)` on the download.
     * Without a row it stamped the literal string "undefined".
     */
    it('has a MIME type', () => {
        const known = new Set(mime.map((entry) => entry.ext));
        for (const ext of [...AUDIO_EXTENSIONS, ...VIDEO_EXTENSIONS]) {
            expect(known.has(ext), `no mime row for ${ext}`).toBe(true);
        }
    });
});
