# Real music library: folder-driven, genre-grouped, with album art

**Status:** plan, red-teamed (gate 4 complete). Dispositions at the end.

Supersedes the Phase 3 note in `src/lib/music/manifest.ts` that makes the
hand-written `TRACKS` array the single source of truth, and closes the music
item in `docs/overthinking.txt`.

## What the owner asked for

> Real favourite music from me … note they will be full songs … should be
> fetched dynamically from the `static/audio/music` folder … categorized into
> custom genres I make, so maybe in `profile.json` we have music, under it
> genres, and per genre the path … I'd also like their album art if we can.

Answered in two settled decisions: **album art comes from the MP3s' embedded
tags**, and **Explorer's My Music mirrors the genre folders**.

## The two hard constraints

**There is no server.** "Fetched dynamically" cannot mean a runtime directory
listing on a static host. It means *the owner never hand-edits a list*: drop
files in, run `npm run generate:vfs`, everything appears. Discovery is
build-time; the result is committed.

**CI regenerates and diffs the seed** (`ci.yml:33-37` runs `npm run
generate:vfs` then `git diff --exit-code static/json/hard_drive.json
src/lib/generated`). So the scanner must be pure Node — `ffprobe` exists on the
owner's machine and cannot be relied on — and it must be **byte-deterministic**,
or CI goes red on an unrelated PR.

---

## 1. Track discovery

**Option A — scan `static/audio/music/<genre>/*.mp3` at generation time.**
*For:* exactly what was asked; adding a song is dropping a file; no list to
drift. *Against:* the mp3 bytes become an input to the generated output, which
`manifest.ts:9-16` deliberately avoided (see §7).

**Option B — keep the hand-written array.**
*For:* zero new machinery; ids and metadata fully controlled.
*Against:* it is the thing the owner explicitly asked to stop doing, and 15
tracks × 6 fields is exactly where a hand-kept list drifts.

**Verdict: A.** Deciding factor: the request is specifically about not
maintaining a list. §7 shows the drift protection survives.

## 2. Where genres are declared

**Option A — folder name is the genre, `profile.json` declares order + display name.**
```json
"music": { "genres": [ { "dir": "tarab", "name": "Tarab" }, … ] }
```
*For:* satisfies both halves of the request — genres live in `profile.json`
with their path, tracks are discovered from disk. Display name is free of
filesystem constraints (spaces, casing, Arabic). Order is explicit rather than
alphabetical accident. *Against:* two places to touch when adding a whole new
genre (make the folder, add the entry).

**Option B — folder names alone, no `profile.json` entry.**
*For:* one place. *Against:* genre order becomes readdir order, display names
inherit folder-name constraints, and the owner explicitly asked for genres in
`profile.json`.

**Option C — `profile.json` lists every track with its genre.**
*For:* total control. *Against:* it is the hand-written list again, just moved.

**Verdict: A.** Deciding factor: it is the only option that puts genres in
`profile.json` (as asked) without putting *tracks* there (as asked against).

**A declared genre whose folder is missing, and a folder no genre declares, are
both hard errors.** A silent skip means a pasted album quietly does not appear,
which is the worst failure this feature can have.

## 3. Metadata extraction

**Option A — `music-metadata` as a devDependency.**
*For:* one call yields duration, title, artist AND the embedded cover; pure
Node (ESM, engines `>=18`), so CI works; 558KB unpacked and build-time only, so
it never reaches the client bundle. *Against:* 10 transitive deps for a build
step; `npm audit` surface grows.

**Option B — `ffprobe`.**
*For:* already on the owner's machine, no npm dep. *Against:* GitHub's runner
image is not a contract; a runner change turns the freshness gate red with a
confusing error. Rejected on the constraint above.

**Option C — hand-roll an ID3v2 + MPEG-frame parser.**
*For:* no dependency at all. *Against:* VBR/Xing headers, ID3v2.3-vs-2.4
unsynchronisation, and APIC extraction are exactly the fiddly work a library
exists for; a subtle bug shows up as a wrong duration, not a crash.

