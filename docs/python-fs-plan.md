# Python filesystem plan — implementation (v2)

**Spec:** `docs/python-fs-spec.md` v2. **Status:** v2, rewritten after the
gate-4 red team. Nothing is implemented.

---

## 0. What changed from v1

Two tasks graded **Wrong**, three **Weak**. Every claim I checked held. As at
gate 2, **v2 is smaller** — the two biggest changes both delete work.

**1. T1 is deleted. `cat` is not touched at all.** v1 justified a shared
renderer as "forced by a shipped invariant", quoting `fs_commands.ts:135-138`.
That comment is an aspiration, not an invariant: `registry.ts:124-133` already
renders `projects` its own way (`heading(name)` + indented description + dim
`wrap_items` chips) without going through `resolve_portfolio_ref` at all. Two
renderers already exist and have already drifted. So there is a zero-risk path
v1 never weighed — `mirror.ts` builds on `resolve_portfolio_ref` + `format.ts`
exactly as `registry.ts` does, and shipped `cat` output never moves.

The deeper reason to drop it: v1 promised byte-identity to `cat`, which is
**unreachable through a `string[]` interface** (the meta, body, chip and image
lines are all "two spaces then text" as plain strings but differently coloured,
so a colouriser would have to guess). And byte-identity is the *wrong goal*
anyway — `cat`'s output is hard-wrapped at 68 columns and ends with
`[3 images — open this file in My Computer to see them]`. That is a terminal
artefact; a `.txt` a visitor reads with `open().read()` should have neither.
"Byte-identical to `cat`" and "a sensible file" are mutually exclusive.

**2. The mirror ships inside the existing `init` message.** v1 sent it as a new
`mirror` message on `ready`, which contradicted its own spec: the worker cannot
build `/c` *before* `ready` (spec D-F10) from a tree that arrives *after* it
(plan T4). Criteria 1 and 8 were false as specified.

`client.ts:116-121` already posts `{kind:'init', index_url, greeting,
worker_source}` and the sandbox already forwards those fields. One more field:

- resolves the contradiction — `/c` is built, `chmod`ed and `chdir`ed before
  `send({kind:'ready'})`, so it exists at the first prompt;
- **deletes the `static/html/python-sandbox.html` change entirely** — the one
  file outside ESLint, prettier and coverage;
- deletes the worker readiness guard, the E2E built on it, and the claim that
  motivated both (`worker_source.ts:120-127` is an if/else-if chain with **no
  else**; an unknown kind is a silent no-op and cannot throw — v1's stated
  rationale was simply wrong);
- makes `ToRuntime` need no new variant, so `protocol.ts` changes only for the
  inbound direction, which is the one that needs validating.

**Other corrections applied below:** T5 must edit `repl.ts` (verified: TS2366 —
`on_runtime_message` ends at `repl.ts:188` with no `default` and no trailing
return, so extending `FromRuntime` breaks `npm run check`); the per-session
name→id map is replaced by a derived lookup; the rate limit was self-defeating;
`save_file` leaks a blob per overwrite; and T2 breaks a shipped unit test.

---

## 1. Tasks

```
T2  seed folder + generated id       (data + one shipped test + protected_items)
T3  cat reads saved files            (async in the component; closes D-F16)
T4  the mirror, shipped in `init`    (read half; no write path)
T5  the save channel                 (the security boundary, last)
```

### T2 — `C:\My Documents\Python`

