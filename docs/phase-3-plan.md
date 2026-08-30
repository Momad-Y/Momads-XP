# Phase 3 implementation plan (v2)

> Gate 3, **revised after gate 4**. Findings and disposition:
> `docs/phase-3-redteam-plan.md`. v1 is commit `f74685f`. Spec:
> `docs/phase-3-spec.md` (v2).

## 0. What gate 4 changed

3 CRITICAL, 10 HIGH, nothing rejected. Four structural changes:

1. **The CSP never touches `/*`.** v1 would have blanked production — jQuery,
   `loadjs`, SvelteKit's inline hydration bootstrap and the `/api/browse`
   reporter all blocked, invisible to every local gate.
2. **The jspaint prune is an allowlist, and `sessions.js` stays.** v1 would have
   deleted Paint's only stylesheet and broken File ▸ New and every image open.
3. **Two tasks deleted** — the Vite `worker.format` change (no beneficiary after
   Spike A) and `jsdom` (fails identically to the bug it would test for).
4. **Reference capture moved to the front** (T0), per exit criterion 5.

### Spike results (unchanged from v1, both verified in real Chromium)

**Spike A — Python isolation.** In `<iframe sandbox="allow-scripts">`:
`indexedDB.open()` throws **SecurityError**; `fetch()` sends **`Origin: null`**;
`new Worker('/w.js')` throws *"cannot be accessed from origin `null`"*;
`new Worker(blob:)` **works**; and a 3 s busy loop in the frame let the parent
tick **21 times against ~320 expected** — so the sandbox gives complete origin
isolation and **zero thread isolation**. Design: **sandboxed iframe + blob-URL
worker inside it**. Trap recorded: `location.origin` reports the real origin
while the security origin is opaque — verify with capability probes only.

**Spike B — Paint sandbox.** `sandbox="allow-scripts"` breaks Paint
(`contentDocument` null, `systemHooks` SecurityError);
`allow-scripts allow-same-origin` preserves both while still blocking
top-navigation, popups, forms and modals. The **prune is the real hardening**.

---

## 1. Task graph

```
T0  reference capture ──────────────────────> (T6, T8, T10 visual work)
T1  root config (CSP path-scoped, pyodide types)
     ├─ T1a /html/* headers ──> T2
     └─ T1b pyodide types + version.ts ──> T7
T2p Paint E2E against the UNPRUNED bundle ──> T2  jspaint prune
T3  seed safety (carry + tombstones) ──> T9 music assets ──> T10 Music Player
T4a registry type + launch() fallthrough + finally
     ├──> T5 terminal core ──> T6 CMD      ──> T4b-cmd
     │                      └─> T8 Python  ──> T4b-python
     └──> T7 python sandbox host ──────────────┘
TD  Dialog.svelte z-index guard
T11 Paint verification [after T2]
T12 visual scoring loop [after T6,T8,T10,T11]
T13 phase guide
```

**Constraints v1 missed:** T0 → all visual work; T2p → T2; T1a → T2; components
→ T4b (v1 had this arrow backwards); T8 owns three extra shipped files; TD
existed nowhere.

**Restated honestly:** T3-before-T9 is *hygiene*, not user protection. §5
deploys production from `main` only, so users receive both atomically in the
cutover. **The cutover boundary is what protects them** — nobody should
parallelise T9 and assume otherwise.

---

## 2. Tasks

### T0 — Reference capture *(new, must precede visual work)*

Exit criterion 5 requires a named reference per surface **before**
implementation. `design/research/` has 68 files and **zero** matching
`wmp|media|term|cmd|python|winamp`. Capture `design/research/ref-wmp9.png` and
an XP Command Prompt chrome reference. If a reference cannot be obtained, that
is a decision to take now, not after the skin is built.

Also add **pixel-diff tooling**: there is no `toHaveScreenshot`,
`toMatchSnapshot`, `pixelmatch`, `odiff` or `resemble` anywhere in the repo, and
§11 forbids eyeballing. A ~20-line `scripts/pixel-diff.mjs` over paired PNGs, or
the phase guide reports **no number** and says why.

### T1 — Root config

**T1a — headers.** The `/*` block in `netlify.toml` is **not touched**. A
path-scoped block for the sandbox host only, written out in full and
**re-stating `frame-ancestors 'self'`** (a path-scoped CSP replaces the `/*`
value, silently dropping the red-team #7 clickjacking defence on exactly the two
framed pages):