**Verdict: A.** Deciding factor: it is the only option that is both
CI-portable and gets album art without the owner supplying images.

## 4. Cover art storage

**Option A — extract to `static/assets/covers/<sha256-12>.jpg`, manifest holds the URL.**
*For:* content-addressed, so identical art across an album is stored once and
re-running the generator is a no-op; served as a plain static file the browser
caches. *Against:* writes binaries outside the paths the freshness gate diffs
(see §8); adds ~1.5MB of committed images.

**Option B — inline base64 in the generated manifest.**
*For:* nothing to write outside `src/lib/generated`, so the existing gate
covers it. *Against:* a ~100KB cover becomes ~133KB of JS **in the client
bundle**, ×15. Parsed and shipped on every visit for art most visitors never
see. Rejected on weight.

**Option C — sidecar images the owner supplies.**
*For:* no extraction, fully deterministic. *Against:* the settled decision is
embedded art; this puts the work back on the owner.

**Verdict: A**, with the gate extended per §8. Deciding factor: covers are
images and belong in the image pipeline, not in a JS module.

**A track with no embedded art is not an error** — the manifest records
`cover: null` and the player falls back to the WMP icon. Requiring art would
make one untagged file fail the build.

## 5. Stable track ids

`manifest.ts:21-25` records that ids are permanent because `merge_on_reseed`
carries any cached item absent from a later seed and there is no way to reap
one. Under a folder-driven system, ids are derived rather than chosen.

**Option A — `sha256(genre_dir + '/' + filename)`, truncated.**
*For:* deterministic, collision-free in practice, no state to maintain.
*Against:* **renaming a file changes its id**, so the old entry becomes an
orphan — see §6, which is what makes this survivable.

**Option B — sha256 of the audio bytes.**
*For:* rename-proof; the id follows the song. *Against:* re-encoding the same
song changes the id, which is the more likely operation of the two; and it
makes the id depend on content the owner may re-export.

**Option C — an explicit id per track in `profile.json`.**
*For:* fully stable across both rename and re-encode. *Against:* it is the
hand-maintained list again, and the owner would have to invent ids.

**Verdict: A**, and §6 is a hard prerequisite. Deciding factor: renames are
recoverable once orphans are reaped; without §6 no option here is safe.

## 6. Reaping vanished seed items — a GENERAL rule, not a music one

`is_stale_placeholder` (`seed.ts:29-37`) drops exactly one class of vanished
seed item: `storage_type === 'fake' && executable === true`, a pruned program.
A track is `remote` and not executable, so a track the owner deletes or renames
persists forever in every returning visitor's My Music, pointing at a 404.

**Option A — extend `is_stale_placeholder` to know about music genre folders.**
*For:* narrow. *Against:* **it does not work, and fails on day one.** Traced:
the three existing demo tracks have `parent === MY_MUSIC`, which is not a genre
folder, so the predicate never matches them; `merge_on_reseed` carries them
(`seed.ts:169-183`) and relinks them into My Music. Returning visitors would
get three stranded tracks *plus* the new genre folders while new visitors get
only the folders — two different products. It also cannot reap a **renamed
genre folder**, which is `type: 'folder'` with no `storage_type` at all, so the
folder and its whole subtree are carried as a permanent ghost of 404s. And its
stated safety argument is wrong: a visitor's uploaded mp3 is protected by the
`remote` clause, not by `authored` — `new_fs_item_raw` (`fs.ts:308-326`) sets
`storage_type: 'local'` and **never stamps `authored`**, so relaxing that clause
to fix the first bug would start deleting visitor uploads.

**Option B — reap by parent being any generated folder.** *Against:* widens the
riskiest function in the codebase, whose header documents a production incident.

