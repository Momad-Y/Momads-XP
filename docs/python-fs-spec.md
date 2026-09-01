# Python filesystem spec — a real `/c` inside the REPL (v2)

**Status:** v2, rewritten after the gate-2 red team. Pending gate 3 (plan).
**Owner request (2026-09-02):** let visitors save mini-projects from the Python
REPL so they survive the session, and read the XP filesystem read-only,
"without breaking it or deleting anything". Owner chose `/c` for consistency
with CMD, fresh over stale, and `/tmp` hidden if cheap.

---

## 0. What changed from v1, and why

The red team graded six sub-decisions **Wrong** and four **Weak**. Every
finding I checked held up against the shipped code. v2 is **smaller** than v1,
not bigger — most fixes delete scope rather than add it.

The three that reshaped the design:

**1. The writable directory was never a security boundary.** v1 built its whole
write story on "Python writes into one MEMFS folder, we diff it". But v1's own
verified-facts table recorded `hasattr(js, 'postMessage') → True`, and then
never used that fact. Hostile Python skips the filesystem entirely:

```python
import js
while True:
    js.postMessage({'kind':'save','files':[{'name':'x.txt','text':'y'}]})
```

That bypasses MEMFS, the `chmod` layer, and any per-statement pacing. **The
boundary is the MESSAGE, not the directory** — so every cap, every validator
and a rate limit belong on the message channel, and the writable directory is
demoted to pure ergonomics.

It is worse than a hang. `desktop.svelte:57-62` persists the whole drive on a
**1000 ms debounce that `clearInterval`s on every store notification**, fire-
and-forget. A save flood re-arms that timer forever, so the drive is **never
written to IndexedDB** while the app still looks alive — then the tab closes
and everything since boot is gone.

**2. There is no "VFS text tree" to mirror.** All 28 portfolio `.txt` items
carry **no `storage_type` and no `url`** — verified: `p2ExpPrinterpixAIEngineer0`
is `{storage_type: None, url: None, size: 1, portfolio_ref: {...}}`. They are
pointers into `profile.json`, not files. v1's exit criterion 1 was therefore
unsatisfiable by mirroring, and D-F4's "text files with content" described
content that does not exist.