```
[[headers]]
  for = "/html/python-sandbox.html"
  [headers.values]
    Content-Security-Policy = "script-src 'self' blob: 'wasm-unsafe-eval' https://cdn.jsdelivr.net; worker-src blob:; connect-src 'self' https://cdn.jsdelivr.net; frame-ancestors 'self'"
```

`worker-src blob:` and `'wasm-unsafe-eval'` are load-bearing: `worker-src` falls
back to `script-src`, so a policy naming only the CDN blocks
`new Worker(blob:)`, and Chrome blocks `WebAssembly.instantiate` without the
wasm keyword. Plus `X-Robots-Tag: noindex` and `Permissions-Policy:
camera=(), microphone=(), geolocation=()` for `/html/*`.
**Deploy-probe the day it merges** — no local gate applies `netlify.toml`.

**T1b — Pyodide types.** `pyodide@0.28.3` as a **types-only devDependency**
(`eslint.config.js:29-32` makes `no-unsafe-*` errors, and a CDN `import()` is
`any`). `src/lib/python/version.ts` exports `PYODIDE_VERSION`; a unit test
asserts it equals the installed package version, so a drifted pin is a red test
rather than a 404 on the deploy. **`npx -y npm@10 install`** after the
`package.json` edit.

**Dropped from v1:** `worker: { format: 'es' }` (Spike A moved the runtime to a
`static/` page Vite never processes; the only Vite-emitted worker left is
Explorer's `sort.js`, which works today) and `jsdom` (its
`getComputedStyle().height` is empty for every element — the exact `NaN`
condition that makes `fit()` fail silently, so the environment and the bug fail
identically).

**Build verification** gets a real harness: `scripts/verify-build.mjs` + a CI
step after the production build (vitest only sees `src/**/*.test.ts` and runs
*before* `build`, and the Rollup warning goes to stdout that nothing captures).
It asserts the target files exist first, then: no `.xterm-` rule in entry CSS,
and no "dynamically imported … also statically imported" warning.

### T2p — Paint E2E *(new, must precede T2)*

There is **no spec that opens Paint** — verified. Write it against the
**unpruned** bundle and land it green: open from Start menu; **open a seeded
`.png` from Explorer** (the `open_from_file` path); **File ▸ New**; draw; Save
As into the VFS; and assert a theme stylesheet actually applied. The first three
are the paths the prune breaks; without them the prune has no fail-first test.

### T2 — jspaint hardening

Closes a **live production hole**, verified by probing the deploy:
`/html/jspaint/{index.html,package.json,CNAME,src/imgur.js,CHANGELOG.md}` all
return 200 and `#load:<url>` renders an arbitrary attacker URL on the domain.

**Keep `sessions.js`.** Delete only the hash router (`:505-556` — which *is*
`#load:`/`#session:`) and the Firebase `MultiUserSession` (`:197-490`), keeping
`LocalSession` and `new_local_session`. Deleting the file would throw
`ReferenceError` at `functions.js:805` and `:923` — File ▸ New and every image
open, including our own `paint.svelte:251` wiring — and would silently kill
canvas autosave/restore.

Also remove, each verified safe: the `imgur.js` and `speech-recognition.js`
script tags (all three speech call sites are guarded at `app.js:614`, `:616`,
`:968`); **both** Imgur entry points — the File menu item *and* the second one
at `functions.js:1671-1675` (a live "Upload to Imgur" button in the GIF-export
window, Ctrl+Shift+G); the `#news` block **together with `index.html:115` and
`src/test-news.js`** (which dereferences `#news` unguarded at `:12-13` and would
throw an error dialog on every Paint open).

**Tree prune is an explicit allowlist**, never "what index.html loads" — that
phrasing would delete `styles/themes/classic.css`, which `index.html` references
**zero** times and `paint.svelte:241` asks for by name, plus cursors, help,
`audio/chord.wav`, the GIF/PDF workers and 26 localizations, all built by
runtime string construction. Delete only: `package.json`, `package-lock.json`,
`CNAME`, `CHANGELOG.md`, `CONTRIBUTING.md`, `README.md`, `TODO.md`, `cypress/`,
`cypress.json`, `jsconfig.json`, `.eslintrc.js`, `.travis.yml`, `.github/`,
`test-news-newer.html`, `lib/tracky-mouse/`, `src/electron-main.js`, `*.map`.

