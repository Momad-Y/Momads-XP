# Plan — the Music Player becomes a view over `My Music`, and the Recycle Bin learns Restore

Post-Phase-3 work that changes shipped behaviour, so it gets a plan doc per
CLAUDE.md. Supersedes the "library is a build-time constant" design recorded in
`src/lib/music/manifest.ts`'s header and in `docs/phase-3-guide.md`.

## The reported defects

Owner-reported, all one root cause plus one gap:

1. Delete a song in Explorer and the player keeps listing and playing it.
2. Delete a whole genre folder and the category is still there.
3. Delete every song in a genre but keep the folder — the category should
   remain, empty.
4. Create a folder in `My Music` and drop songs in — nothing appears.
5. Add songs to an existing genre folder — nothing appears.
6. Drop a song loose in `My Music` with no folder — it should appear, without a
   category, and be playable.
7. The Recycle Bin has no Restore.

1-6 are the same bug: `TRACKS` is a compile-time constant imported from
`src/lib/generated/music.ts` and the player never reads `hardDrive`. 7 is a
missing feature — the bin only offers Empty.

## Sub-decisions

### D1 — Where the library comes from

- **Keep the manifest, diff against the VFS.** For: no change to playback.
  Against: needs a reconciliation pass that is strictly more complex than
  reading the drive, and cannot express defects 4-6 at all (a user folder has
  no manifest row to diff against).
- **Read the VFS subtree under `my_music_id`. VERDICT.** For: every one of
  defects 1-6 falls out of it with no special cases; the drive is already
  reactive (`$hardDrive`), already persisted, and already the thing Explorer
  mutates. Against: metadata the drive does not carry (cover, artist, ID3
  title, duration) has to come from somewhere — see D2.
- Deciding factor: 4-6 are unreachable from the manifest. Only the drive knows
  about folders the visitor invented.

### D2 — What the generated manifest becomes

- **Delete it.** For: one source of truth. Against: throws away covers,
  `cover_box`, ID3 titles and durations for the owner's own 15 tracks, which is
  a visible regression and the whole point of the scan pipeline.
- **Demote it to a metadata sidecar, keyed by id then url. VERDICT.** For: the
  seeded VFS item id IS the manifest id (verified: `95f20fbca0f8d1e7` appears
  as both), so the join is exact and free; `url` is a second key so a restored
  copy that got a fresh id still finds its art. Against: two modules describe
  one track, and a track can now render with a filename title if the join
  misses. Acceptable — that is exactly what a visitor's own upload should do.
- Deciding factor: keeps the scanner, the cover pipeline and the CI freshness
  gate untouched while the library moves. `scan.ts`, `cover_box.ts` and
  `scripts/generate-vfs.ts` need no edit at all.

### D3 — What counts as a category

- **Every folder in the subtree, at any depth.** For: nothing is hidden.
  Against: a nested folder becomes a top-level header, so the player's shape
  stops matching what Explorer shows.
- **Direct child folders of `My Music` only. VERDICT.** For: matches the
  seeded shape and the visitor's mental model — one level of genres. An empty
  one still renders with a `0`, which is defect 3. Against: a folder nested two
  deep is not itself a category.
- A category's tracks are every audio file in its **whole subtree**, so a song
  in a nested folder rolls up into its top-level genre rather than vanishing.
  Against: its folder structure is flattened in the player. Accepted — silently
  invisible files are the worse failure.

### D4 — Ordering

- **Alphabetical.** For: stable. Against: reorders the owner's curated genre
  order, which `profile.json` deliberately declares.
- **`children` array order. VERDICT.** For: the generator writes genre folders
  in `profile.json` order, so the curated order is preserved for free, and new
  folders append where the visitor made them. Against: depends on a generator
  ordering guarantee — noted in the library header so it cannot be broken
  silently.

### D5 — Loose files (owner decision)

Songs directly in `My Music` group under a header labelled from
`profile.json` (`music.unsorted_label`, default "Unsorted"), rendered **last**,
after the folders. Matches Explorer, which lists folders before files. The
group is absent entirely when there are no loose files.

### D6 — What counts as audio

Extension allowlist: `.mp3 .wav .ogg .m4a`. Against a broader list: listing a
file the browser cannot decode is worse than not listing it. `.lnk` shortcuts
and `storage_type: 'fake'` items are excluded regardless of extension.

### D7 — Current-track identity

