# Python filesystem spec — a real `/c` inside the REPL (gate 1)

**Status:** spec, pending gate-2 red team.
**Owner request (2026-09-02):** let visitors save mini-projects from the Python
REPL so they survive the session, and let them read the XP filesystem
read-only, "without breaking it or deleting anything". Owner chose: mount at
`/c` for consistency with CMD, keep it fresh rather than stale, and hide `/tmp`
if cheap.

---

## 0. The tension this spec exists to resolve

Everything that makes the REPL safe to offer rests on ONE property: **Python has
no ambient authority.** The `<iframe sandbox="allow-scripts">` has no
`allow-same-origin`, so `indexedDB` throws (measured, `protocol.ts:14-22`). The
VFS is safe because it is UNREACHABLE, not because anything filters requests.

This feature deliberately weakens that. It must therefore be designed under the
assumption that **every line of Python is hostile** — there is no trusted
caller, because the caller is a stranger's keyboard. "Read-only so they can't
break it" is not a policy to enforce at a validator; it has to be structural.

Second consequence, easy to miss: today `on_runtime_message` (`repl.ts:97`) can
only ever emit `write` and `focus` effects, which is exactly WHY a forged
message from Python is harmless. Any new message kind that reaches the VFS
removes that property, and gate 2 should attack the replacement.

---

## 1. Scope

- A read-only mirror of the VFS text tree inside the Pyodide MEMFS at `/c`,
  refreshed when the drive changes.
- One writable directory inside it. Files written there persist into the VFS as
  real, visible, `authored` items.
- `.py` opens in a viewer rather than the no-association dialog.
- No new Python API is required for either. Plain `open()` is the interface.

### Exit criteria

1. `open('/c/Experience/Printerpix — AI Engineer.txt').read()` returns that
   entry's text, in a fresh session, with no imports and no `await`.
2. `open('/c/Experience/anything','w')` raises `PermissionError` — not a silent
   no-op, not a corrupted VFS.
3. A file written to the writable directory appears in Explorer **and** in
   CMD's `ls` without a reload, and survives `exit()`, a Ctrl+C restart, a page
   reload, and a SEED_VERSION bump.
4. A folder created in Explorer appears under `/c` in an already-open Python
   session.
5. A visitor cannot exhaust storage or item count: caps are enforced host-side
   and breaching one produces a Python-visible error, not a broken app.
6. Python still cannot reach `indexedDB`, `localStorage`, OPFS, `caches`, or
   the network beyond the pinned CDN. The existing isolation E2E still passes
   unchanged.
7. The REPL starts in `/c`.

### Explicitly OUT of scope

- The visitor's REAL machine. The only browser route is the File System Access
  API behind a directory picker; it is Chromium-only, needs a permission prompt
  on a portfolio site, and cannot run in the sandbox. Owner confirmed "XP file
  system", so this is closed, not deferred.
- Writing anywhere except the one writable directory. No `cd`-anywhere-and-save.
- Binary files (`.jpg`, `.mp3`, `.pdf`) as readable bytes — see D-F4.
- `pip`/`micropip` installs. `connect-src` already blocks PyPI and this spec
  does not touch CSP.
- Sharing anything between visitors. There is no server; there never is.

---

## 2. Verified facts this spec is built on

Every one measured in the live app, because the Phase 3 spec's worst failures
were confident claims about code it had not read.

| Claim | Evidence |
|---|---|
| MEMFS honours permissions | `os.chmod(d, 0o500)` then write → `PermissionError` |
| `/c` is mountable and usable as cwd | `makedirs('/c/Experience')`, `chdir('/c')`, relative `open()` all OK |
| `/tmp` can be removed | `shutil.rmtree('/tmp')` OK; `tempfile.mkstemp()` still works after (it recreates it) |
| `/lib`, `/dev`, `/proc`, `/home` cannot | `/lib` holds the stdlib |
| Top-level `await` works | `await asyncio.sleep(0)` OK — kept in reserve, not needed |
| Python reaches worker globals | `hasattr(js, 'postMessage')` → True |
| Nothing persists today | `/tmp/evil.txt` gone after `exit()` + reopen |
| Storage APIs are absent, not merely denied | `opfs`/`caches`/`localStorage`/`cookie` → `AttributeError`; `indexedDB` → `JsException` |
| `sqlite3`, `shelve`, `readline` are absent | `ModuleNotFoundError` |
| `pickle` works | round-trips through MEMFS |
| Portfolio text is tiny | ~7 KB of JSON across all sections |
| `.txt` already renders plain text | `portfolio_viewer.svelte:85-92` falls back to a `<pre>` when `portfolio_ref` is absent |
| Visitor files survive re-seeds | `seed.ts:35` — `authored === true` exempts an item from `is_stale_placeholder` |
| `.py` has no association | `system.ts` associations list `.txt` only |