**Option C — accept the orphans.** *Against:* a compounding defect.

**Option D — infer from the snapshot `merge_on_reseed` already receives.**
`snapshot_seed_fields` (`seed.ts:97-108`) records an entry for **every id the
seed the visitor actually received contained**. So:

> An id present in `previous`, present in `cached`, absent from the new `seed`,
> and not authored by the visitor, came from an older seed and the new seed
> dropped it. Reap it.

*For:* this is **recorded provenance, not inference about shape** — the exact
lesson `is_stale_placeholder`'s own header teaches ("Provenance has to be
RECORDED, not inferred"). It is the mirror image of the tombstone block already
at `seed.ts:200-221`, which uses the same snapshot to infer visitor deletions,
including its `previous == null` fallback. It fixes all four cases at once: the
stranded demo tracks, renamed/removed genre folders, moved tracks, and every
future pruned seed item of any kind — with **zero music knowledge in
`seed.ts`**, so no import from generated code and `seed.test.ts` stays
feature-agnostic. *Against:* it is a behaviour change to `merge_on_reseed`
affecting every seed item, not just music.

**Verdict: D.** Deciding factor: A is broken on the day it ships and B/C are
worse; D is the only option that uses provenance the function already has.

**The one guard D needs.** A seed item the visitor overwrote with their own
bytes — `save_file` (`fs.ts:486-494`) flips `url`/`storage_type` on a *seed* id
when Paint saves over a wallpaper — must not be reaped. Compare
`cached[id].storage_type` against `previous[id].storage_type`; if it changed,
the visitor's bytes are in there, so carry it. Without this, D is more
destructive than today's behaviour in exactly one case.

## 7. What the mp3 bytes are allowed to affect

`manifest.ts:9-16` hand-writes `size_kb` **specifically** so mp3 bytes never
become an input to `SEED_VERSION`; a re-encode would otherwise silently
re-seed every returning visitor.

Scanning reintroduces exactly that path — `size` is in the seed. The protection
is not lost, it moves: the generated manifest is **committed**, and CI diffs
`src/lib/generated`. A re-encode now shows up as a red freshness gate and a
visible diff, rather than a silent bump. That is equal or better than a test
asserting hand-written numbers, and it is automatic.

**`duration_s` stays OUT of the VFS seed** (it is player metadata, not file
metadata), so only `size` reaches `SEED_VERSION` — unchanged from today.

## 8. CI freshness gate scope

The gate runs `git diff --exit-code static/json/hard_drive.json
src/lib/generated`. Two holes, both verified:

**`git diff` cannot see an untracked file.** Reproduced in a scratch repo:
create `covers/a.jpg`, `git diff --exit-code covers` exits **0**. So the common
case — the owner adds a song and forgets to commit its extracted cover — sails
through. The gate must use `git status --porcelain --untracked-files=all` and
fail on non-empty output.

**`git diff` cannot see a file that should no longer exist.** Nothing prunes
covers whose track is gone, and an unchanged stale file produces no diff. So the
generator must **own** `static/assets/covers/` — clear it, rewrite it — which
turns a removal into a tracked-file deletion the check can see.

That ownership contradicts §4's "re-running the generator is a no-op": it is a
no-op in *content* (content-addressed names are stable) but no longer in
*directory state*. Recorded here rather than left as a contradiction.

## 9. Generated manifest location

`src/lib/music/manifest.ts` is hand-written today and exports both `TRACKS` and
`format_duration`. **Verdict:** tracks move to `src/lib/generated/music.ts`
(covered by the gate, marked generated); `manifest.ts` keeps `format_duration`
and re-exports, so `music_player.svelte` and `player.ts` need no import churn.
Deciding factor: `src/lib/generated/*` is the established home for generated
code and CLAUDE.md forbids hand-editing it — which is the property wanted here.

**Three things this relocation breaks if not stated:**

