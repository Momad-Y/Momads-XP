# Plan — audio opens in the Music Player, video opens in the video player

Post-Phase-3 work changing shipped behaviour (the double-click default), so it
gets a plan doc per CLAUDE.md. It OVERRIDES a documented decision: `system.ts`
and `manifest.test.ts` both record "MPC stays the default for .mp3 because
changing it would regress every existing Explorer double-click". The owner has
now asked for the opposite, explicitly.

## The request

> If users go to play something from the my songs folder manually it should
> open to the music player not the video player (any music files mp3, ogg,
> wav, ...), should use the music player not the video player (even if this
> file is outside of my music), and the video player should be for video
> (mp4, mkv, etc..)

Three parts, and the second is the one that makes it actually work:

1. Audio extensions default to the Music Player; video extensions to MPC.
2. The Music Player must PLAY a file handed to it that is not in My Music.
   Today `initial_id()` looks the launched file up in the library and falls
   back to `flat[0]` — so double-clicking an mp3 on the Desktop opens the
   player and starts a different song.
3. The player is a registry singleton, and `focus_existing` returns before the
   launch payload is read, so opening a second file while it is already open
   raises the window and plays nothing new.

## Sub-decisions

### D1 — Where the audio/video extension lists live

- **Inline in `system.ts`'s doctypes.** For: one edit. Against: `library.ts`
  already has its own `AUDIO_EXTENSIONS` for deciding what My Music lists, and
  two lists that must agree but are written twice is precisely the drift this
  repo keeps paying for — a file could open in the player and then not be
  listed by it.
- **A shared `src/lib/media_types.ts`. VERDICT.** For: one definition of "this
  is music", consumed by both the association table and the library scan;
  testable on its own. Against: a new file for two constants.
- Deciding factor: the two lists are the same fact. Dependency direction is
  clean — `media_types.ts` imports nothing, so neither `system.ts` nor
  `music/library.ts` gains a cycle.

### D2 — Which extensions are audio, which video

Audio: `.mp3 .wav .ogg .m4a .aac .flac`. Video: `.mp4 .webm .mkv .avi .mov`.

- `.ogg` is a container that can hold either; the owner named it as music, so
  it is audio, and its icon moves from `MPC_video.png` to `MPC_audio.png` to
  match.
- `.mkv` and `.avi` cannot actually be decoded by a browser. Associating them
  anyway is deliberate: a double-click that opens the video player and fails
  to decode is XP-faithful and legible, whereas "no association" on a video
  file reads as the shell not knowing what a video is. This is the opposite of
  the rule the LIBRARY uses (there, listing an undecodable file is worse than
  hiding it) because the two answer different questions: what is in your music
  library vs what program claims this file type.

### D3 — Does MPC stay available for audio?

Yes, as the SECOND handler. For: `CMFSItem` renders "Open With" only when a
type has two or more handlers, so keeping MPC there preserves that submenu and
the visitor's ability to choose. Against: nothing — it is the existing shape
with the order reversed. The Music Player is NOT added to video types: it
cannot show a picture.

### D4 — Playing a file that is not in My Music

- **Play it without listing it.** For: smallest change. Against: the track list
  then shows no selection while sound comes out of the window — the exact
  disorientation the auto-open-the-playing-genre behaviour exists to prevent.
- **List it in its own group, named after the folder it came from. VERDICT.**
  For: the visitor sees what is playing and where it came from; it joins
  prev/next naturally; the group disappears when they pick something else from
  the library. Against: the player shows a group that is not part of the
  library, which is a new concept in that window.
- Implemented as an optional `extra` argument to `build_library`, so it stays
  pure and testable, and so the group is appended by the same code that builds
  every other group.

### D5 — Handing a file to an already-open player

- **Leave it.** For: no change to the launch path, which is delicate. Against:
  the feature then only works when the player is closed, which is not what was
  asked and looks broken.
- **`focus_existing` passes the payload to the running instance. VERDICT.**
  The player exports an `open_file(item)` that selects and plays it; the
  launcher calls it when focusing a singleton that was given an `fs_item`.
  Against: `ProgramInstance` grows an optional member, and the launcher now
  knows that some programs accept a file while focused.
- Deciding factor: without it, "double-click an mp3" does nothing visible
  whenever the player is already open — which is most of the time, since it is
  a singleton the visitor is likely to have left open.

### D6 — Folder Options must not contradict the associations

`profile.folderOptions.fileTypes.types` is a shipped surface (asserted by
`xp_chrome_a.spec.ts`), and `manifest.test.ts` already records that a new
association without a row there makes the dialog contradict the behaviour.
New rows are needed for the added types. THE DESCRIPTIONS ARE OWNER VOICE —
written here in the established register, and flagged for him to reword, since
`profile.json` is where his jokes live by his own instruction.

## Files