`sandbox="allow-scripts allow-same-origin"` on the frame. It silently disables
`saveAs` downloads (`app.js:261`, `:326`, `:331`), `alert()` and
`target="_blank"` — enumerated in the prune script's comments and the phase
guide; `allow-downloads` considered.
**Disclosed, not removed:** About Paint fetches `https://jspaint.app`
(`functions.js:1372-1376`).

### T3 — Seed safety *(must precede T9)*

`seed.ts:65` is `{ ...seed }`, so every seed id is replaced wholesale; carry is
only for ids *absent* from the new seed. Production went live 2026-08-23, so
this is the first bump against real user data.

**Carry onto surviving seed items:** `desktop_css_transform`; `sort_option`;
`sort_order`; **`name` + `basename` + `ext`** as one unit (renames — v1 omitted
these despite D-D3's own prose naming them, and the five desktop `.exe`s, 11
wallpapers and the résumé PDF are all unprotected); **`date_modified`** on seed
folders (`fs.ts:113-116` etc., a rendered Details column).

**Dropped: the `parent === recycle_bin` carry.** Verified dead — recycling is
`clone_fs` + `del_fs` (`CMFSItem.ts:286-293`), `clone_fs` mints a **new id**
(`fs.ts:243`) and `del_fs` removes the original (`fs.ts:119-125`), so no cached
item ever holds a seed id with a bin parent. Written literally it would also
corrupt the tree, since folders render from `parent.children` (`seed.ts:36-37`).
**Replaced by a tombstone set**: the real shipped bug is that a bin clone is
carried while `{...seed}` restores the original, so the visitor gets the file
**twice** — except the five desktop `.exe`s, whose clones are
`fake && executable` and are dropped by `is_stale_placeholder` while the icon
returns. Suppress seed ids the visitor deleted.

**Decide and record:** `url` + `storage_type` on a seed file rewritten by
`save_file` (`fs.ts:486-494`, reachable from `paint.svelte:289`) — reverting it
also orphans the idb blob forever, since `free_blob` only runs from `del_fs`,
which is quota pressure on the origin holding the VFS. And removal of seed
children from a seed folder's `children` (`seed.ts:74-82` handles additions
only).

**Tests:** one per carried field, each **written to fail first** — revert the
carry, watch it go red.

### T4a — Registry foundation

`src/lib/app_registry.ts`: the `AppDefinition` type, **zero app rows**, plus
`launch()`'s fallthrough. v1's single T4 was unmergeable — it registered three
components that do not exist, which `svelte-check` treats as an error, making
its own "every id resolves" test either red or vacuous.

The registry is a **translation layer with an explicit mapping table**, because
none of §6.3's field names exist in the code: `types.ts:116-140` has
`min_width`/`min_height`/`width`/`height`, no `minSize`, no `defaultSize`, and
**no `singleton` field at all** — `singleton` today is the path-string list at
`work_space.svelte:39-44`. Mapping: `defaultSize → options.width/height`,
`minSize → min_width/min_height`, `singleton → focus_existing`,
`taskbar → runningPrograms.update` (four existing branches omit it). Options
**merge** (`{...component_defaults, ...registry_overrides}`), never replace —
components declare `export let options: WindowOptions = {…}`, so a replacing
registry silently drops title, icon, `min_width` and `resizable`.

`focus_existing` reads the registry, or `singleton` is a field that type-checks
and does nothing. And the fallthrough uses
**`try { … } finally { queueProgram.set(null) }`** — verified that
`queueProgram.set(null)` is the *last statement* of `launch()`
(`work_space.svelte:423`), so a bare throw strands `$queueProgram` non-null and
leaves the entire desktop on `cursor: wait`; `:26` calls `void launch(...)`, so
the rejection is unhandled too.

**Tests:** launching a registered singleton twice yields one window; an unknown
path throws **and** clears the store.

### T5 — Shared terminal core

`src/lib/term/{readline,ansi,theme}.ts` — **pure, no DOM**. Readline with
cursor, backspace, ←/→, Home/End, ↑/↓ history and **bracketed-paste decoding
(`ESC[200~`/`ESC[201~`)**, without which every multi-line paste corrupts the
buffer. One `disposed` flag gating the animation loop, the runtime message
handler and every write path.

