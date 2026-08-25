# Gate 6 — red team of the Phase 3 implementation

The record that gates 2 and 4 have and this gate initially did not. Findings
below lived only in a commit message and PR #124 until this file was written.

Two fresh-context lenses over `git diff 7613987..HEAD` (13 commits, ~8.5k
insertions, 165 files), each told to find problems rather than validate:

| Lens | Brief |
| --- | --- |
| 1 | Security and data integrity |
| 2 | Correctness, regressions to shipped surfaces, and test quality |

**Outcome: 2 CRITICAL, 4 HIGH, ~10 MEDIUM/LOW, and 9 tests that could not
fail.** Every finding was independently reproduced before being accepted, and
every fix is mutation-verified. Nothing was rejected — both lenses were
accurate on every checkable claim. Fixes are in PR #124.

---

## CRITICAL 1 — the sandbox CSP was written but never served

`netlify.toml` declared the strict `/html/python-sandbox.html` block **before**
the general `/html/*` block. Netlify merges every matching rule and, for a
duplicate header **name**, the **last matching rule wins** — not the most
specific one. So `/html/*`'s `Content-Security-Policy = "frame-ancestors
'self'"` overwrote the whole policy.

Reproduced with the real CLI (`netlify dev --dir build`) before and after:

```
before:  Content-Security-Policy: frame-ancestors 'self'
after:   Content-Security-Policy: default-src 'none'; script-src 'unsafe-inline'
         blob: 'wasm-unsafe-eval' https://cdn.jsdelivr.net; worker-src blob:;
         connect-src blob: https://cdn.jsdelivr.net; frame-ancestors 'self'
```

`default-src 'none'`, the `script-src` allowlist, `worker-src blob:` and
`connect-src` were **all inert in production**. The phase's headline security
control shipped as a comment, and the code comment stated the wrong model
("a path-scoped CSP REPLACES the `/*` value").

**Why nothing caught it, and why it was the worst finding of the set:** it is
self-concealing. `vite preview` does not apply `netlify.toml`, so every local
gate stayed green. Netlify emits no warning for an overridden header. And
Pyodide runs *identically* with and without a policy — so both deploy probes
written specifically to catch CSP problems ("both CSP headers present",
"Python reaches `>>>` with no CSP violation") passed **more readily when the
CSP was missing**. The phase had built its own detection blind spot.

**Fixed:** the block is last in the file and must stay last; the probe now
greps for `default-src 'none'`, which can fail.

## CRITICAL 2 — every Python multi-line block was a syntax error

`PyodideConsole.push()` appends the line to its **own** buffer and re-joins
(`console.py`: `self.buffer.append(line); source = "\n".join(self.buffer)`).
`python.svelte` *also* accumulated and sent the joined block, so line two
double-concatenated. Reproduced against the pinned 0.28.3:

```
sent: "def f():"                  -> incomplete
sent: "def f():\n    return 41"   -> IndentationError: expected an indented
                                     block after function definition on line 1
then: "f()"                       -> NameError: name 'f' is not defined
```

Every `def`/`if`/`for` failed and the function was never defined — the
`>>>`/`...` continuation that §3.2 and the guide advertise most prominently.