1. **A bootstrap cycle.** `generate-vfs.ts:17` imports `TRACKS` from
   `manifest.ts`, which under this plan re-exports the generator's own output.
   If the seed is built from that import, a run with a stale `music.ts` writes a
   fresh manifest *and* seeds from the previous one — converging only on a
   second run, while CI runs it once and diffs. **The generator must build the
   seed from its in-memory scan result and treat `music.ts` as pure output,
   never re-importing it.**
2. **Prettier.** `generate-vfs.ts:244-247` formats exactly `seed_version.ts` and
   `vfs_ids.ts`. `music.ts` must join that list or `npm run format:check`
   (`ci.yml:30-31`) fails.
3. **Coverage.** `vitest.config.ts` includes `src/**/*.ts` with no exclusion for
   `src/lib/generated`, and CI runs `diff-cover --fail-under 80` on changed
   lines. A generated data module's lines execute on import, so they count as
   covered only while a test imports it — to be confirmed, not assumed.

## 10. Explorer structure

Settled: My Music gets a folder per genre. Folder ids are
`sha256('genre:' + dir)` truncated, by the same argument as §5. Tracks parent
to their genre folder rather than to My Music.

## 11. Player grouping

**Option A — one flat ordered list with a sticky genre header per group.**
*For:* next/prev still walk all 15 in order, which is what a favourites mix
wants; the whole library stays visible in one scroll. *Against:* a long list in
a 470px window.

**Option B — a genre selector that filters the list.**
*For:* shorter list. *Against:* next/prev either stop at a genre boundary
(surprising) or cross it while the filter says otherwise (incoherent).

**Verdict: A.** Deciding factor: prev/next semantics stay obvious, and the
existing `next_index`/`prev_index` helpers keep working unchanged.

## 12. Failure modes the generator must handle loudly

| Case | Behaviour |
| --- | --- |
| Genre declared in `profile.json`, folder missing | throw, naming the dir |
| Folder present, no genre declares it | throw, naming the dir |
| Genre folder with no `.mp3` | throw — an empty genre is a mistake |
| Two tracks with the same id | throw, naming both paths |
| Unreadable/corrupt mp3 | throw, naming the file |
| Missing embedded cover | `cover: null`, no error |
| Missing title tag | fall back to the filename without extension |

## Testing

- `generate-vfs` scanning: fixture folders under a tmp dir, asserting the
  manifest shape, id stability, and every §12 error.
- `seed.test.ts`: a removed track IS reaped; a visitor's `authored` file in a
  genre folder is NOT.
- Player: genre grouping, cover fallback, prev/next across genre boundaries.
- E2E: My Music shows genre folders; a genre folder lists its tracks;
  double-clicking one opens the player at that track with its art.
- Mutation-verify each.

## Out of scope

Which audio the owner ships, and its bitrate. Recorded for them: MP3 CBR
44.1kHz; at 128kbps 15 four-minute songs are ~57MB and fit the 128MB drive
comfortably, 192kbps ~86MB fits tightly, 320kbps ~144MB overflows. Most of the
named list is commercial copyright, which is the owner's call to make knowingly.


---

## Addenda forced by the red-team (gate 4)

### A1. Sort order — the determinism the plan declared and never implemented

`fs.readdirSync` has **no documented ordering guarantee**. Its order feeds the
track list, each genre folder's `children`, and therefore `JSON.stringify(seed)`
→ `SEED_VERSION`. The owner's filesystem and the CI runner's need not agree, and
a mismatch is a permanently red freshness gate whose diff looks like reordered
JSON with no obvious cause.

**Every listing is explicitly sorted** — genres by their `profile.json` order,
tracks by filename with `localeCompare(…, 'en', { numeric: true })` so `10.mp3`
follows `9.mp3`. Filename order also means the owner controls playback order by
prefixing (`01 - …`), which is the convention every music player already uses.

### A2. The three demo tracks

