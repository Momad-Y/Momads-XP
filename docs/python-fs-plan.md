# Python filesystem plan — implementation (gate 3)

**Spec:** `docs/python-fs-spec.md` v2. **Status:** pending gate-4 red team.
Nothing here is implemented; this is the order, the files, the tests and the
risks.

---

## 0. Shape of the work

Five layers, each shippable and testable on its own. The ordering is chosen so
that **every commit leaves `dev` green and the app working**, and so the two
riskiest pieces — the shared renderer, which changes shipped `cat` output, and
the save channel, which is the security boundary — land early enough to be
red-teamed with real code rather than late enough to be rushed.

```
T1  shared portfolio→text renderer        (changes cat; no new surface)
T2  seed folder + generated id            (data only; no behaviour)
T3  cat reads saved files                 (closes the D-F16 gap BEFORE saving exists)
T4  the mirror: /c, read-only, at ready   (read half; no write path at all)
T5  the save channel: caps, rate, identity(the security boundary, last)
```

T5 is deliberately last: until it lands there is no way to write anything, so
T1–T4 cannot regress storage. Each task is one PR into `dev`.

---

## T1 — One plain-text renderer, shared with `cat`

**Why first:** `fs_commands.ts:135-138` states the invariant this feature
nearly broke — *"so `cat` and the block commands are one rendering rather than
two that drift."* The mirror (T4) needs portfolio entries as text, and `cat`
already renders them. Writing the mirror first would create the third renderer
the comment forbids.

**Files**

- `src/lib/portfolio_text.ts` **(new)** — `render_entry(ref): string[]`, pure,
  no ANSI. Derived from `resolve_portfolio_ref`, which already normalises every
  section (`portfolio.ts:23`).
- `src/lib/cmd/fs_commands.ts` — `portfolio_lines()` becomes a thin colouriser
  over `render_entry`, keeping today's accent/dim styling.
- `e2e/cmd.spec.ts` — the `cat` assertion moves in the same commit if output
  shifts at all (CLAUDE.md: E2E asserts exact UI strings).

**Tests:** `portfolio_text.test.ts` covering every section (`experience`,
`projects`, `education`, `skills`, `awards`, `certifications`), the `null` ref,
and an entry with images. Mutation-verify by deleting a section arm.

**Risk:** this is the only task that changes **shipped** behaviour before the
feature exists. Mitigation: if `render_entry` reproduces today's text exactly,
the E2E does not move and the diff is provably behaviour-preserving. Aim for
that; if it cannot be exact, say so and move the assertion deliberately.

## T2 — `C:\My Documents\Python`, with a generated id

**Files**

- `scripts/vfs-base.json` — two folders (`My Documents`, and `Python` inside
  it), same shape as `My Music` (`id`, `parent`, `basename`, `ext: ''`,
  `children: []`, the frozen timestamps). Fixed ids, hand-chosen, in the
  base — this file is a sanctioned input (CLAUDE.md), unlike `hard_drive.json`.
- `scripts/generate-vfs.ts` — link both into the C drive's `children` (the
  existing spread at `:100-102` is the model) and export `PYTHON_FOLDER_ID`
  alongside `PROJECTS_FOLDER_ID`, so the id lives in generated code and the CI
  freshness gate covers drift. **Never a literal in `src/lib/`.**
- `src/lib/system.ts` — add `PYTHON_FOLDER_ID` to `protected_items` (spec
  D-F7: without it, one right-click deletes the folder, `new_fs_item_raw`
  throws on `required(data[parent_id])` forever after, and `seed.ts:200-208`
  tombstones the id so it never comes back).
- `npm run generate:vfs`, then commit the regenerated `hard_drive.json` and
  `vfs_ids.ts` in the same commit.

**Tests:** extend `seed.test.ts`'s existing SEED_VERSION content-hash check
(it already fails on stale regeneration). Assert the two folders exist, are
linked into C:, and that `PYTHON_FOLDER_ID` is in `protected_items`.

**Risks**