**3. Mirroring the whole VFS would have created an exfiltration channel.** The
seed is all public. Visitor *uploads* are not, and `netlify.toml` allows the
sandbox `connect-src https://cdn.jsdelivr.net` — whose edge logs URLs. Today
that channel is worthless because the sandbox holds nothing. A full mirror is
exactly what would make it worth using, via a pasted script ("try this in the
XP Python!"). v2 mirrors **only seed-authored content**, which closes the leak,
removes the async IndexedDB reads, and removes the unbounded size problem, all
at once.

Also corrected: `.txt` is not the only association (`system.ts` lists
thirteen); `authored: true` is not what makes visitor files survive a re-seed
(`seed.ts:169` carries anything absent from the seed that is not a stale
placeholder); and `protocol.ts` has no `ToRuntime` validator to "sit beside".

---

## 1. Scope

- A read-only `/c` inside the Pyodide MEMFS, synthesised from `profile.json` —
  the portfolio folder structure and one plain-text file per entry.
- One write-only outbox directory. Files written there persist into the VFS as
  real, visible items under `C:\My Documents\Python`.
- `.py` opens in a viewer with a sensible icon.
- `cat` in CMD can read a saved file.
- Plain `open()` is the entire interface. No `await`, no required imports.

### Exit criteria

1. `open('/c/Experience/Printerpix — AI Engineer.txt').read()` returns that
   entry as text in a fresh session, no imports, no `await`.
2. `open('/c/Experience/x','w')` raises `PermissionError`.
3. `open('/c/My Documents/Python/main.py','w').write(code)` persists; the file
   appears in Explorer and in CMD `ls`; `cat main.py` prints the code; it
   survives `exit()`, Ctrl+C, reload and a SEED_VERSION bump.
4. **Saving the same name twice updates one file** — no `main 2.py`.
5. A forged `save` flood cannot stop the drive being persisted, and cannot
   create unbounded items. Asserted by a test that posts messages directly,
   not through the filesystem.
6. Python still cannot reach `indexedDB`, `localStorage`, OPFS, `caches`, or
   any network host beyond the pinned CDN. The existing isolation E2E passes
   **unchanged**.
7. Deleting `C:\My Documents\Python` in Explorer is impossible.
8. The REPL starts in `/c`.

### Explicitly OUT of scope

- The visitor's real machine. Owner confirmed "XP file system"; closed.
- Mirroring visitor-created files (§0 point 3). `/c` shows the portfolio and
  the Python folder. Nothing else.
- Binary files as readable bytes.
- Deleting or renaming from Python. The outbox is write-only in both senses.
- Two Python sessions sharing a live view of each other's saves — see D-F17.

---

## 2. Verified facts

Measured in the live app or read in the shipped tree. v1's biggest error was
asserting content that does not exist, so this table now cites the check.

| Claim | Evidence |
|---|---|
| Portfolio `.txt` items hold NO bytes | `storage_type: None, url: None`, `portfolio_ref` set |
| MEMFS honours permissions | `chmod(d,0o500)` then write → `PermissionError` |
| `/c` mountable, usable as cwd | `makedirs`, `chdir`, relative `open()` all OK |
| `/tmp` removable, `/lib` not | `rmtree('/tmp')` OK, `tempfile` recreates it |
| Python can post to the host directly | `hasattr(js,'postMessage')` → True |
| `new_fs_item_raw` renames on collision | `fs.ts:416-424`, `basename + ' ' + appendix` |
| …and lowercases the extension | `fs.ts:394` |
| `save_file` overwrites by id | `fs.ts:477-499` |
| Drive persistence is debounced + fire-and-forget | `desktop.svelte:57-62`, `clearInterval` per notification |
| The worker handles messages before Pyodide exists | `worker_source.ts:120-127`, no readiness guard |
| `cat` never reads file bytes | `fs_commands.ts:189-205` → `described()` |
| `path.ts` treats `.` as "stay here" | `path.ts:219` — a file named `.` is unreachable |
| `portfolio_viewer` renders plain text without a ref | `portfolio_viewer.svelte:85-93`, `MAX_TEXT_BYTES` at `:36` |
| Visitor files survive re-seed | `seed.ts:169`, not via `authored` |
| Deleted seed ids are tombstoned forever | `seed.ts:200-208` |

---

## 3. Sub-decisions

### D-F1 (v2) — What `/c` contains

**Option A — mirror the VFS.** *Against, fatal:* the portfolio files have no
bytes, so this cannot produce criterion 1 at all; visitor uploads make it an
async IndexedDB walk with no size bound; and it opens the exfiltration channel
in §0 point 3.

**Option B — synthesise from `profile.json`: the six portfolio folders, one
`.txt` per entry, rendered as plain text.** *For:* the content genuinely exists
there; it is a few KB; it is synchronous and pure, so the builder is trivially
unit-testable; and it contains only what is already published on the site, so
there is nothing to exfiltrate. *Against:* `/c` is then a curated view, not the
drive — `My Music`, `Wallpapers` and visitor files are absent, so `os.listdir`
disagrees with Explorer.

**Verdict: B.** **Deciding factor:** A cannot satisfy criterion 1 under any
amount of work short of synthesising the text anyway, and A is the version that
turns a pasted script into a data-exfiltration tool. **Against, accepted:** `/c`
is a portfolio view plus your own folder, and the guide must say so plainly
rather than implying a full drive.

### D-F1a — The renderer is SHARED with `cat` **(new)**

`fs_commands.ts:135-138` states the rule this spec nearly broke: *"so `cat` and
the block commands are one rendering rather than two that drift."* A third
renderer of `profile.json` is exactly what that comment forbids.

**Verdict:** extract the plain-text rendering of a `portfolio_ref` into one
function used by the mirror builder **and** by `cat`. No alternatives — forced
by a shipped invariant. **Consequence to accept:** this changes `cat`'s
existing output for portfolio entries, so `e2e/cmd.spec.ts` assertions move in
the same commit (CLAUDE.md rule).

### D-F2 — Mount point `/c`, cwd `/c` — **unchanged from v1.** Owner-requested;
one vocabulary with CMD.

### D-F3 — `chmod 0o500` on the read-only tree — **unchanged in mechanism,
corrected in framing.** v1 called the real boundary "the host never accepts a
path from Python". It is not: the boundary is that the host accepts only
`{name, text}` on a validated, rate-limited channel (D-F13). chmod's job is to
make a mistake fail loudly and locally. It is honesty, not security, and it
cannot be either for the outbox.

### D-F4 (v2) — Sizes — **collapsed into D-F1.** With a synthesised,
seed-only mirror there is no unbounded input: content comes from `profile.json`,
which ships in the bundle. `portfolio_viewer.svelte:36`'s `MAX_TEXT_BYTES`
truncation stays the model if any single entry ever grows absurd.

### D-F5 (v2) — Freshness

v1 chose "push on every `hardDrive` change" and was wrong four ways: torn
intermediate trees (`fs.ts:440-452` registers then links in separate
notifications), `2 + 2N` notifications per recursive delete, a push landing
before Pyodide exists (`worker_source.ts:120-127` has no readiness guard) which
kills the session with an offline message, and no push at all after a restart.

**With D-F1(v2) the question mostly dissolves:** the mirror is derived from
`profile.json`, which cannot change at runtime. It only needs building once.

**What remains:** the outbox listing. **Verdict: build `/c` at session `ready`
and never push again.** *For:* no store subscription, so all four failures are
structurally impossible; the worker is provably initialised at `ready`.
*Against:* a file saved in a *different* session, or created in Explorer, is
not visible in an already-open session. **Deciding factor:** the only content
that can change is the visitor's own outbox, and D-F17 shows a live view of it
is what creates the amplification loop. **Against, accepted, and it goes in the
guide:** `/c` is a snapshot taken when the session started.

### D-F6 (v2) — How writes persist, and what identity they have

v1 chose "diff the directory after each statement" and left create-vs-update
undecided, which defaults to **destructive**: `new_fs_item_raw` always creates
and dedupes (`fs.ts:416-424`), so iterating on `main.py` — the literal request —
produces `main 2.py`, `main 3.py`, to the cap.

**Verdict, three parts:**

1. **The outbox is never a push target** (D-F5), so nothing writes into it
   except Python.
2. **The host keeps a per-session `Map<normalised_name, item_id>`.** Known name
   → `save_file(id, blob)` (`fs.ts:477-499`, overwrites in place). New name →
   `new_fs_item_raw`, and the returned id is recorded.
3. **The name is normalised before it enters the map** — extension lowercased,
   matching `fs.ts:394` — so MEMFS and the VFS agree on spelling and
   `NOTES.TXT` cannot re-save itself every statement.

*For:* criterion 4 becomes true; the file cap stops being a statement budget
and starts meaning project size; `cat` gets a stable id to read.
*Against:* the map is session-scoped, so a second session saving the same name
creates a second item — accepted under D-F17.

**Traversal remains inexpressible**, and the red team confirmed it after
trying: the message has no path field, the regex is ASCII-only with a strict
`$`, `sanitize_filename` strips separators, and the parent is a separate
argument. That part of v1 stands.

### D-F7 (v2) — The destination folder

`C:\My Documents\Python`, as v1. **Two additions the red team forced:**

- **It goes in `protected_items`** (`system.ts:121-129`). Without it, one
  right-click deletes it, `new_fs_item_raw` then throws on
  `required(data[parent_id])` (`fs.ts:409`) into a message handler with no
  catch, and `seed.ts:200-208` tombstones the id so it never returns — saving
  is dead for that visitor across reloads *and* re-seeds. *Against:* protection
  also removes Delete from the context menu for a folder that is arguably
  theirs. **Deciding factor:** the failure is permanent and silent; the cost is
  one greyed-out menu item.
- **Its id must be generated, not hand-written.** `vfs_ids.ts` is generated and
  CLAUDE.md forbids hand-editing it, while a literal in `src/lib/` can drift
  from `vfs-base.json` with no gate. **Verdict:** extend
  `scripts/generate-vfs.ts` to export `PYTHON_FOLDER_ID`, so the freshness gate
  covers it.

### D-F8 (v2) — Caps, and where they live

They live on the **message**, since D-F6's directory is not a boundary.

| Cap | Value | Enforced |
|---|---|---|
| Bytes per file | 256 KB | `TextEncoder().encode(text).length`, never `text.length` (3× under-count for CJK) |
| Files per `save` message | 25 | reject the message, do not drop silently |
| Live files in the folder | 100 | counted from the session map + the folder's children |
| Saves per second | 5 | token bucket; excess dropped **before** touching the store |
| Saves per session | 500 | hard stop |

The rate limit is the one v1 lacked entirely, and it is the one that matters:
without it a forged flood clears `desktop.svelte`'s persist debounce forever.
**The early reject must not touch `hardDrive`** — that is the whole point.

*Alternative rejected:* trusting the worker's own pacing. The worker is the
attacker.

### D-F14 (v2) — Error delivery, honestly

v1 promised an `OSError` "visible where it happened". **That is impossible**
and the red team is right to call it the sharpest internal conflict: with a
post-hoc diff the `open()` call has already returned, and there is no
`ToRuntime` path that raises at the write site.

**Verdict: a `stderr` line before the next prompt**, e.g.
`xp: 'main.py' not saved — file limit reached (100)`. *For:* deliverable, and
it lands where the visitor is looking. *Against:* one statement late.
**Deciding factor:** the only unacceptable option is silence, and every
deliverable option is one statement late.

Quota is worse and gets its own honesty: the write that loses data is
`desktop.svelte`'s debounced `set('hard_drive', …)`, which the host cannot
await and which already surfaces its own "Write Fault Error" dialog. **This
spec does not claim to catch it.** Stated in the guide as a known limitation:
files saved in the last second before a tab closes may not persist.

### D-F16 (v2) — `cat` on a saved file **(v1 was wrong)**

v1 claimed CMD sees saved files "for free". `ls` does. **`cat` does not** —
`run_cat` never reads bytes; it prints `described()`, i.e.
`main.py: 1 KB PY file — open it from My Computer to view it`
(`fs_commands.ts:189-205`). The exact command a visitor tries first after
saving.

**Option A — leave it.** *Against:* the terminal tells you to leave the
terminal, for a file the terminal can see.
**Option B — make `run_cat` async for `storage_type: 'local'`.** *Against:*
`fs_commands.ts` is deliberately pure and synchronous; that is what keeps it
unit-testable without a browser.
**Option C — keep `run_fs` pure; let `cmd.svelte` handle the async read**, as
it already does for `python`, `matrix` and `hack`. `run_cat` returns a
`{ kind: 'read_file', id }` request the component fulfils.

**Verdict: C.** **Deciding factor:** it preserves the purity invariant that the
whole command layer is built on while making the honest behaviour possible;
the component already owns every other async command.

### D-F17 — Two Python sessions **(new — v1 never considered it)**

Python runs standalone *and* inside CMD, and both ship. v1's live-mirrored
outbox would ping-pong between them: A saves `a.txt` → pushed into B's outbox →
B's diff reports a file B never wrote → `a 2.txt` → pushed to A → `a 3.txt`,
unbounded, with nobody typing.

**Verdict:** the outbox is per-session, never a push target (D-F5), and the
name→id map is per-session. Two sessions writing the same name produce two
items, the second deduped by `fs.ts`. *For:* no shared mutable state, so the
loop cannot form. *Against:* session B does not see session A's saves until B
restarts. **Deciding factor:** an unbounded amplification loop that fires with
no user input is categorically worse than a stale view.

### D-F9 (v2) — Opening a saved file

`.py` associates with `portfolio_viewer` (the only text renderer; it already
falls back to a `<pre>`). **Additions the red team forced:** `system.ts`'s
`icons` map has no `.py`, and `new_fs_item_raw:396` defaults the icon to
`ApplicationWindow.png` — the *executable* icon — so saved scripts would look
like programs in the folder the spec argues visitors will go to. The host sets
`icon` explicitly and `.py` gets an icons entry. Names are additionally
rejected if the basename is empty (`.py`), or if the name is `.` or `..`, both
of which pass the v1 regex and produce items `path.ts` can never address.

### D-F10 (v2) — Root tidiness and session init

Unchanged in intent: remove `/tmp`, leave `/lib`, `/dev`, `/proc`, `/home`,
`chdir('/c')`. **Correction:** v1 implied this was free. It is not — the only
pre-banner hook is `run_source(greeting, true)` (`worker_source.ts:74-78`), a
single line through `PyodideConsole`. This needs a `pyodide.runPython(...)`
block in `worker_source.ts` before `send({kind:'ready'})`, which is also where
`/c` is built so that criterion 8 holds on the first prompt.

### D-F12 (v2) — The `xp` module

`xp.saved_dir`, `xp.limits`. **`xp.sync()` is dropped:** the red team is right
that its stated purpose was fictional — `exit`/`quit` are intercepted host-side
(`repl.ts:93-95`) and never reach the runtime, so there is nothing to flush
before. Mid-loop flushing is the only real use, and with per-statement diffing
plus the rate limit it is not worth the surface.

### D-F13 (v2) — Protocol and relays

**Corrections:** `protocol.ts` has exactly one validator, `parse_from_runtime` —
there is nothing "beside" it for the inbound direction. Three files need cases:
`protocol.ts` (validate `save`), `python-sandbox.html` (relay `mirror`; it
currently forwards only `init`/`exec`/`terminate`), and `worker_source.ts`
(handle `mirror`, **guarded on Pyodide being ready** — today `self.onmessage`
has no such guard and a message arriving during the ~10 s load throws into
`worker.onerror` and kills the session with "Try again once you are back
online").

`python-sandbox.html` lives in `static/` and is **outside ESLint, prettier and
coverage** by its own header. Its new relay case is therefore covered by E2E
only, and that must be deliberate rather than discovered.

### D-F15 (v2) — Tests

Unit (all genuinely pure now): the profile→text renderer shared with `cat`, the
mirror tree builder, name validation, cap arithmetic with `TextEncoder`, the
token bucket, and `parse_from_runtime`'s `save` case.

E2E hermetic: existing isolation specs pass **unchanged** — the regression
signal.

E2E `@online`, each one a red-team finding made executable:
- write → Explorer → `ls` → `cat` → reload → still there
- save the same name twice → **one** file, updated
- `NOTES.TXT` then any statement → no second file
- a forged `js.postMessage` flood → app still responsive, drive still persisted,
  item count bounded
- a `mirror` message during Pyodide startup → session survives
- `C:\My Documents\Python` cannot be deleted

Every new test mutation-verified.

---

## 4. What gate 4 (the plan red team) should attack

1. **Ordering.** D-F1a changes shipped `cat` output; does that land before or
   after the mirror depends on it?
2. **The token bucket's clock.** Where does it live so two sessions cannot each
   get a full bucket?
3. **`worker_source.ts` is a `String.raw` template** — the init block is
   untyped, unlinted, uncovered Python-in-JS-in-a-string. How is it tested?
4. **The generator change** for `PYTHON_FOLDER_ID` versus the CI freshness gate.
5. **Whether `protected_items` membership breaks any existing Explorer E2E.**