Deleted, along with `scripts/gen-tracks.sh`. They are synthetic 40-second clips
generated for Phase 3; keeping them beside real music is noise, and leaving them
loose in My Music while everything else lives in genre folders is the
two-different-products bug in §6.

Their removal is also the **end-to-end proof of §6D**: three ids present in
`previous`, absent from the new seed, not authored — exactly the case the new
reap rule exists for. `seed.test.ts` asserts it directly.

Until the owner's files land, a `demo` genre holds them so the pipeline is
testable. If the real music arrives before the next deploy — which is blocked
until Sept 11 — that folder never reaches production.

### A3. `music-metadata` usage

- **Pinned exactly** (`"music-metadata": "11.15.0"`, no caret), matching the
  precedent set by `pyodide: 0.28.3`, `@xterm/xterm: 6.0.0` and `three: 0.136.0`.
  A `^` range plus `npm audit fix` would silently rewrite generated output.
- **`npx -y npm@10 install`** after the dependency change — CLAUDE.md's first
  hard rule, and the one this repo has broken before.
- **`{ duration: true }`** must be passed explicitly, and a missing or zero
  duration is a hard error: `progress_ratio` returns 0 forever on a zero
  duration, so the seek bar would be silently dead rather than visibly broken.
- `format.duration` is a float; `Math.round` to whole seconds, matching
  `Track.duration_s`'s documented units.

### A4. Cover art details

- **Extension from `picture.format`**, never hardcoded `.jpg` — ID3 `APIC`
  legitimately carries `image/png`, and ID3v2.2 uses a 3-character format code
  rather than a MIME type.
- **No resizing.** `sharp` is a native binary whose output is not stable across
  versions — strictly worse determinism than the `ffprobe` dependency §3
  rejected. Covers ship as extracted. The generator **warns** above 400KB so a
  3000×3000 cover is a visible choice rather than a silent 15MB of git history.
- **Where it renders** is a real sub-decision the plan skipped. The player's top
  120px is the visualiser canvas (`music_player.svelte:204-211`), a Phase 3
  exit-criterion surface. Verdict: the art renders **beside** the track title in
  the transport strip at ~48px, not in place of the visualiser. Deciding factor:
  removing the visualiser to make room would regress a shipped feature to add an
  unrequested one.

### A5. Id details

- Truncation is **16 hex characters** of the sha256, stated rather than implied.
- The id input includes the genre dir, so **moving a track between genres
  changes its id** — a more likely curation act than renaming. Safe only because
  of §6D; called out because §5's original "Against" named renames alone.

### A6. Filename charset policy

A filename becomes three things at once: a URL path segment, a VFS `name`, and
an id-hash input. `#`, `?` and `%` make the URL unreachable on Netlify (`#`
truncates at the fragment), and `/` or `\\` are path traversal. **Hard error on
any of them.** Non-ASCII is allowed — `encodeURI` per segment handles Arabic —
but the id then depends on the bytes' Unicode normalisation form, so a file
added from macOS (NFD) and re-saved as NFC changes id. Documented, not
prevented; §6D makes it survivable.

### A7. Seed item fields

Timestamps are **`SEED_EPOCH`**, never file mtimes — mtimes are checkout time in
CI and therefore *guaranteed* to differ from the owner's, which would make the
freshness gate permanently red. Genre folders take
`/images/xp/icons/MyMusic.png` and do **not** set `starting_point` (that marks
shell locations, and these are ordinary folders).

### A8. Tests this breaks — CLAUDE.md requires same-commit updates

- `e2e/music_player.spec.ts:43-52` asserts exactly 3 rows named Ascent/Pulse/Drift.
- `e2e/music_player.spec.ts:151-180` is **load-bearing**, not cosmetic: it is the
  only coverage of the Details-column-KB vs status-bar-MB divergence, and its
  own comment records that My Music was the first visible folder over 1 MB. It
  asserts `'501 KB'`, `'167 KB'` and `/1\\.1[0-9] MB/` **in My Music**, which
  under §10 holds only folders. The coverage moves down one level into a genre
  folder with that genre's real numbers; it is not deleted.