- **Keep the flat index.** For: no change. Against: it is an index into a list
  that now mutates under the player — deleting a track above the playing one
  silently switches which song is highlighted.
- **Track id. VERDICT.** `prev`/`next` still walk the flat list (so they cross
  genre boundaries as they do today), but the selection is an id.

### D8 — The playing track is deleted

Stop and clear to "No track". This is the owner's stated requirement ("if they
delete then the music player doesnt keep play it"). The alternative — advance
to the next track — starts playing something nobody asked for.

### D9 — Unknown durations

A visitor's own file has no duration until it is decoded. Render `--:--` and
fill it in from the audio element once that track is selected. Against
preloading metadata for the whole library: N requests / N idb reads on open,
for a column.

### D10 — Playing a local upload

`storage_type: 'local'` means the bytes are an idb-keyval blob, not a URL.
Resolve with `URL.createObjectURL` when the track is selected and revoke the
previous one on change and on destroy. Against resolving all of them up front:
leaks one object URL per track for the window's lifetime.

### D11 — Recycling stays clone-and-delete, NOT a move

A move (reparent into the bin, keep the id) would be simpler and would make
Restore trivial — but `parent` is not in `USER_FIELDS` (`seed.ts:63-70`), so
the next re-seed would not carry it and every recycled seed item would jump
back out of the bin into its original folder. Carrying `parent` instead is
worse: `merge_on_reseed` rebuilds `children` from the seed, so a carried
`parent` with a seed-owned `children` array is the documented dangling-child
trap. **No alternatives — forced by the re-seed contract.**

### D12 — How Restore finds its way home (owner decision: recreate the folder)

Recycling stamps three fields on every cloned node: `restore_id` (the original
id), `restore_authored` (the original `authored`), and on the top node
`restore_parent` + `restore_name` (the pre-collision-dedupe name).

Restore resolves its target in three steps:

1. `restore_parent` still exists → restore into it.
2. It does not, but the bin holds the clone of that folder (`restore_id ===
   restore_parent`) → restore **that** first, recursively, then land in it.
   This is what "recreate the original folder" means in practice, and it
   reuses the bin's own copy rather than fabricating a lookalike, so the
   folder's icon and dates come back intact.
3. Neither → the Desktop, which is protected and always exists. Only reachable
   by deleting a song, deleting its folder, then permanently deleting the
   folder from inside the bin.

Items are rebuilt at their **original ids**, which is strictly better than
today's clone semantics: a restored seed song is once again the seed's item, so
future content updates reach it, instead of becoming a private copy frozen at
the version it was deleted at. If an original id is somehow already live, the
restore falls back to a fresh id rather than overwriting it.

### D13 — `profile.music.genres` becomes generator-only

Nothing reads it at runtime after this. It still declares folder names and
order for `npm run generate:vfs`. Noted in `profile.ts` so it is not deleted as
dead config.

## Files

| File | Change |
| --- | --- |
| `src/lib/music/library.ts` | NEW — pure `build_library(drive, my_music_id, meta)` |
| `src/lib/music/library.test.ts` | NEW — the grouping rules, defects 1-6 as cases |
| `src/lib/music/manifest.ts` | header rewrite; add the id/url metadata index |
| `src/routes/xp/programs/music_player.svelte` | reactive library, id-based selection, object URLs, `--:--` |
| `src/lib/types.ts` | `restore_id` / `restore_parent` / `restore_name` / `restore_authored` |
| `src/lib/fs.ts` | `recycle_fs`, `restore_fs`; `clone_fs` gains an internal stamp hook |
| `src/lib/fs.test.ts` | recycle/restore, incl. the three target-resolution steps |
| `src/lib/components/xp/context_menu/CMFSItem.ts` | Delete calls `recycle_fs`; new Restore entry |
| `src/lib/data/profile.json` | `music.unsorted_label` |
| `src/lib/profile.ts` | type + validation for it |
| `e2e/music_player.spec.ts` | stop importing the manifest as the library |

## Regression risks

- **E2E asserts exact strings** (CLAUDE.md) and `music_player.spec.ts` imports
  `GENRES`/`TRACKS` as its expectation of the library. It has to derive them
  from the drive instead, or it will assert the old behaviour and pass.
- **SEED_VERSION must not move.** Nothing here changes seed content; if
  `src/lib/generated/seed_version.ts` changes, something is wrong.
- **Blob lifetime**: revoking an object URL still assigned to `audio.src`
  kills playback. Revoke the PREVIOUS url after the new one is assigned.