The xterm seam (construct, `open`, `ResizeObserver` → `fit`) lives **in the
`.svelte` component**, which is coverage-exempt — the logic that can be tested
is tested, and the part that needs a browser is verified by E2E asserting
`fit()` yields >80 cols at 1280×800. There is currently **zero `ResizeObserver`
in `src/`** and `fit()` returns *silently* when the parent's computed height is
`auto`, so the container gets an explicit height and the first `fit()` is
deferred a frame past the window's open transition.

Keyboard is bound on the xterm textarea only — never `svelte:window`, never
`stopPropagation` at window level.

### TD — `Dialog.svelte` z-index guard *(new; D-E11 was orphaned)*

`Dialog.svelte:53-70` binds `svelte:window on:keydown` and ranks only against
other `.dialog` nodes, never checking whether the focused window is its own — so
Escape typed at a REPL prompt cancels a background Explorer's dialog. Add the
same z-index guard every other keydown consumer already has, with its own test.

### T6 — CMD

Pure `(args, profile) => string[]` commands. Data per the corrected D-A4 table —
`profile.meta` for contact/whoami, **not** `profile.about`, which holds only
`bio`. `whoami` is `profile.meta.shortName.toLowerCase()`, derived. Note
`about.bio` is an **array of paragraphs**, not a string.