| File | Change |
| --- | --- |
| `src/lib/media_types.ts` | NEW — the audio/video extension lists |
| `src/lib/media_types.test.ts` | NEW — no overlap, lowercase, coherence with doctypes |
| `src/lib/system.ts` | doctypes: audio → [player, MPC]; video → [MPC]; icons |
| `src/lib/music/library.ts` | import the shared list; `extra` track support |
| `src/routes/xp/programs/music_player.svelte` | `open_file`, extra group |
| `src/routes/xp/work_space.svelte` | hand the payload to a focused singleton |
| `src/lib/types.ts` | `ProgramInstance.open_file?` |
| `src/lib/music/manifest.test.ts` | the .mp3 order test now encodes the NEW rule |
| `src/lib/data/profile.json` | Folder Options rows for the new types |
| `e2e/*` | double-click an mp3 → player; a video → MPC |

## Regression risks

- **Every doctypes consumer takes `[0]` unconditionally** (`viewer.svelte:382`,
  `desktop_folder.svelte:226`, `favorites.ts:51`, `CMFSItem.ts:59`). Flipping
  the order changes all four at once — that is the point, but it means the
  blast radius is every surface that opens a file.
- `manifest.test.ts:143-159` asserts the OLD order and will pass until
  rewritten; it must be rewritten to assert the new one, not deleted.
- A file with no `fs_item` (the Start-menu launch) must still open the library
  normally — `extra` is optional and absent there.
- SEED_VERSION must not move: `profile.json` changes here are Folder Options
  copy, which the generator does not embed.

## Red-team dispositions

Fresh-context review, find-problems framing. It found one net-negative and one
crash in the plan as written. Three claims verified before acting on them:

- **MPC silently does nothing** for an extension in neither of its lists:
  `load_media` hits `else { return; }`, `file_type` stays undefined, and the
  window paints the greyed MPC logo. No decode attempt, no error, no dialog.
- **Today `.mkv` gets a real error**: with no `doctypes` row, both dispatch
  sites call `show_no_association_dialog`, a titled XP dialog naming the file.
- **`full_vfs_item` throws on a partial payload**, and `focus_existing` runs
  before that narrowing.

### ACCEPTED — D2 was a net downgrade

Associating `.mkv`/`.avi`/`.mov` with MPC as planned would have replaced a
clear "Windows cannot open this file" dialog with a silent empty window. The
plan's stated rationale — "fails to decode is XP-faithful and legible" — was
simply false about this codebase.

Fixed properly rather than by dropping the extensions the owner asked for:
MPC now treats every `VIDEO_EXTENSIONS` entry as video AND gains a visible
failure state driven by the media element's own `error` event, which also
covers a corrupt `.mp4` — something nothing handled before.

### ACCEPTED — D4 would have crashed on the common case

The extra group was to be keyed by the launched file's parent folder id. But
every shipped audio file lives inside My Music, so the parent folder id is
**already a group key**, and a duplicate `{#each}` key throws
`each_key_duplicate` and stops the list rendering. The plan was carefully
designed for the rare path and broken on the only one that ships.

Rewritten as the reviewer's highest-leverage change: hold `extra_id`, resolve
it **through the reactive library** on every rebuild, return the library
unchanged when the id is already in `flat`, and only then append a group under
a sentinel key. Storing an id rather than a snapshot is what keeps Defect 1
fixed — a snapshot would survive the drive write that deletes the file, so the
player would go back to playing songs that no longer exist.

`open_fs_item` must `await tick()` before selecting: `$: library` is a
pre-effect, so setting `extra_id` and selecting in the same tick reads a stale
`flat`, `select` finds nothing, and the deletion guard then calls
`stop_playback()`. The feature would have failed closed and silently, every
time — the same class of trap CLAUDE.md already records.

### ACCEPTED — the window title regresses

`work_space` titles inherited-branch windows with the file name, but the
REGISTRY branch passes `to_window_options(app, id)`, which hardcodes the app
title. So double-clicking `Shedeeny.mp3` would go from a window titled
"Shedeeny.mp3" to one titled "Windows Media Player". The player now sets its
own title from the file it opens.

### ACCEPTED — three more lists, and a singleton race

- MPC's own `supported_audio_types`/`supported_video_types` now COME FROM
  `media_types.ts`, so "every associated video type is one MPC handles" is
  true by construction rather than by test.
- MPC is the second handler only for the audio types it actually supports;
  `.m4a`/`.flac`/`.aac` get the player alone, so Open With never offers a
  program that would open an empty window.
- `icons` and `mime.json` rows for every added extension — without them
  Explorer draws a blank glyph and Send To stamps the string "undefined".
- `focus_existing` gains an in-flight guard. Registration happens after the
  dynamic `import()`, and Svelte 5's `mount()` does not flush `onMount`, so two
  launches issued in that window both mount a player. Pre-existing, but every
  audio double-click is now a launch, so the odds change completely.

### REJECTED, with cause — splitting the audio list in two

The reviewer asked for `AUDIO_ASSOCIATIONS` and `LIBRARY_AUDIO` as separate
constants with a subset invariant, on the grounds that the association rule
and the library rule are different facts.

They are the same fact HERE, and not by coincidence: both ask "can the Music
Player play this?" — the library refuses to list what cannot be decoded, and
the association points at the program that decodes it. The set that satisfies
one satisfies the other by construction. Two constants with no current
divergence is two things to keep in sync for a distinction that does not exist
yet. The reviewer's underlying worry — that a future edit to the association
list silently changes what My Music lists — is answered by saying so in
`media_types.ts`, where the next person to add an extension will read it.