**Files:** `scripts/vfs-base.json` (two folders, `My Music`'s shape),
`scripts/generate-vfs.ts` (link into C:'s children as at `:100-102`; export
`PYTHON_FOLDER_ID`), `src/lib/system.ts` (`protected_items`), regenerated
`hard_drive.json` + `vfs_ids.ts`.

**It is not "data only" — three corrections:**

- **It breaks `complete.test.ts:166`**, which asserts
  `expect(second.candidates).toEqual(['My Music/', 'My Pictures/'])`. Adding
  `My Documents` makes that three entries. Fix in the same commit. (Checked:
  `complete.test.ts:156` and `e2e/cmd.spec.ts:224-228` key off `My Mu`, still
  unique; `'cd My '` common-prefix survives.)
- **It bumps `SEED_VERSION`, so every returning visitor re-seeds.** Production
  has been live since 2026-08-23 and `seed.ts:47-49` records the Phase 3 bump
  as the first re-seed against real user data. This is the second, and it is
  the largest storage-risk event in the feature. It is safe *because*
  `children` is not in `USER_FIELDS` (`seed.ts:56-83`), so the visitor's C:
  takes the new children array while the carry loop (`seed.ts:243-256`)
  re-links their own files — but that is the non-obvious half and it goes in
  the guide.
- **`protected_items` is a behaviour change** on a shipped surface: it feeds
  `clip()` (`fs.ts:42-44`) and the context menu. *Checked, and clear:* no E2E
  asserts an arbitrary folder is deletable — `xp_chrome_g.spec.ts:143-150`
  deletes the résumé, which is not protected, and nothing counts C:'s children.

**Undecided, now decided:** `My Documents` also joins `system.ts`'s
`my_computer`, matching `My Music` and `My Pictures`, so it appears in the My
Computer root rather than being the odd one out — and so it inherits
`protected_items` through the existing spread.

**Tests:** extend `seed.test.ts`'s content-hash check; assert both folders
exist, are linked, and that `PYTHON_FOLDER_ID` is protected. The typo that the
freshness gate would *not* catch is caught by the dangling parent/child
validation at `generate-vfs.ts:149-163` — name that as the mechanism rather
than claiming the hash covers it.

### T3 — `cat` reads a saved file

`run_fs` stays pure; `run_cat` returns `read_file?: { id, name }` and
`cmd.svelte` performs the async read, as it already does for `python`,
`matrix` and `hack`.

**Five things v1 skipped:**

- **A busy state.** `cmd.svelte:648-659` dispatches synchronously and there is
  no guard on the shell path. Without one: `cat notes.txt` suspends, the
  visitor presses Enter, a fresh prompt is written, then the file lands *after*
  it. Needs an input-suppression flag, a Ctrl+C path, and a
  `term?.is_disposed()` guard — `on_python_message` (`cmd.svelte:381`) is the
  model.
- **`get_file` throws on the likeliest target.** `fs.ts:565-575` does
  `required(fs_item.url, …)`, and Explorer's File ▸ New ▸ Text Document creates
  a `local` item with no payload. `portfolio_viewer.svelte:48-52` handles this
  by rendering `''`; `cat` must too, or the first thing a visitor tries is an
  unhandled rejection.
- **Its own cap, not the viewer's.** `MAX_TEXT_BYTES` is a module-private
  `const` in `portfolio_viewer.svelte:36` (extracting it is an unnamed file
  change) and its value is 1 MB — enough text to lock the terminal through
  `write_lines`. `cat` gets a smaller byte cap **and** a line cap.
- **Binary detection needs a mechanism.** `file.text()` does not throw on
  binary; it substitutes replacement characters. Use
  `new TextDecoder('utf-8', { fatal: true })` and fall back to `described()`.
  Without it, `cat photo.jpg` streams raw bytes — every `0x1b` included — into
  xterm.
- **A superseded-note in `docs/cmd-filesystem-plan.md` D7**, which locked "no
  async `cat`". CLAUDE.md requires it.

### T4 — the mirror

**Files:** `src/lib/python/mirror.ts` (new, pure: `build_mirror(profile)` over
`resolve_portfolio_ref` + `format.ts`, no VFS read, no IndexedDB, seed content
only); `src/lib/python/client.ts` (one more `init` field);
`src/lib/python/worker_source.ts` (a `pyodide.runPython` block before
`send({kind:'ready'})`: remove `/tmp`, build `/c`, `chmod 0o500` the read-only
tree, leave the outbox writable, `chdir('/c')`).

**`static/html/python-sandbox.html` is NOT touched** — that is the point of
shipping in `init`.

**Crossing the JS→Python boundary:** via `pyodide.globals.set(...)` + `.to_py()`,
never string interpolation. The shipped data kills the naive version —
`Momad's XP.txt` has an apostrophe and the entry names carry `—`, `–` and `·`.
Stated here because the failure would surface as a red E2E with no stack trace,
inside an unlinted `String.raw` template.

**Two behaviours to state rather than default:**

- The outbox scan is **non-recursive**. `os.makedirs` inside it works in MEMFS,
  and its contents are silently not saved. The alternative — recursing and then
  rejecting every name containing `/` — produces one stderr line per statement
  forever. Non-recursive plus a guide note is the lesser evil.
- The outbox starts **empty**, so a returning visitor's saved files are visible
  to CMD's `ls` but not to Python's `open()` until they re-save. That is the
  direct price of the seed-only mirror (spec §0 point 3) and it is correct, but
  it means "one vocabulary with CMD" is false for exactly the directory the
  visitor cares about. It goes in the guide.

**`chmod` is honesty, not security** — MEMFS lets the owner chmod it back. The
E2E for criterion 2 must not be read as a security proof, and the guide must
not call `/c` read-only in a security sense.

### T5 — the save channel

**The file list v1 omitted:** extending `FromRuntime` breaks `npm run check`
(TS2366, verified — `repl.ts`'s switch is exhaustive with no default and no
trailing return). So T5 necessarily edits `repl.ts`, `repl.test.ts`,
`protocol.ts`'s `FROM_KINDS`, and either `client.ts` (a new `on_save` option)
or both hosts.

**Which re-opens v1's structural verdict, honestly this time.** v1 put the
logic in a new `host_fs.ts` on the grounds that "`repl.ts` stays untouched, so
its invariant survives verbatim". That justification is false. The verdict
survives on a different, better one: `repl.ts` gains a `save` case that emits
**no effect at all** (`{ state, effects: [] }`) and the message is intercepted
in `client.ts` before `on_message`. So `repl.ts`'s pure state machine still
cannot reach storage — the invariant becomes "`on_runtime_message` emits only
`write` and `focus`, and `save` is handled before it is ever called", which is
checkable by a test rather than by a comment.

**Derived lookup, not a per-session map.** v1's `Map<name, id>` loses data on
four shipped gestures: `exit()` + `python` or a reload empties it (so criterion
4 fails in the most likely flow — iterate, leave, come back — producing
`main 2.py`); deleting the file in Explorer leaves a dead id and `save_file`
**returns silently** (`fs.ts:479-482`), discarding every later save of that name
while reporting success; renaming it means the next save overwrites the file
they renamed to keep. **Instead: at save time, find the child of
`PYTHON_FOLDER_ID` in `$hardDrive` whose `name` matches the normalised name.**
Stateless, survives everything, makes two sessions converge on last-write-wins
instead of `main 2.py`, and turns the 100-file cap into `children.length`.

**Free the old blob.** `save_file` (`fs.ts:477-499`) mints a new url and
`idb.set`s it **without deleting the previous one**, and never updates `size`.
500 saves × 256 KB is ~128 MB of orphaned blobs per session, invisible in
Explorer. `host_fs` reads the item's old `url` before saving and `idb.del`s it
after. (`save_file` itself is shipped and used by Paint; not changing it here.)

**The rate limit v1 chose was self-defeating.** 5 saves/second against
`desktop.svelte:57-62`'s 1000 ms debounce means the drive is *never* persisted
while saving continues — the exact failure the limit exists to prevent, now
reachable by a legitimate `for i in range(1000)` loop. And `new_fs_item_raw`
fires **two** notifications per create (`fs.ts:441-455`). **Verdict: ≤1 save
per 2 s**, which is generous for a human and hostile to a loop.

**Dropping the message is too late to stop a flood.** The sandbox relays every
worker message unconditionally (`python-sandbox.html:65`) and the frame shares
the parent's thread — `protocol.ts:9-25` records the measurement (a 3 s busy
loop let the parent tick 21 times against ~320). The producer is a worker
thread; the consumer is the UI thread; the queue grows regardless of what the
bucket decides. **On bucket exhaustion, terminate the worker** — the frame
already implements it (`python-sandbox.html:94-108`) — and say so in stderr.
That also turns the flood test from a timing-dependent "app still responsive"
into a deterministic "session killed, drive persisted".