Bash-style `foo: command not found`, case-sensitive (§3.2: "bash emulation,
**not Windows cmd**"). Banner's third line becomes `Type 'about' to start, or
'projects' to see what I have built.` — v1's mandated text advertised `ls`,
which answers "not available yet". `ls`/`cd`/`cat`/`pwd` are known commands
saying so. Eggs cancellable, torn down on unmount.
(**Superseded after Phase 3** — those four shipped and the banner's original
line is back; see `docs/cmd-filesystem-plan.md`.)

**Also owns:** `start_menu.svelte`'s Command Prompt entry.

### T7 — Python sandbox host

```
parent (our origin)
  └─ <iframe sandbox="allow-scripts">   ← opaque origin: no IndexedDB, Origin: null
        └─ Worker(blob: URL)            ← thread isolation; loads Pyodide from CDN
```

**The driver source is named**, not left implicit:
`src/lib/python/worker_source.ts` exports a template string (linted, typed,
unit-testable) that the static host page inlines — v1's "thin bootstrap only"
was false under Spike A's architecture, and `static/` is outside ESLint,
prettier and coverage.

Also specified: the parent **must** validate `event.source ===
iframe.contentWindow` and `event.origin === 'null'`, because the opaque origin
forces `postMessage(msg, '*')`; the ready/timeout handshake; and **one frame per
REPL window** (D-E12 makes Python a singleton, so this is one frame).

**Isolation E2E — rewritten.** v1's version was vacuous three ways: the hermetic
suite substitutes a *stub* runtime that cannot execute `js.fetch`; `/api/*` does
not run under `vite preview` at all, so "the fetch failed" is true regardless;
and if the runtime never loads, "no VFS data appeared" passes. Instead probe the
frame directly — `page.frames()` + `frame.evaluate()`: `indexedDB.open` must
throw **`SecurityError`**, `new Worker('/w.js')` must throw, and `Origin: null`
must be observed on a **real intercepted request**, so a missing route is a
failure rather than a pass. Never assert on `location.origin` — Spike A recorded
that it lies.

### T8 — Python REPL app

Title derived from the runtime banner; icon `/images/xp/icons/Python.png`
(shipped and unused today). Load UX → progress → banner; legible failure.
Ctrl+C prints `Restarting Python… (session state cleared)` — a restart, not an
interrupt, since `SharedArrayBuffer` is unavailable. `input()` refuses.

**Also owns, in the same PR** (v1 assigned these to nobody):
`start_menu.svelte`'s Python entry; **`e2e/shell.spec.ts`** — both its tests use
the Python placeholder and D-E12's singleton breaks the cascade test's
`toHaveCount(2)`, so they re-point to a Games placeholder, which must still be
**rect-less** (`work_space.svelte:394-405` is the only `exec_path`-less branch);
and **`starting.svelte:34`**'s preload array, which contains neither
`Python.png` nor `WindowsMediaPlayer9.png`.

**Playwright projects made explicit**: `{name:'default', grepInvert:/@online/}`
and `{name:'online', grep:/@online/}` — the config defines **no** projects
today, so adding one without constraining the default makes `npx playwright
test` run both and download ~5 MB from jsDelivr on a 2-core runner. The CDN
200-check goes in a **scheduled** workflow, not the PR gate, or a jsDelivr
outage reds `dev`.

### T9 — Music assets + seed

Tracks are **broadband with real spectral movement** — layered harmonics, a
percussive transient track, a filtered noise sweep — because pure tones give the
analyser a one-spike spectrum and make the visualizer look broken.
`gen-tracks.sh` is **documentation, not a CI gate** (ffmpeg is undeclared),
stated explicitly since every other generated artifact here has a freshness gate.

**SSOT resolved:** the manifest is authoritative and `generate-vfs.ts` mutates
`My Music`'s children the way it already does for `C_DRIVE` and `DESKTOP` —
`vfs-base.json` is **not** edited (it already has `My Music` with `children: []`).
**`size` is hand-written in the manifest in KB** (`types.ts:35`) and *not*
`statSync`'d: `statSync` would make the mp3 bytes an input to `SEED_VERSION`
(which hashes the serialized seed), so regenerating a track would silently bump
the seed — the exact thing T3 exists to make safe. Track ids are **permanent**:
carried items can never be reaped. `manifest.ts` must compile under the
freshness gate's standalone `tsc --strict` with no DOM lib.

**KB-vs-adaptive E2E:** one test, one window — View ▸ Details **and** View ▸
Status Bar, assert `3,072 KB` in a Size cell **and** the adaptive MB total in
the status bar **in the same block**. Asserting only the Details cell passes on
a codebase where `size_label` was re-routed through `format_size` — the exact
"unification" §8 warns about.

### T10 — Music Player

WMP 9 chrome against T0's reference. Transport, volume (× `$systemVolume`),
seek, track list, Canvas visualizer.

Three verified footguns: **`createMediaElementSource()` is a permanent one-shot
binding on the element** — a second call throws `InvalidStateError` even from a
different context, so play → pause → play throws; cache one node per element in
a `WeakMap`. **`resume()` synchronously first** inside the click handler
(`await ctx.resume()` outside a gesture never settles). **A CORS-cross-origin
element outputs silence** into the graph — so the phase guide's swap-in-your-own
instruction says *local files only*.

The WeakMap test is a **contract test over an injected factory** (same element →
same node; two elements → two nodes). The `InvalidStateError` it prevents cannot
be reproduced in CI — headless Chromium also ignores the autoplay policy
(`new AudioContext().state === "running"`), so both go on the **manual gate-6
deploy-probe list**.

Also: `.mp3` keeps opening MPC, Music Player is the **second** `doctypes` entry;
fix `CMFSItem.ts:49`'s missing `.toLowerCase()` (instance #8); add the `.mp3`
row to `profile.json → folderOptions.fileTypes`; `start_menu.svelte` repoint;
`starting.svelte` preload. **Watch `export let window` shadowing** — every
program component declares it, and a visualizer reaching for
`window.requestAnimationFrame` or `devicePixelRatio` gets the prop.

### T11–T13

T11 Paint verification after the prune (interior explicitly **not**
parity-scored — it runs `classic.css`). T12 scoring loop only. T13 the §11
ten-section guide, carrying: the jsDelivr privacy disclosure, About Paint's
phone-home, the sandbox-disabled jspaint paths, the Pyodide pin and that
"3.13.x" is a *consequence* of it, and every manual deploy-probe line.

---

## 3. Tests that must not be able to pass on broken code

Gate 4 named seven. Each now has a specific fix: the isolation E2E probes the
frame directly; the seed tests revert real carries; the Paint E2E covers File ▸
New and open-an-image and asserts a theme loaded; the registry tests assert
singleton behaviour and store clearing; the KB-vs-adaptive E2E asserts both
surfaces at once; the build assertions check their target exists first; and the
WeakMap test is a contract test with the real failure on the manual list.

## 4. Deploy probes (the rule that caught two holes nothing else did)

After T1a: the site still loads, `/api/browse` still renders, both CSP headers
present on `/html/*`. After T2: Paint opens, draws, saves; pruned paths 404.
After T7/T8: Python runs, no CSP violation in console, isolation holds. After
T10: play → pause → play, and audio actually plays on a real gesture.

## 5. What gate 6 must re-derive rather than trust

The 12 call sites, from the code. Whether the tombstone set actually suppresses
resurrected seed items. Whether the prune left any runtime-constructed path
404ing. And whether the parity numbers are measured or estimated.