- `src/lib/music/manifest.test.ts` `size_kb`-vs-`statSync` and seed-derivation
  tests are rewritten against the generated manifest.
- **Correction to this plan's own testing section:** it claimed double-clicking
  a track opens the Music Player. It does not, and `manifest.test.ts:96-112`
  exists to keep it that way — `doctypes['.mp3'][0]` is Media Player Classic and
  every consumer takes `[0]` unconditionally. The Music Player is reached via
  Open With or the Start menu. The E2E asserts the shipped behaviour.
- Scanner logic lives in `src/lib/music/scan.ts`, not in `scripts/`, so it is
  inside vitest's `include: ['src/**/*.test.ts']` and can be mutation-tested at
  all. `generate-vfs.ts` calls it.

### A9. Operational costs, recorded

~57–86 MB of binary blobs enter git history permanently and cannot be removed
without a rewrite; `actions/checkout` with `fetch-depth: 0` (`ci.yml:12-14`)
clones all of it on every CI run. A visitor who plays a few songs pulls 10–20 MB
of Netlify bandwidth. Neither blocks the feature; both are the owner's to know.

### A10. Confirmed NOT problems

Checked so nobody re-litigates them: the generated manifest is a few KB and is
imported only by the dynamically-loaded player, so it never reaches first paint;
`music_player.svelte:299-309` binds ONE `<audio>` to the current track with
`preload="metadata"`, so 15 full songs cost nothing up front; `next_index` /
`prev_index` / `bar_heights` / `create_source_cache` take length as a parameter
and assume no track count.

## Red-team dispositions