**"Per session" is not enforceable and won't be claimed.** `exit()` then
`python` calls `create_python_client` afresh (`cmd.svelte:397,403-417`), so any
client-scoped budget resets at the cost of one ~10 s Pyodide load; two windows
get two buckets. The bucket lives in a module-level singleton in `host_fs.ts`
(one per tab, with an exported reset for vitest), and the guide describes it as
a per-tab rate ceiling, not a session quota.

**Icon:** not `Python.png` — that is already the Python *program*'s icon
(`app_registry.ts:104`, `start_menu.svelte:135`), which reproduces D-F9's own
complaint. Use `Notepad.png` or `ScriptComponent.png`. Note `icons`
(`system.ts:202`) stores bare filenames while `new_fs_item_raw:396` writes a
full path and `file_icon.ts:18-25` prefers the item's own `icon`, so the host
writes `/images/xp/icons/X.png`.

---

## 2. Tasks v1 missed entirely

**CI runs the `@online` Pyodide tests today, and two comments say it doesn't.**
Verified: `npx playwright test --list` reports 151 tests including 7 tagged
`@online`, and `ci.yml:76` runs a bare `npx playwright test`. So every PR
already downloads Pyodide from jsDelivr seven times on a 2-core runner, while
`playwright.config.ts:29` and `e2e/python.spec.ts:11` both claim the online
project is opt-in. **This is a pre-existing defect, not one this feature
introduces** — but the feature would add nine more cold loads to it.