---

## 3. Sub-decisions

### D-F1 — How Python reads the VFS

**Option A — an async capability API** (`await xp.read(path)`).
*For:* nothing preloaded, so zero startup cost; the host validates each call
individually and can refuse by size; naturally handles binary.
*Against:* it is a new vocabulary a visitor must discover, `await` in a REPL
surprises beginners, and `open()` — the thing anyone actually types — still
fails. Worse for security: it puts a READ capability on the message channel,
which then has to be scoped and path-validated, and path validation is where
traversal bugs live.

**Option B — a read-only mirror in MEMFS.**
*For:* zero new concepts — `open`, `os.walk`, `glob`, `pathlib` all work. And
it makes the read surface DISAPPEAR rather than making it safe: the mirror is
inert data inside the worker, so there is no read message to forge, no path to
validate, and Python mutating its own copy changes nothing real. Payload is
~7 KB.
*Against:* goes stale without D-F5; binary files must be excluded or the tree
lies about itself (D-F4); duplicates content in worker memory.

**Option C — mirror the structure, fetch content lazily.**
*For:* `os.listdir` is instant, content costs nothing until read.
*Against:* synchronous `open()` over an async fetch needs a custom Emscripten FS
backend — substantial work, and it reintroduces exactly the read capability B
deletes.

**Verdict: B.** **Deciding factor:** it removes the read attack surface instead
of defending it. A is defensible on ergonomics alone; B is better on ergonomics
AND strictly smaller in attack surface, which is not a trade-off at all.
**What B gives up:** live-accurate binary files, and ~7 KB of duplicated memory.

### D-F2 — Mount point and starting directory

**Option A — `/xp`.** *For:* obviously ours, cannot collide with anything
Emscripten owns. *Against:* a second vocabulary for one filesystem — CMD says
`/c/Experience`, Python would say `/xp/Experience`.

**Option B — `/c`, cwd set to `/c`.** *For:* one vocabulary across both apps;
`pwd` in CMD and `os.getcwd()` in Python agree; relative `open('Experience/…')`
works. *Against:* `/c` is our invention inside a POSIX-looking root, sitting
beside `/lib` and `/proc`, which is a bit odd on inspection.

**Verdict: B**, owner-requested and correct. **Deciding factor:** the CMD
filesystem commands shipped two days ago and already teach `/c`; a second
spelling would make the two windows contradict each other, which is the exact
disagreement `path.ts` was written to prevent.

### D-F3 — How read-only is enforced

**Option A — nothing; writes to the mirror simply do not persist.**
*For:* no work. *Against:* silently misleading. A visitor writes a file, sees
it in `os.listdir`, and it evaporates. That is worse than refusing.

**Option B — `chmod 0o500` on every mirrored directory except the writable one.**
*For:* `PermissionError` at the point of the mistake, from the filesystem
itself; it is the same error a real read-only mount gives, so it teaches the
truth. Measured working.
*Against:* Python can `os.chmod` it back — the mirror is its own memory, so
this stops accidents, not determination.

**Option C — B, plus host-side rejection of any write outside the writable dir.**
*For:* covers the determined case.
*Against:* the host already only accepts writes for the one folder it owns
(D-F6), so this is the same guarantee stated twice.

**Verdict: B**, with C's guarantee coming free from D-F6's design.
**Deciding factor:** chmod cannot be a security boundary (Python owns that
memory), and it does not need to be — the real boundary is that the host never
accepts a path from Python at all. chmod's job is honesty, and it does that
perfectly. **Against, accepted:** a determined visitor can chmod their own copy
and write to it; nothing real changes, so this is cosmetic vandalism of a
mirror.

### D-F4 — What gets mirrored

**Option A — every VFS item, binaries as real bytes.**
*For:* the tree is not a lie. *Against:* wallpapers, three MP3s and a 61 KB PDF
would be megabytes shipped per session into worker memory, for a feature nobody
asked for.

**Option B — text files with content; non-text as ZERO-BYTE placeholders.**
*For:* `os.walk` shows the true shape. *Against:* `open('Bliss.jpg','rb').read()`
returning `b''` is a silent lie — worse than absence.

**Option C — text files with content; non-text OMITTED, with a note.**
*For:* everything present is true; nothing present is a lie.
*Against:* `os.listdir('/c/Wallpapers')` is empty, which is also a lie of a
gentler kind.

**Verdict: C.** **Deciding factor:** a missing file makes a visitor look
elsewhere; a zero-byte file makes them think the data is corrupt. Absence is
the more honest failure. "Text" = the extensions the mirror can render as UTF-8
(`.txt`, `.py`, `.md`, `.json`, `.csv`); the set lives in one constant.
**Against, accepted:** the resume PDF is invisible to Python.

