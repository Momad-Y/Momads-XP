/**
 * Which extensions are music and which are video — the one definition.
 *
 * FOUR LISTS USED TO SAY THIS, in three files: `doctypes` and `icons` in
 * system.ts, `AUDIO_EXTENSIONS` in music/library.ts, and the two literals
 * inside media_player_classic.svelte. They had already drifted: `.ogg` was
 * declared playable by the video player and carried a video icon, while the
 * music library listed it as audio. Everything now reads from here.
 *
 * Imports nothing on purpose, so `system.ts`, `music/library.ts` and the
 * player components can all depend on it without a cycle.
 */

/**
 * Audio the Music Player handles.
 *
 * This list does DOUBLE DUTY and that is deliberate, not an accident waiting
 * to bite: it is both what `My Music` lists and what opens in the player by
 * double-click. Both uses ask the same question — "can the Music Player play
 * this?" — because the library refuses to list what a browser cannot decode
 * and the association points at whatever decodes it. If you ever need a type
 * associated but NOT listed (or the reverse), that is the moment to split this
 * into two constants, and the moment to write down why.
 *
 * Lowercase only. Every creation path lowercases `ext` (`new_fs_item`,
 * `new_fs_item_raw`) and every lookup lowercases again, so a stored extension
 * is already normalised.
 */
export const AUDIO_EXTENSIONS: readonly string[] = [
    '.mp3',
    '.wav',
    '.ogg',
    '.m4a',
    '.aac',
    '.flac',
];

/**
 * Video the video player handles.
 *
 * `.mkv`, `.avi` and `.mov` are here even though no browser can decode them.
 * That is the owner's call — a video file must open the video player — and it
 * is only safe because the player now has a VISIBLE failure state driven by
 * the media element's own `error` event. Before that, an unrecognised
 * extension made `load_media` return early and paint an empty grey window,
 * which was strictly worse than the "cannot open this file" dialog an
 * unassociated type already got.
 */
export const VIDEO_EXTENSIONS: readonly string[] = [
    '.mp4',
    '.webm',
    '.wmv',
    '.mkv',
    '.avi',
    '.mov',
];

/**
 * Audio the video player can also play, and therefore the only audio types it
 * is offered for in "Open With".
 *
 * A narrower list than `AUDIO_EXTENSIONS` on purpose. Offering Media Player
 * Classic for a `.flac` would put a menu entry there that opens a window and
 * plays nothing — a dead command is worse than an absent one.
 */
export const MPC_AUDIO_EXTENSIONS: readonly string[] = ['.mp3', '.wav', '.ogg'];

/** Case-insensitive membership, for callers holding a raw `VfsItem.ext`. */
export function is_audio_ext(ext: string): boolean {
    return AUDIO_EXTENSIONS.includes(ext.toLowerCase());
}

/** Case-insensitive membership, for callers holding a raw `VfsItem.ext`. */
export function is_video_ext(ext: string): boolean {
    return VIDEO_EXTENSIONS.includes(ext.toLowerCase());
}