*Verdict:* fix the comments, and put the security tests **hermetically** in the
default project. The forged-flood test needs no Pyodide at all:
`e2e/python.spec.ts:44` already aborts the CDN route and drives the frame with
`frame.evaluate(...)`, which is all a forged `save` flood requires. Putting the
single most important assertion behind a 5 MB download is how it gets skipped
the first time it flakes. Only the genuine round-trip stays `@online`.

**`verify-build.mjs`** gains an assertion that `build/html/python-sandbox.html`
exists and still carries the relay, in the file's own
"prove-the-target-exists-first" style (`verify-build.mjs:12-15`). Separately,
its Rollup static/dynamic-import baseline (`:184-213`) **fails on new
offenders** — and T4 adds a module imported by two lazily-loaded program
chunks. Live CI-failure risk; check before merging.

**Docs:** the D7 superseded-note (T3), and `docs/phase-3-guide.md` updates for
`/c`'s semantics, the session-snapshot limitation, "Python cannot read back its
own saved files", the SEED_VERSION re-seed, and the quota caveat.

**§11 visual parity report** for the new folder and the new file icon.

**The File Transfer dialog.** CLAUDE.md's known trap: Explorer shows it once on
first folder entry, and T5's "write → Explorer → `ls` → `cat` → reload" walks
into it. `xp_chrome_g.spec.ts:132`'s `enterC(win, { first_entry: true })` is the
pattern.

**One out-of-band terminal write path** serving both T3's async `cat` output
and T5's stderr line — same problem (write to a terminal that may be at a
prompt, in the other mode, or disposed), so one mechanism, built once.

---

## 3. Risk register

| Risk | Mitigation |
|---|---|
| T2 bumps SEED_VERSION → every visitor re-seeds | Second such event ever; safe via `USER_FIELDS`/carry-loop; state it in the guide |
| T2 breaks `complete.test.ts:166` | Named; fixed in the same commit |
| Rollup import-baseline fails CI | Check `verify-build.mjs:184-213` before merging T4 |
| The worker init block is Python in a `String.raw` template — unlinted, uncovered | Keep minimal; cross the boundary with `globals.set` + `to_py`; assert effects by E2E |
| `@online` load flakiness | Security tests hermetic; only the round-trip is `@online` |
| Quota failure is ours to cause but not to catch | Free old blobs; `desktop.svelte` owns the dialog; guide states the last-second caveat |

## 4. Gates

Per task: `npm run check` && `npm run lint` && `npm run format:check` &&
`npx vitest run --coverage` && `npm run build` && `node scripts/verify-build.mjs`
&& `npx playwright test`. Then gate 6 — a fresh-context implementation review
over the whole feature — before any cutover.