| Finding | Grade | Disposition |
| --- | --- | --- |
| §6 Option A **fails on day one** — the demo tracks' parent is My Music, not a genre folder, so they are carried; renamed genre folders are carried with their whole subtree; and the `authored` guard is not what protects visitor uploads (`new_fs_item_raw` never stamps it) | Wrong | **Accepted — all three traced and confirmed.** §6 replaced with the snapshot-derived rule the reviewer proposed. |
| A snapshot-derived reap rule (Option D) is strictly better than A/B/C and needs no music knowledge in `seed.ts` | highest-leverage | **Accepted.** Verified `snapshot_seed_fields` records an entry for every seed id, and that `seed.ts:200-221` is the same shape. Its one guard (storage_type changed ⇒ visitor's bytes ⇒ carry) is written into §6. |
| §8's gate does not work: `git diff --exit-code <dir>` exits 0 for an untracked file | Wrong | **Accepted — reproduced in a scratch repo.** Gate becomes `git status --porcelain --untracked-files=all`, and the generator owns/prunes the covers directory. |
| §9 hides a bootstrap cycle: `generate-vfs.ts:17` imports what the generator writes | Weak | **Accepted — confirmed at that line.** The generator seeds from its in-memory scan and never re-imports its output. |
| No sort order anywhere, while byte-determinism is declared a hard constraint | missing | **Accepted.** A1. |
| `music-metadata` unpinned; `npx -y npm@10 install` unmentioned; `{duration:true}` unnamed | Weak | **Accepted.** A3. |
| Cover extension hardcoded `.jpg`; no size policy; nowhere in the player actually renders art | Weak | **Accepted.** A4, including the verdict not to displace the visualiser. |
| The three demo tracks' fate is never decided | missing | **Accepted.** A2 — deleted, and their removal is the test case for the new reap rule. |
| `e2e/music_player.spec.ts:151-180` is load-bearing coverage of a documented divergence rule, not a cosmetic string | Weak | **Accepted.** A8 — relocated, not deleted. |
| The plan's own testing line contradicts the shipped `.mp3` association | Weak | **Accepted, and it was my error.** A8. |
| Filename charset: `#?%` unreachable, `/` traversal, Unicode normalisation affects ids | missing | **Accepted.** A6. |
| `SEED_EPOCH` vs file mtimes; genre folder icon; `starting_point` | missing | **Accepted.** A7. |
| Scanner in `scripts/` is outside vitest's include glob, so "mutation-verify each" is not achievable as written | Weak | **Accepted.** A8 — logic moves to `src/lib/music/scan.ts`. |
| `dir` is unvalidated free text used as a path segment | missing | **Accepted.** A6 covers it; `dir` is validated against `^[a-z0-9-]+$`. |
| Same song file in two genres → duplicate rows and an `index_for` URL collision | missing | **Accepted.** Duplicate audio content across genres is a hard error in §12. |
| §7 asserts the re-seed trade away rather than arguing it | Weak | **Accepted as framing.** The verdict stands — visibility via a committed, diffed manifest is the protection — but it is now stated as a real cost: any re-encode of any one track re-seeds the whole visitor population. That is acceptable *only because* §6D makes re-seeds safe; before §6D it would not have been. |
| Git history weight and Netlify bandwidth are dodged as out-of-scope | Acceptable | **Accepted.** A9. |
| Bundle size, first-paint preload, player helper assumptions | — | **Confirmed non-problems.** A10 records them so they are not re-litigated. |


---

## Adding the real music (the owner's checklist)

**Format:** MP3, **CBR**, 44.1 kHz stereo. CBR specifically — variable bitrate
without a Xing header makes the seek bar land in the wrong place in some
browsers. **128 kbps**: 15 four-minute songs is ~57 MB, which fits the 128 MB
C: drive comfortably. 192 kbps (~86 MB) fits tightly; 320 kbps (~144 MB)
overflows it.

**Layout** — the folder name is the genre, and track order within a genre is
FILENAME order, so prefix to control it:

```
static/audio/music/
  arabic-ballads/   01 - Shedeeny.mp3   02 - Waili.mp3   03 - bya3een el sabr.mp3
  egyptian-rap/     01 - Laqta.mp3      02 - Free.mp3    03 - El Neyya.mp3   04 - Mantika.mp3
  pop/              01 - Shape of You.mp3   02 - Far Away.mp3
  hip-hop/          01 - Middle Child.mp3   02 - Heartless.mp3   03 - Bound 2.mp3
                    04 - All the stars.mp3  05 - Swimming Pools.mp3  06 - i.mp3
```

**Then paste this into `profile.json` under `"music"`, replacing the `demo`
entry**, and delete `static/audio/music/demo/`:

```json
"genres": [
    { "dir": "arabic-ballads", "name": "Arabic Ballads" },
    { "dir": "egyptian-rap", "name": "Egyptian Rap" },
    { "dir": "pop", "name": "Pop" },
    { "dir": "hip-hop", "name": "Hip Hop" }
]
```

**Then `npm run generate:vfs`.** That is the whole loop.

### Renaming a genre later is a TWO-part edit, on purpose

The folder and its `profile.json` `dir` must match. Renaming only one is a hard
error, not a silent skip — a genre that quietly stops appearing is the worst
failure this feature can have. Both error messages hand over the fix: an
undeclared folder prints the exact JSON line to paste, and a declared genre with
no folder says the two must match.

A rename also mints new ids for the folder and every track in it (ids are
`sha256(genre/filename)`), which strands the old ones — handled by the reap
rule in §6, and asserted in `seed.test.ts`.

### Copyright

The owner's decision, taken knowingly: ship the tracks and carry a notice. It
lives in `profile.json` as `music.notice` — content, not component text, per
CLAUDE.md — and renders in the player:

> All music legally acquired™ · personal listening only, not for distribution.

A notice is not a licence. It states intent and it is what the owner asked for;
the underlying exposure is unchanged and was raised before the decision.