- **SEED_VERSION changes**, so every returning visitor re-seeds. That is the
  designed path (`merge_on_reseed` carries their files), but it is a real
  event and the guide must say the deploy triggers one.
- `protected_items` also feeds `clip()` (`fs.ts:42-44`) and the context menu.
  **Check no existing Explorer E2E asserts that an arbitrary folder is
  deletable** — gate 4 flagged this.

## T3 — `cat` reads a saved file

**Why before T5:** the gap exists today for any `local` file, and fixing it
after saving ships means the first thing a visitor tries is broken. Fixing it
first means T5 inherits a working `cat`.

**Design (spec D-F16 option C):** `run_fs` stays pure and synchronous.
`run_cat` returns a request the component fulfils, exactly as `python`,
`matrix` and `hack` are already dispatched from `cmd.svelte`.

**Files**

- `src/lib/cmd/fs_commands.ts` — `FsResult` gains an optional
  `read_file?: { id: string; name: string }`. `run_cat` emits it for
  `storage_type: 'local'` text files instead of falling through to
  `described()`.
- `src/routes/xp/programs/cmd.svelte` — on `read_file`, `await get_file(id)`,
  `await file.text()`, write the lines, then prompt. Guard: size cap
  (reuse `portfolio_viewer.svelte:36`'s `MAX_TEXT_BYTES`), non-UTF8 →
  `described()`'s existing binary line.
- `e2e/cmd.spec.ts` — create a text file via Explorer, `cat` it.

**Tests:** unit for the `read_file` emission (pure); E2E for the async half.
Mutation: make `run_cat` fall through to `described()` and watch the E2E fail.

## T4 — The mirror

**Files**

- `src/lib/python/mirror.ts` **(new)** — `build_mirror(profile): MirrorEntry[]`,
  pure, synchronous. Six folders, one `.txt` per entry via T1's `render_entry`,
  plus the empty `My Documents/Python` directory. **Seed-authored content
  only** — no VFS read, no IndexedDB, no visitor files (spec §0 point 3: a full
  mirror plus the sandbox's allowed CDN origin is an exfiltration channel).
- `src/lib/python/protocol.ts` — `ToRuntime` gains
  `{ kind: 'mirror'; tree: MirrorEntry[] }`.
- `static/html/python-sandbox.html` — relay `mirror` to the worker. It today
  forwards only `init`/`exec`/`terminate`. **This file is outside ESLint,
  prettier and coverage by its own header**, so its only test is E2E — a
  deliberate choice, recorded here.
- `src/lib/python/worker_source.ts` — a `pyodide.runPython` block before
  `send({kind:'ready'})` that removes `/tmp`, builds `/c`, `chmod 0o500`s every
  mirrored directory, leaves the outbox writable, and `chdir('/c')`. Plus a
  `mirror` case in `self.onmessage` **guarded on `pyodide != null`** — today
  there is no guard and a message during the ~10 s load throws into
  `worker.onerror`, which the host renders as "Try again once you are back
  online" and the session never recovers.
- Host: send `mirror` once, on `ready`. **No store subscription** (spec D-F5:
  the mirror is derived from `profile.json`, which cannot change at runtime).

**Where the host code lives** — gate 2's biggest structural finding. Python
runs in **two** components (`python.svelte`, `cmd.svelte`) which already share
`repl.ts` precisely so the semantics cannot drift. But `repl.ts`'s safety
argument is that `on_runtime_message` can only emit `write` and `focus`.

**Verdict: a new `src/lib/python/host_fs.ts`**, owned by neither component and
imported by both, holding the mirror send and (in T5) the save handling. `repl.ts`
stays untouched, so its invariant survives verbatim, and there is exactly one
copy of the security-critical half. *Against:* a third module in the python
folder. *Deciding factor:* the alternatives are "two copies of the security
code" or "break the one invariant §0 is built on".

**Tests:** unit for `build_mirror` (shape, ordering, escaping, no visitor
content). E2E `@online`: `open('/c/Experience/…').read()` works; writing there
raises `PermissionError`; `os.getcwd() == '/c'`; `/tmp` absent; a `mirror`
message during startup does not kill the session.

## T5 — The save channel

**This is the security boundary.** Everything in it assumes the caller is
hostile, because Python can post directly (`hasattr(js,'postMessage')` → True)
and never touch the filesystem at all.

**Files**

- `src/lib/python/protocol.ts` — `FromRuntime` gains
  `{ kind: 'save'; files: { name: string; text: string }[] }`, validated in
  `parse_from_runtime`: array shape, `files.length <= 25`, every `name`
  matching `/^[A-Za-z0-9 ._-]{1,64}$/` **and** rejecting `.`, `..`, an empty
  basename, and leading/trailing space; every `text` a string. Anything else →
  `null`, dropped, as today.
- `src/lib/python/save_limits.ts` **(new)** — pure: `TextEncoder` byte sizing
  (never `text.length` — 3× under-count for CJK), the 256 KB per-file and
  100-file caps, and a token bucket (5/s, 500/session). Pure so it is unit-
  testable and so the *decision* to reject is separable from the act.
- `src/lib/python/host_fs.ts` — the handler. Rejects **before touching
  `hardDrive`**; that is the whole point, since `desktop.svelte:57-62`
  `clearInterval`s its 1000 ms persist debounce on every store notification and
  a flood would mean the drive is never written while the app still looks
  alive. Keeps a per-session `Map<normalised_name, item_id>`; known name →
  `save_file(id, blob)` (overwrite in place); new name → `new_fs_item_raw`,
  recording the returned id. Normalise the extension to lowercase **before**
  the map lookup, matching `fs.ts:394`, or `NOTES.TXT` re-saves itself every
  statement forever.
- `src/lib/python/worker_source.ts` — after each `run_source`, scan only the
  outbox, diff against a per-session `{name → hash}` snapshot, post one `save`.
- `src/lib/system.ts` — `.py` in `doctypes` (→ `portfolio_viewer`) and in
  `icons`; the host sets `icon` explicitly, or `new_fs_item_raw:396` defaults
  saved scripts to the **executable** icon.
- Errors: a `stderr` line before the next prompt. **Not** an `OSError` at the
  write site — with a post-hoc diff the `open()` call has already returned, and
  no `ToRuntime` path can raise into it. Spec D-F14 records this as the one
  place the rejected capability API would have been better.

**Tests**

Unit: name validation (every rejected form), byte sizing with CJK, cap
arithmetic, token bucket, the name→id map's overwrite path, `parse_from_runtime`.

E2E `@online`, each one a gate-2 finding made executable:
- write → Explorer → `ls` → `cat` → reload → still there
- **same name twice → one file, updated** (no `main 2.py`)
- `NOTES.TXT` then any statement → no second file
- a forged `js.postMessage` flood → app responsive, drive persisted, items bounded
- `C:\My Documents\Python` cannot be deleted

Every new test mutation-verified.

---

## Risk register

| Risk | Mitigation |
|---|---|
| T1 changes shipped `cat` output | Aim for byte-identical; if not, move the E2E deliberately in the same commit |
| T2 bumps SEED_VERSION → every visitor re-seeds | Designed path; `merge_on_reseed` carries their files; note it in the guide |
| `protected_items` breaks an Explorer E2E | Grep the suite before T2; gate 4 flagged it |
| The worker init block is Python inside a `String.raw` JS template — unlinted, uncovered | Keep it minimal and assert its effects via E2E, not by reading it |
| Two sessions both saving | Per-session map; second session's same-name save dedupes to `name 2` — accepted (spec D-F17) |
| Quota failure is undetectable by us | `desktop.svelte` owns it and already shows a dialog; the guide states files saved in the last second before a tab close may not persist |

## Gates

Per task: `npm run check` && `npm run lint` && `npm run format:check` &&
`npx vitest run --coverage` && `npm run build` && `npx playwright test`, plus
`node scripts/verify-build.mjs`. Then a fresh-context implementation review
(gate 6) on the whole feature before the cutover.