- **`del_fs` frees blobs by reference count** — restore must rebuild the item
  with the same `url` before the bin clone is deleted, or the bytes go.

## Red-team dispositions

Fresh-context review, find-problems framing (CLAUDE.md §11). Two of its
hypotheses were checked and cleared before anything else: `$hardDrive`
reactivity is NOT defeated by `fs.ts` returning the same object reference
(svelte's `mutable_source` uses `safe_equals`, and `RecycleBin.svelte:7-10` is
shipped proof), and `SEED_VERSION` cannot move from adding a `profile.json` key
the generator does not embed.

### ACCEPTED — D12 was wrong, and it was the hinge

Restoring at the **original id** fails in two of four orderings:

- **The owner renames a track between recycle and restore.** The re-seed drops
  the old id, so `previous` no longer holds it. Restoring at that id then
  produces an item that `is_dropped_seed_item` can never reap (`seed.ts:186`
  returns false when `previous[id] == null`) and `is_stale_placeholder` never
  matches — an immortal row pointing at a 404. That is precisely the failure
  `is_dropped_seed_item` exists to prevent.
- **A legacy drive with no `previous`** skips the tombstone block entirely, so
  the seed resurrects the original while the bin clone survives; restoring then
  mints a third copy.

**Restore is now a re-clone**: `clone_fs` into the resolved target, then
`del_fs` the bin clone. It inherits the tested name-dedupe (`fs.ts:254-266`),
the `authored: true` provenance stamp (`fs.ts:244`) and the blob
reference-counting (`fs.ts:147-157`) — and every ordering hazard above, plus
`restore_authored` and the id-collision fallback, ceases to exist. The honest
cost, stated rather than hidden: **a restored seed song becomes the visitor's
own copy and stops receiving future content updates.** `restore_id` survives
only as a breadcrumb for finding a folder's bin clone (step 2 below), never as
a restore target.

### ACCEPTED — the delete path has TWO callers, not one