**Why nothing caught it:** the hermetic suite stubs the runtime, and the single
`@online` test typed `2 + 2`. It also sat behind a test whose stated purpose was
to protect it (`protocol.test.ts`, "uses PyodideConsole for continuation rather
than counting braces") — a grep-shaped assertion on the worker source string,
which can never see a caller-side bug.

**Fixed:** send one line; `block` is kept only to choose PS1 vs PS2. The new
`@online` test reproduces the exact `IndentationError` when reverted.

---

## HIGH

### Ctrl+C threw `SecurityError` and permanently killed the REPL

`restart()` called `location.reload()` on an **opaque-origin** frame. `reload`
is not on `Location`'s cross-origin allowlist — merely *reading* it throws. The
throw escaped uncaught through xterm's `onData`, leaving "Restarting Python…"
and then no prompt, ever. The `terminate` branch had also cleared the host's
re-announce interval, so there was no recovery path either.

The unit test injected `location: { reload: vi.fn() }` and asserted the mock was
called — measuring the stub. There was no `@online` Ctrl+C test at all.

**Fixed:** the `href` **setter** (which *is* cross-origin permitted), with an
`src` fallback; the host re-arms its announce interval after `terminate`. A
faithful mutation (bare `reload()`, no fallback) reproduces the SecurityError
and reddens the new test.

### Registry apps were mounted with no `options.id`

`to_window_options()` emitted title/icon/exec_path/size and never `id`.
`Window.svelte` needs it for three separate behaviours, all of which degraded
silently and only for the new apps:

- `program-id={options.id}` is how `click_outside` excludes the window's own
  taskbar tile — absent, clicking that tile makes the window lose focus.
- the minimize animation targets `.program-tile[program-id="…"]` — absent, it
  matches nothing and the window flies to the page centre.
- `calc_nudges` compares `el.options.id != options.id`; `undefined != undefined`
  is false, so no sibling is found. **Two Command Prompts opened
  pixel-identical** (both at `top:155px left:280px`).

A false doc-comment ("registry components deliberately do NOT declare their own
`options` default") is what hid this from review. All three components *do*
declare one.

### Three more third-party paths the jspaint prune missed

- **About Paint automatically fetched `https://jspaint.app`**, DOMParsed the
  response, and the "What's New?" button appended that remote subtree into the
  live document with jQuery — whose `.append()` extracts and `globalEval`s any
  `<script>`. On our real origin. It also re-imported the exact `i.postimg.cc`
  images the first prune deleted. The guide had called this "a Help-menu
  action, not an automatic fetch"; **both halves were wrong**.
- **`load_image_from_uri` still fanned out to `cors.bridged.cc` and
  `jspaint-cors-proxy.herokuapp.com`** — a retired free Heroku dyno, i.e.
  re-registrable. Reachable not via `#load:` but via the **paste handler**, so
  pasting any URL into Paint sent it and the visitor's IP to third parties and
  rendered the result: the same arbitrary-URL-render primitive on a different
  trigger.
- **396 KB of orphaned Firebase SDK** plus `electron-injected.js`, still
  directly linkable under `/html/`.

### An empty cached drive wiped the whole VFS

`starting.svelte` treated `{}` as usable (`{} == null` is false), and the T3
tombstone pass then counted every seed id as "deleted" and removed all of them
— persisting a drive with zero items. Pre-T3 the same input yielded the full
seed, so this was a regression T3 introduced. Verified:

```
merge_on_reseed({}, seed, snapshot) -> 0 keys
merge_on_reseed({}, seed)           -> full seed
```

It could not fire on the Phase 3 bump (no visitor has a snapshot yet) — it armed
for Phase 4.

---

## MEDIUM / LOW — accepted and fixed

- **The three re-seed writes were not atomic.** A quota rejection between them
  left IndexedDB holding the merged drive while the session fell back to the
  old one, which `desktop.svelte` then persisted back over it. If the version
  write had landed first, the visitor would never re-seed again. Now one
  `setMany`.
- **Music Open With discarded the file it was opened with** and always played
  track 0 — making the entire reason for the second `doctypes['.mp3']` entry a
  no-op.
- **Every play/track-select spawned another `requestAnimationFrame` chain**,
  while `onDestroy` could cancel only the newest.
- **A Python `error` mid-block left `block` non-empty**, rendering a `...`
  prompt that could never advance.
- **CI's `npm run build | tee` masked build failures** — Actions' default shell
  is `bash -e`, and `-e` does not imply `pipefail`, so the step's status was
  `tee`'s.
- **The sandbox host did not check it was actually sandboxed.** One line
  (`if (window.origin !== 'null') return;`) closes the escalation where a
  same-origin page frames it *without* the attribute.
- **Dead code** inflating the coverage number: `ANIMATED_COMMANDS`,
  `PYODIDE_ENTRY` (whose docstring was also wrong), three unused `FG_*`
  constants, `Terminal.clear()`. `CLEAR_LINE_RIGHT`/`CR` are now used at both
  redraw sites instead of a literal.

---

## Nine tests that could not fail

The repo's most-repeated defect after the call-site pattern, and this phase
reproduced it at scale despite the rule being written down. Each is now
mutation-verified.

| Test | Why it could not fail |
| --- | --- |
| easter-egg escape, twice | Asserted `toContain('momad@xp:~$')` — the banner's own prompt was still in the viewport. Green with cancellation disabled entirely: the exact `rename_cancelled` shape its comment cited |
| `whoami` output | `toContain('momad')` is satisfied by the prompt `momad@xp:~$` before the command runs |
| `@online` real execution | Asserted a single character `'4'`, present in the CPython banner. This is the test that let CRITICAL 2 ship |
| two terminals | `openCmd`'s visibility assertion resolves on the first poll, when only one terminal exists; `toHaveCount(2)` counted windows, not terminals |
| volume | `toBeLessThanOrEqual(0.5)` is satisfied by `0` |
| distinct bin range | Only asserted `> 0`; the ranges were **not** distinct |
| terminal sizing | Constants compared to literals — a 40 px font stayed green |
| `verify-build` xterm CSS | Only `skip()` and `ok()` paths; no `fail()` at all |
| restart | Measured its own `vi.fn()` stub |

**Two real defects those weak tests were hiding**, both fixed:

- `bar_heights` never read bin 0, and the first five bars shared the same bin —
  log edges were floored independently instead of carrying forward, so the left
  of the visualiser moved in lockstep.
- `TERMINAL_MIN_WIDTH` was genuinely ~9 px short of fitting `MAX_COLS` at 14 px.
  The rewritten test derives the requirement instead of asserting a literal, and
  found it.

---

## Corrections made to `docs/phase-3-guide.md`

The guide asserted several things the code did not do. Fixed:

- "a path-scoped CSP *replaces* the `/*` value" — wrong model; Netlify merges
  by name and the last rule wins.
- "Ctrl+C is a restart" — it threw and killed the REPL.
- "About Paint … not an automatic fetch" — it was, and its response was
  injected into a same-origin document.
- "CMD … fails visibly if any field is missing" — there is no runtime
  validation; `profile.ts` deliberately declines a schema, so an *empty* array
  renders as silent blank output.
- The §8 checklist had no line for continuation or Ctrl+C — the two features
  that were broken.

---

## The lesson worth carrying to Phase 4

Three of this phase's worst findings were invisible to a full green gate chain
because **the thing that would have caught them was itself untestable locally**:
`netlify.toml` is not applied by `vite preview`, the hermetic suite stubs the
Python runtime, and headless Chromium ignores the autoplay policy. Where a gate
cannot run locally, the deploy probe is not a formality — and a probe that
passes *more easily when the feature is broken* is worse than no probe at all.
