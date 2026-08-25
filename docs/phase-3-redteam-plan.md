# Gate 4 — red team of the Phase 3 plan

Two fresh-context lenses against `docs/phase-3-plan.md` (commit `f74685f`):
sequencing/executability, and regressions/testability. **3 CRITICAL, 10 HIGH.**
Every finding below was re-verified in this session before acceptance. Nothing
was rejected: both lenses were accurate on every checkable claim.

The plan does not survive as written. Two of its tasks are **deleted** by the
review, which is the most valuable outcome here — both were work I invented and
neither had a beneficiary.

---

## CRITICAL 1 — the CSP would have blanked production (found independently by both lenses)

T1.4 said "`netlify.toml`: `script-src` / `connect-src` scoped to the Pyodide
origin." `netlify.toml:11-12` scopes its only header block to `for = "/*"`, so
that applies to **every document on the origin**. Verified as blocked:

| Blocked | Evidence |
| --- | --- |
| jQuery + jQuery UI (the window manager's drag/resize) | `src/app.html:24`, `:29` — `code.jquery.com` |
| `loadjs` | `src/app.html:206` — `unpkg.com` |
| SvelteKit's inline hydration bootstrap | `build/index.html` — 4 inline `<script>` blocks |
| three inline app scripts (contextmenu, `load_assets` boot gate, dragover) | `src/app.html:199`, `:211`, `:238` |
| jspaint's 45 script tags + inline script | `static/html/jspaint/index.html` |
| **the reporter injected into every `/api/browse` response** | `src/lib/server/browse/rewrite.ts` — third-party HTML served from *our* origin, so the `/*` header lands on it |

A `connect-src` scoped to jsDelivr additionally kills the boot asset fetch,
`/api/email`, and `fs.ts`'s blob reads.

**Nothing in the gate chain can see this**: `vite preview` does not apply
`netlify.toml`, so `check`, `lint`, `format:check`, `vitest`, `build` and
`playwright` all stay green. The failure is a **white screen on the deploy**,
plus the death of the `/api/browse` reporter that `session-handoff.md` §5 names
as the shape that must not be broken.

**Second-order:** the CSP the plan *did* specify also forbids the architecture
Spike A selected — `worker-src` falls back to `script-src`, so a policy naming
only the Pyodide origin blocks `new Worker(blob:)`, and Chrome blocks
`WebAssembly.instantiate` without `'wasm-unsafe-eval'`. And a path-scoped block
that sets `Content-Security-Policy` **replaces** the `/*` value, silently
dropping `frame-ancestors 'self'` on exactly the two pages that get framed.

**ACCEPTED.** The `/*` block is never touched. A path-scoped block for the
sandbox host only, written out in full and re-stating `frame-ancestors`:
`script-src 'self' blob: 'wasm-unsafe-eval' https://cdn.jsdelivr.net;
worker-src blob:; connect-src 'self' https://cdn.jsdelivr.net;
frame-ancestors 'self'`. Deploy-probe the same day it merges.

## CRITICAL 2 — deleting `sessions.js` breaks File ▸ New and every image open

Verified: `sessions.js:576` defines `window.new_local_session`, called
**unguarded** at `functions.js:805` (inside `open_from_image_info`) and `:923`
(`file_new`). Our own path reaches it: `paint.svelte:251`
`jspaint.open_from_file?.(file)` → `open_from_file` → `open_from_image_info` →
`:805`. The throw lands in `error-handling-enhanced.js:8` as an "Internal
application error." dialog, *after* `deselect()`/`cancel()` and *before*
`reset_file()` — a half-applied open. (Contrast `app.js:614`, which **does**
guard speech recognition — that prune is safe.) Also lost silently: the entire
canvas persistence layer (`sessions.js:99-146`), so "your drawing survives a
reload" dies.

And my own D-C2 ("may delete script tags, **may not patch jspaint's logic**")
forbids the obvious repair.

**ACCEPTED.** Keep `sessions.js`; delete only the hash router
(`:505-556`, which is what `#load:`/`#session:` actually are) and the Firebase
`MultiUserSession` (`:197-490`), keeping `LocalSession` and
`new_local_session`. Still a removals-only diff, and it closes both primitives.

## CRITICAL 3 — "prune the tree to what index.html loads" deletes Paint's stylesheet

`index.html` references `styles/themes` **zero** times — verified. Themes are
loaded by runtime string construction: `theme.js:5`
``href_for = theme => `styles/themes/${theme}` ``, injected as a `<link>` at
`:40-45`. And `paint.svelte:241` calls `set_theme('classic.css')` by name.
The naive prune deletes it, and Paint renders completely unstyled.

Same trap for everything else built at runtime: `images/cursors/*` (14),
`help/*` (33 files), `audio/chord.wav`, the msgbox icons,
`lib/gif.js/gif.worker.js`, `lib/pdf.js/build/pdf.worker.js`, and 26
`localization/*/localizations.js` directories.

**ACCEPTED.** Replaced with an explicit allowlist of deletions — only files
verified unreferenced: `package.json`, `package-lock.json`, `CNAME`,
`CHANGELOG.md`, `CONTRIBUTING.md`, `README.md`, `TODO.md`, `cypress/`,
`cypress.json`, `jsconfig.json`, `.eslintrc.js`, `.travis.yml`, `.github/`,
`test-news-newer.html`, `lib/tracky-mouse/`, `src/electron-main.js`, `*.map`.

---

## The two tasks the review deleted

**T1.1 `worker: { format: 'es' }` — dropped.** Its entire justification was a
Vite-emitted Pyodide worker silently shipping as IIFE. Spike A moved the runtime
into a blob worker created inside a `static/` page, which Vite never processes —
the spec says so itself. Verified: the only `new Worker` in `src/` is Explorer's
`sort.js` (`viewer.svelte:147`), which works today. The change would have been
pure regression risk against a shipped worker, and the plan spent its most
expensive verification budget proving harmless a change it did not need.

**T1.3 `jsdom` — dropped.** jsdom returns empty `getComputedStyle().height` for
every element — which is *exactly* the `NaN` condition that makes
`FitAddon.fit()` fail silently (D-A9). The bug and the test environment fail
identically, so the test cannot distinguish fixed from broken. It also has no
`ResizeObserver` (the API D-A9 introduces) and no canvas 2D context. The logic
T5 actually needs to test — readline, ANSI, theme constants — is pure and needs
no DOM. The xterm seam moves into the coverage-exempt `.svelte`, and sizing is
verified by E2E, the only environment that can see it.

---

## HIGH — accepted

1. **T4 is unmergeable as one PR.** It registers three components that do not
   exist; `svelte-check` resolves dynamic import specifiers, so it is red, and
   its own test ("every registered id resolves to a component") is either red or
   vacuous. **Split T4a** (type + `launch()` fallthrough + `else`) from **T4b**
   (per-app registry rows, landing with each app).
2. **The registry's fields have no mechanism behind them.** Verified:
   `types.ts:116-140` has `min_width`/`min_height`/`width`/`height`
   (snake_case), no `minSize`, no `defaultSize`, and **no `singleton` field
   anywhere**. `singleton` today is the path-string list at
   `work_space.svelte:39-44`. And component defaults live in
   `export let options: WindowOptions = {…}`, so passing `options` from the
   registry **replaces the whole object**, dropping title, icon, `min_width`,
   `resizable`. The registry must be a *translation layer* with an explicit
   mapping table and **merge**, not replace — and `focus_existing` must read it,
   or `singleton` is a field that type-checks and does nothing.
3. **`launch()`'s `else { throw }` strands the desktop.** Verified:
   `queueProgram.set(null)` is the **last statement** (`work_space.svelte:423`),
   so a throw skips it, `$queueProgram` stays non-null, and the whole desktop
   keeps `cursor: wait`. And `:26` calls `void launch(...)`, so the rejection is
   unhandled. Use `try { … } finally { queueProgram.set(null) }`.
4. **T3's `parent === recycle_bin` carry is dead code.** Verified: recycling is
   `clone_fs` + `del_fs` (`CMFSItem.ts:286-293`), and `clone_fs` mints a **new
   id** (`fs.ts:243`) while `del_fs` removes the original (`fs.ts:119-125`). No
   cached item ever has a seed id and a bin parent, so the branch can never
   fire — and its "fail-first test" could only be written against a state the
   app cannot produce, i.e. a test asserting a fiction. Worse if written
   literally: `seed.ts:36-37` records that folders render from `parent.children`,
   so setting `parent` without editing either `children` array yields an item
   visible in its original folder and absent from the bin.
   **The real shipped behaviour** is that the bin clone is carried while
   `{...seed}` restores the original — the visitor gets the file **twice** —
   except the five desktop `.exe`s, whose clones are `fake && executable` and
   are therefore dropped by `is_stale_placeholder` while the icon returns.
   **Fix: a tombstone set**, not a field carry.
5. **T3's carry list is missing four things.** `name`/`basename`/`ext` (renames
   — which D-D3's own prose names as a loss; written at
   `desktop_folder.svelte:328-332` and `viewer.svelte:482-486`, and the five
   `.exe`s, 11 wallpapers and the résumé PDF are all unprotected);
   `date_modified` on seed folders (`fs.ts:113-116` etc., a rendered Details
   column); `url` + `storage_type` on a seed file rewritten by `save_file`
   (`fs.ts:486-494`, reachable from `paint.svelte:289` — and reverting it
   orphans the idb blob forever, which is quota pressure on the origin holding
   the VFS); and removal of seed children from a seed folder's `children`
   (`seed.ts:74-82` handles additions only).
6. **T2's mitigation cites a Paint E2E that does not exist.** Verified:
   `grep -rn "jspaint\|paint.svelte\|main-canvas" e2e/` returns nothing. The
   only Paint references are a Start-Menu label and a Folder-Options string. The
   phase's most destructive task is backstopped by an imaginary test — and the
   E2E it *promises* would not have touched File ▸ New or open-an-image, the two
   paths CRITICAL 2 breaks.
7. **T12 inverts exit criterion 5.** The criterion says "each surface has a
   named reference **before implementation starts**"; the plan's graph puts
   reference capture after all four apps are built — reproducing precisely the
   failure gate 2 flagged. Verified: `design/research/` holds 68 files and
   **zero** matching `wmp|media|term|cmd|python|winamp`.
8. **The isolation E2E — exit criterion 2's proof — is vacuous as designed.**
   Three ways it passes on broken code: the hermetic suite substitutes a *stub*
   runtime that cannot execute `js.fetch`; `/api/*` does not exist under
   `vite preview` at all (the documented trap `stub_browse.ts` exists for), so
   "the fetch failed" is true regardless of isolation; and if the runtime never
   loads, "no VFS data appeared" passes. **Fix:** probe the frame directly with
   `page.frames()` + `frame.evaluate()` — `indexedDB.open` must throw
   `SecurityError`, `new Worker('/w.js')` must throw, and the `Origin: null`
   header must be observed via a real intercepted request so a missing route is
   a failure, not a pass. And never assert on `location.origin` — Spike A
   already recorded that it lies.
9. **Three shipped files the 12-call-site table demands are assigned to no
   task**: `start_menu.svelte` (without it none of the three apps is reachable),
   `starting.svelte:34`'s preload array (verified: neither `Python.png` nor
   `WindowsMediaPlayer9.png` is in it, and D-V3/D-V4 introduce both), and
   `Dialog.svelte:53-70`'s z-index guard (D-E11's verdict, orphaned).
10. **`e2e/shell.spec.ts` breaks at T8 and no task owns it.** Both its tests use
    the Python placeholder, and D-E12's singleton verdict additionally breaks the
    cascade test's `toHaveCount(2)`.

## MEDIUM — accepted

- **Two more jspaint network paths the audit missed**: a **second** Imgur call
  site at `functions.js:1671-1675` (a live "Upload to Imgur" button in the
  GIF-export window, reachable via Ctrl+Shift+G), and **About Paint fetching
  `https://jspaint.app`** on every open (`functions.js:1372-1376`).
- **Removing the `#news` block throws on every Paint open** —
  `test-news.js:12-13` dereferences `#news` with no null guard, producing an
  error dialog that would be blamed on the sandbox attribute. Delete
  `index.html:115` and `test-news.js` in the same commit.
- **The `sandbox` attribute silently disables** `saveAs` downloads
  (`app.js:261`, `:326`, `:331`), `alert()` (`error-handling-basic.js`) and
  `target="_blank"` links. Enumerate or grant `allow-downloads`.
- **≥95% parity is not measurable with anything in this repo.** No
  `toHaveScreenshot`, `toMatchSnapshot`, `pixelmatch`, `odiff` or `resemble`
  anywhere in `src/`, `e2e/` or `playwright.config.ts`. §11 forbids eyeballing,
  so the number would be an estimate presented as a measurement — the exact
  failure `redteam-post-phase-2` §F recorded. Add a ~20-line `pixelmatch` diff
  script, or report no number and say why.
- **Three of T1's four "tests" have no harness.** vitest only sees
  `src/**/*.test.ts` and runs before `build`; the Rollup warning goes to
  `vite build` stdout, which nothing captures. Needs a committed
  `scripts/verify-build.mjs` and a CI step.
- **The `@online` project would run in CI as written.** `playwright.config.ts`
  defines no `projects`, so adding one without constraining the default means
  `npx playwright test` runs both — downloading ~5 MB from jsDelivr on a 2-core
  runner and breaking the hermetic rule. And a CDN 200-check on the PR gate
  turns a jsDelivr outage into a red build on `dev`; it belongs in a scheduled
  workflow.
- **T9's "manifest is SSOT" contradicts its own file list**, which edits
  `vfs-base.json`. And track `size` has no stated provenance: hand-written
  drifts from the committed bytes; `statSync` makes the mp3 bytes an input to
  `SEED_VERSION`, so regenerating a track silently bumps the seed — the thing
  T3 exists to make safe.
- **The KB-vs-adaptive E2E must assert both surfaces in one window**, or it
  passes on a codebase where `size_label` was re-routed through `format_size`
  — the exact "unification" §8 warns about.
- **`window` prop shadowing** (accepted gate-2 finding 31) has no owning task,
  and T10's visualizer is the most likely place to hit it.
- **T2 is not "independent, ship first"** — its own file list includes
  `netlify.toml (in T1)`.
- **The T3→T9 ordering is weaker than claimed.** Production deploys from `main`
  only, so users receive T3 and T9 atomically in the cutover regardless of merge
  order. The ordering is hygiene; the **cutover boundary** is what protects
  users. Worth restating so nobody parallelises T9 and assumes otherwise.