### D-F5 — Keeping the mirror fresh

**Option A — snapshot once at session start.**
*For:* trivial. *Against:* a file created in Explorer never appears; the
terminal and Python disagree about what exists, which is the disagreement this
project keeps paying to avoid.

**Option B — push changes on every `hardDrive` store change.**
*For:* `hardDrive` is already reactive and the host already subscribes; the
payload is a few KB; it makes exit criterion 4 true.
*Against:* while Python is executing, the worker thread is blocked and the
update lands only when it finishes — so a mid-`while True:` change appears
after the interrupt. Also, if Python has modified its own copy of a mirrored
file, the push overwrites it.

**Verdict: B.** **Deciding factor:** the owner asked for it explicitly and the
cost is a few KB on an event that already fires. **Against, accepted:** the
blocked-worker lag, documented in the guide; and mirror-overwrites-local, which
is correct precedence since the VFS is the source of truth.

### D-F6 — How writes persist

**Option A — an explicit `await xp.save(name, text)`.**
*For:* one obvious choke point; the persistence boundary is visible in the
code the visitor wrote.
*Against:* a new API to discover; `await` in a REPL; and `open(...,'w')` still
silently fails to persist, which is D-F3's complaint again.

**Option B — after each REPL statement, the worker diffs the writable directory
and reports changes; the host validates and persists.**
*For:* plain `open(path,'w')` persists, which is what "let them save their mini
projects" actually means; no new vocabulary; works with `pathlib`, `json.dump`,
`pickle`.
*Against:* a scan after every statement (bounded: one flat directory, capped at
D-F8's file count); a statement that writes then crashes still persists the
write, which is arguably correct but is a behaviour to state; and the host must
treat the reported diff as hostile input.

**Verdict: B.** **Deciding factor:** the request was "save their mini
projects", and any design where the natural gesture silently does nothing has
failed at that regardless of how good the alternative API is. **Against,
accepted:** per-statement scan cost, and no undo.

**Security shape, and it is the crux of this spec:** the diff message carries
`{name, text}` only. It NEVER carries a path, a parent id, or an item id. The
host hardcodes the destination folder and rejects any `name` containing `/`,
`\`, or `..`. Traversal is therefore impossible by construction rather than by
validation — there is no field in which to express it.

### D-F7 — Where saved files live

**Option A — `C:\My Documents\Python`.** *For:* `My Documents` is the XP-authentic
home for a user's own files and the drive has no equivalent today; the `Python`
subfolder keeps the REPL's output from colliding with anything later.
*Against:* two new seed folders through `vfs-base.json` + `generate:vfs`, and
the CI freshness gate.

**Option B — the existing `Desktop` folder.** *For:* no new seed items.
*Against:* `Desktop` is in `hidden_items`, so `ls` would not show saved files,
and desktop icons would appear for every experiment.

**Option C — a new top-level `Python` folder.** *For:* one new folder.
*Against:* a bare `Python` folder at the root of C: is not something XP would
have.

**Verdict: A.** **Deciding factor:** exit criterion 3 requires the files to be
visible and openable like any other file, and `My Documents` is where a visitor
will look. **Against, accepted:** the seed regeneration and its CI gate.

### D-F8 — Caps

Enforced host-side, since the worker's numbers cannot be trusted:

| Cap | Value | Why |
|---|---|---|
| Bytes per file | 256 KB | A source file is kilobytes; this is generous and still 20× under a quota-threatening size |
| Files in the folder | 100 | Keeps Explorer usable and the per-statement scan bounded |
| Total bytes in the folder | 2 MB | IndexedDB quota is shared with the whole VFS |

Breach → the host refuses that write and returns an error the worker raises in
Python, so it is visible where it happened.

*Alternative rejected:* no caps, trusting the visitor. A three-line `while True:
open(f'{i}.txt','w').write('x'*10**6)` fills IndexedDB and breaks the app for
that visitor permanently, since the VFS is what the desktop is built from.

### D-F9 — Opening a saved file

**Verdict: associate `.py` with `portfolio_viewer`** — no alternatives
considered on the VIEWER itself, forced by fact: it is the only text renderer
in the app, and it already handles a missing `portfolio_ref` by rendering the
raw text in a `<pre>` (`portfolio_viewer.svelte:85-92`), so `.txt` already
works. Notepad is unbuilt and listed under Stretch.

*The choice that IS open:* whether to also let `.py` files be saved at all, or
force `.txt`. **For `.py`:** it is what a Python file is called, and `os.listdir`
showing `.txt` for a script is a small lie. **Against:** one more association
entry. **Verdict: allow `.py`,** deciding factor being that the feature is
"save your mini project" and a project is `.py`.

### D-F10 — Root tidiness

**Verdict: remove `/tmp` at session start; leave `/lib`, `/dev`, `/proc`,
`/home`.** *For:* `os.listdir('/')` gets shorter and `/c` is the obvious place.
*Against:* it is cosmetic — `tempfile` recreates `/tmp` on first use, measured —
and the other four cannot go without breaking imports. **Deciding factor:** the
owner asked for `/c` to be "the main thing", and cwd + one fewer distraction
achieves that; a truly single-directory root is not available at any price
worth paying. **Honest limitation for the guide:** `/` still shows Emscripten's
plumbing.

### D-F11 — What survives what

| Event | Mirror | Writable folder |
|---|---|---|
| `exit()` / Ctrl+C restart | rebuilt from the VFS | untouched — it lives in the VFS |
| Page reload | rebuilt | survives (IndexedDB) |
| SEED_VERSION bump | rebuilt | survives — items are stamped `authored: true` (`seed.ts:35`) |
| Explorer delete | reflected on next push | gone, as the visitor asked |

No alternatives — forced by the existing seed architecture.

### D-F12 — Is there an `xp` module at all?

**Option A — none.** *For:* the smallest possible surface; everything is
`open()`. *Against:* no way to ask where things are, and no way to force a sync
before a deliberate `exit()`.

**Option B — a tiny module: `xp.saved_dir`, `xp.sync()`, `xp.limits`.**
*For:* three read-only conveniences, no new authority — `sync()` triggers the
same diff a statement boundary already triggers.
*Against:* a module to document and test.

**Verdict: B, minimal.** **Deciding factor:** `xp.sync()` costs nothing because
the machinery exists for D-F6, and without it a visitor whose last statement is
long-running has no way to flush deliberately. **Explicitly NOT in it:** any
read, delete, rename, or path-taking function.

### D-F13 — Protocol extension and its validation

Two new message kinds, both validated in `protocol.ts` beside the others:

- `ToRuntime`: `{ kind: 'mirror'; tree: MirrorEntry[] }` — host → worker.
- `FromRuntime`: `{ kind: 'save'; files: { name: string; text: string }[] }` —
  worker → host.

`parse_from_runtime` gains a `save` case validating: array shape, every `name`
a string matching `/^[A-Za-z0-9 ._-]{1,64}$/` with no `..`, every `text` a
string, and the array length ≤ the file cap. Anything else returns `null` and
is dropped, exactly as today.

*Alternative rejected:* reusing `stdout` with a magic prefix. It would make
every `print()` a potential file write, which is the worst possible coupling.

### D-F14 — When IndexedDB is full

**Verdict: the host catches the write failure and returns an error the worker
raises as `OSError` in Python.** *For:* it is the errno a full disk gives, so
it needs no explanation. *Against:* the visitor cannot free space from Python
(no delete API, D-F12) and must use Explorer. **Deciding factor:** silently
dropping the save is the one unacceptable option; anything visible beats it.

### D-F15 — Test strategy

- **Unit (`vitest`):** the mirror builder (VFS → tree), the name validator, the
  cap enforcement, and `parse_from_runtime`'s `save` case. All pure.
- **E2E hermetic:** the existing stubbed-runtime specs must keep passing
  untouched — that is the regression signal for the isolation boundary.
- **E2E `@online`:** the round trip. Write from Python → assert it appears in
  Explorer AND in CMD `ls` → reload → assert it is still there.
- **Mutation-verify** every new test, per the standing rule.

*Alternative rejected:* testing the round trip only in unit tests with a fake
drive. Phase 3 gate 4 showed that shape is vacuous — the hermetic suite
substitutes a stub runtime that cannot execute Python at all.

### D-F16 — CMD sees saved files for free

No decision — a consequence. `ls`/`cat` walk the live `hardDrive` store
(`path.ts`), so a file saved from Python appears in `ls '/c/My Documents/Python'`
with no work. Exit criterion 3 asserts it, because a consequence nobody tests
is a coincidence.

---

## 4. What gate 2 should attack hardest

1. **D-F6's diff channel.** It is the only path from hostile code to persistent
   storage. Is `{name, text}` really enough to make traversal inexpressible?
   What about a name that is valid but collides with something meaningful?
2. **D-F5's push racing D-F6's diff.** A store change arriving between a write
   and its scan.
3. **Caps as the wrong shape.** Per-file and total bytes are checked host-side —
   but the host learns sizes from the worker's message. Is anything trusting a
   number the worker chose?
4. **The mirror as an information leak.** It ships every text file into a
   context the visitor fully controls. Is anything in the VFS not already
   public on the website?
5. **Whether this breaks the CMD filesystem work** shipped two days ago.