`my_computer.svelte:274` (Explorer's File ▸ Delete) does the same
clone-then-delete pair as `CMFSItem.ts:292-299`. Changing one alone is worse
than changing neither: items deleted the ordinary way would reach the bin
unstamped and silently restore to the Desktop. Both move to `recycle_fs`, which
also takes the `protected_items` guard `clone_fs` lacks — `fs.ts:41-47` records
what happened last time a path bypassed that filter.

### ACCEPTED — deleting from inside a binned folder recycles it AGAIN

`is_permanent_delete` compares `parent === recycle_bin_id`
(`delete_prompt.ts:33-38`), but a recycled folder's children keep their own
parent, so deleting one from inside the bin clones it back to the bin instead
of destroying it. Pre-existing, and squarely in this feature's blast radius: it
mints unstamped top-level bin entries that Restore then cannot place. Fixed by
walking ancestors, the way `search_panel.svelte:24-33` already does.

### ACCEPTED — a pile of component-level defects

- `build_library` must return an empty library when `My Music` is missing,
  never `required()`-throw: a throw inside a `$:` pre-effect kills the mount.
- Group identity is the **folder id**, not its name; `open_genres` holds ids.
  "Unsorted" takes a sentinel key so a folder actually named `Unsorted` cannot
  collide and crash the `{#each}` with `each_key_duplicate`.
- Row labels come from the VFS `basename`, not the manifest title. For a seeded
  track those are the same string, so the sidecar shrinks to artist / cover /
  `cover_box` / duration and the title join disappears entirely.
- Selection with no track is index `-1`, which `prev_index`/`next_index`
  silently mishandle (`player.ts:7-16`). Next from nothing plays the first
  track, Previous the last.
- `format_duration`'s `'0:00'`-for-`NaN` contract is pinned
  (`manifest.test.ts:137-139`) and shared with the current-time cell, so
  `--:--` needs a SECOND formatter.
- Learned durations cannot live in the library (it is derived from
  `$hardDrive` and is destroyed by any drive write anywhere in the shell) —
  they need a component-level cache keyed by track id.
- Object URLs must be memoised by track id and resolved inside `select()`
  behind a generation token. Deriving them in the reactive library would mint a
  new blob URL on every unrelated drive mutation — an icon drag, any
  `date_modified` write — and restart playback from zero.
- `select()` must not lean on `$:` to land `src` before `play()`; that is a
  recorded gotcha and an async URL step makes it strictly worse.

### ACCEPTED — the existing E2E cannot go red

`e2e/music_player.spec.ts` imports `GENRES`/`TRACKS` as its expectation of the
library, and the VFS seed is generated from the same scan — so manifest and
drive agree by construction and every grouping/transport assertion passes
whether or not the player reads the drive. Defects 1-6 need **mutation tests**:
delete a track and watch the row go, delete a genre folder and watch the header
go, empty a genre and watch the header survive at `0`, add a folder and watch a
header appear. The Recycle Bin has no E2E coverage at all today.

### ACCEPTED with a changed verdict — D4 ordering

Verdict unchanged (`children` order) but the reviewer is right that the
reasoning was wrong. Two honest "against"s now recorded: `merge_on_reseed`
appends carried children to the END of a parent's array (`seed.ts:298-306`), so
a visitor's own song drifts to the bottom of its genre after a deploy; and
Explorer's sort is display-only (`viewer.svelte:127-152`) and never reorders
`children`, so a visitor who re-sorts a folder sees one order there and another
in the player. Alphabetical fixes both — and loses the owner's curated
within-genre order, because VFS names are ID3 titles while the curated order
lives in the `NN - ` filename prefixes. Deciding factor: a stranger's added
songs drifting to the end of a list is a smaller harm than scrambling the
owner's deliberate track order on every genre.

### OUT OF SCOPE, recorded

Open With on a second `.mp3` while the player is already open raises the window
without changing track — `focus_existing` returns before the launch payload is
read (`work_space.svelte:69-87`). Real, pre-existing, and not one of the seven
reported defects; id-based selection makes it a small follow-up.

## What actually shipped

All seven defects fixed, with the red-team's dispositions applied. Gates at the
time of the PR: 0 svelte-check errors / 128 warnings (baseline 131), eslint and
prettier clean, 953 unit tests, 162 Playwright `default` tests, `SEED_VERSION`
unchanged at `7c67757e` — a zero-re-seed change, confirmed by re-running
`npm run generate:vfs` and getting an empty diff.

### The bug the plan did not predict

The first E2E run came back with the player showing **"No track"**, no cover and
no highlighted row — while the `<audio>` element had the correct `src` loaded
and the right genre expanded. No console error.

The initial track was selected from a reactive statement
(`$: if (!started && flat.length > 0) begin()`). In Svelte 5's legacy mode a
`$:` block is a pre-effect, and **state written from inside one does not
invalidate the other `$:` statements**. `current_id` was set, and `select()`
went on to open the genre and set `src` — but `track` and `index`, each derived
from `current_id` in their own `$:` blocks, never recomputed. Instrumenting the
component showed it exactly: `current_id` a valid track id, `flat.length` 15,
`index` -1, `track` undefined. Clicking a row — the same `select()` call from an
event handler — propagated normally.

The fix is `onMount` for the one-shot initial selection. Two other statements
were hardened at the same time: the "playing track was deleted" guard now asks
`flat` directly instead of reading the derived `index`, because legacy blocks
run in source order rather than dependency order, so a guard reading another
block's result can act on a stale value. Recorded in CLAUDE.md's known traps.

## Follow-up — Restore's Desktop fallback had to stop being silent

Reported after the feature landed: *"Restoring a file from the recycle bin goes
to the desktop not its original location."*

Reproduced, and the cause is narrow. Restore puts an item back using the
breadcrumbs `recycle_fs` stamps on it. **Entries recycled before this feature
existed have none** — deleting was a plain `clone_fs` into the bin — so their
origin is unrecoverable and they fall to step 3, the Desktop. Any bin that
predates the feature is full of them, which is why it read as broken.

Confirmed it is a CLOSED population: Paste is excluded from the Recycle Bin in
both the item menu and the void menu (`CMFSVoid.ts:102`), and `recycle_fs` is
now the only way in, so no new un-stamped entry can be created. It shrinks to
nothing as bins are emptied.

There is no migration to write. The seed would know where a seeded file
belongs, but `starting.svelte` only fetches it when `SEED_VERSION` changes, so
it is not in memory to consult — and `hard_drive_seed_fields`, which IS
persisted, deliberately does not carry `parent`.

So the fix is to stop guessing silently. `plan_restore` was split out of
`restore_target` as a side-effect-free resolver, `restore_origin_known` asks it
"could this go home?", and the menu confirms first when the answer is no:
*"Windows cannot determine the original location of X. Restore to the Desktop
instead?"* One resolver, two callers — two hand-written copies would drift, and
the drifted one would be what silently moved a file.
