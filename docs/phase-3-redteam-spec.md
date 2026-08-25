# Gate 2 — red team of the Phase 3 spec

Three fresh-context lenses, each told to find problems rather than validate,
run against `docs/phase-3-spec.md` (commit `adb14ec`):

| Lens | Brief |
| --- | --- |
| 1 | Scope, decision quality, hidden sub-decisions |
| 2 | Technical feasibility and failure modes (empirical: real builds, live registry/CDN fetches) |
| 3 | Security posture and regressions to shipped surfaces |

**Outcome: the spec does not survive as written.** 2 CRITICAL, 12 HIGH,
~15 MEDIUM, 15 missing sub-decisions, 11 scope gaps against
`SPECIFICATION.md`, and 5 false claims the spec made about the codebase.
Every claim below was re-verified in this session before acceptance;
one finding is REJECTED with a concrete counter.

---

## The two CRITICALs

### C1 — the Python worker would have run with full same-origin authority

D-B2 chose a Web Worker and reasoned **only about hangs**. A dedicated worker
inherits the creating document's origin, so user-typed Python — which the app
exists to invite — reaches everything our origin reaches:

- `js.fetch("/api/browse?url=…")` presents a genuine `Sec-Fetch-Site:
  same-origin`. That is the exact header `session-handoff.md` §5 and
  `+server.ts:170-190` call unforgeable origin proof. It is unforgeable *by a
  remote client*; it was never evidence that our own app drove the request.
- `js.fetch("/api/email")` carries a valid `Origin`, and `opened_at` is
  client-supplied, so `validate.ts:58`'s `too_fast` guard is bypassed by
  writing `Date.now()-10000`.
- **`indexedDB` is available in workers** (`localStorage` is not). idb-keyval's
  store holds the whole VFS under `hard_drive` — readable, exfiltratable,
  deletable.
- `/api/browse` checks its global cap before the per-IP cap
  (`+server.ts:210-215`), so one visitor can burn all 5000 daily requests and
  take IE offline for everyone.

Reachable two ways: a pasted snippet (pastejacking; a REPL is the standard
bait) and a bad byte on the CDN (C2).

**ACCEPTED.** Verified: `Sec-Fetch-Site` is computed from the initiator's
origin, which for a dedicated worker is the document's; IndexedDB is exposed
in `WorkerGlobalScope`.

### C2 — no integrity story for the CDN runtime

D-B1 weighed availability, size and version drift, and never asked what happens
if jsDelivr **serves something else**. `importScripts` supports no `integrity`,
and Pyodide then fetches `pyodide.asm.wasm` / `python_stdlib.zip` itself from
`indexURL`, outside any SRI. `netlify.toml` sets no `script-src` / `connect-src`
(verified: the only CSP is `frame-ancestors 'self'`). Combined with C1 that is
arbitrary JS with full origin authority for every visitor who opens Python.

**ACCEPTED.** C1 and C2 are resolved as **one** sub-decision (new D-B0), because
the same mechanism caps both blast radii — and it is already this project's own
pattern: §5's IE frame is sandboxed **without** `allow-same-origin`, so a
proxied page runs on an opaque origin. On an opaque origin the runtime has no
IndexedDB of ours, no cookies, and its fetches present `Origin: null` /
`Sec-Fetch-Site: cross-site`, which both endpoints already reject.

---

## Verified live-production finding (pre-existing, not introduced by Phase 3)

Probing the running deploy, per the standing rule:

```
/html/jspaint/index.html    200  (38 KB, a live page)
/html/jspaint/package.json  200
/html/jspaint/CNAME         200   -> "jspaint.app"
/html/jspaint/src/imgur.js  200
/html/jspaint/CHANGELOG.md  200
```

The vendored tree is directly linkable on the production domain, and
`src/sessions.js:505-556` honours `location.hash`:

- `#load:<url>` fetches and renders an **arbitrary attacker URL** on
  `momad-xp.netlify.app` — a phishing-grade primitive on the owner's domain.
- `#session:<id>` joins a Firebase channel (`sessions.js:213-215`, hardcoded
  `apiKey` + `https://jspaint.firebaseio.com`).

The bundle is also not inert in the embed: `index.html:760` loads `imgur.js`
(hardcoded `Client-ID 203da2f300125a1`, `POST https://api.imgur.com/3/image`,
live as File ▸ Upload To Imgur), `:764` `speech-recognition.js` (audio to
Google), `:766` `sessions.js`; `index.html` embeds **12** `i.postimg.cc` images
inside a `hidden` div — and `hidden` is `display:none`, which does not suppress
image fetches, so every Paint open leaks the visitor's IP to a third party.
`paint.svelte:331-343` sets **no `sandbox` and no `allow`**, so the frame
inherits the parent's permissions policy in full. jspaint also writes to our
origin's localStorage, which is quota pressure on the same origin as the VFS —
and `redteam-post-phase-2` **B4** records that at quota, `void set('hard_drive',
…)` rejects into nothing and the visitor's files vanish on reload.

**ACCEPTED.** Phase 3 is the phase that blesses jspaint, so hardening it lands
here. D-C1's check (d) was scheduled to run *after* the verdict was locked; it
has now run and falsified the verdict's premise.

---

## Findings accepted, by area

### Toolchain (would have shipped broken past every green gate)

1. **Vite emits workers as IIFE by default.** Verified in this repo:
   `resolveConfig(...).worker` → `{"format":"iife"}`. A worker that statically
   imports the Pyodide ESM emits `(function(e){…})(pyodide_mjs)` — an undefined
   global — with only a Rollup *warning*. `npm run build`, `svelte-check`,
   ESLint, vitest and Playwright (which stubs the CDN) all stay green; it fails
   **only on the deployed site**, as an opaque `worker.onerror`. Any local
   dynamic import inside the worker is instead a hard build failure attributed
   to `index.html`. Fix: `worker: { format: 'es' }` in `vite.config.js` — a root
   config change the spec never mentioned, and one that also changes the
   emitted format of the existing `sort.js` worker.
2. **vitest has no DOM environment.** No `environment` set → Node; no `jsdom` /
   `happy-dom` in `package.json` (verified); zero existing DOM tests. Coverage
   includes all `src/**/*.ts` and CI gates diff-cover at 80%. So a
   `src/lib/term/terminal.ts` and a worker entry are counted and untestable —
   a direct D-B3 × D-E4 collision the spec did not see.
3. **`strictTypeChecked` vs an untyped CDN import.** `eslint.config.js:29-32`
   makes `no-unsafe-*` errors and `no-explicit-any` / `no-unsafe-type-assertion`
   errors. A dynamic `import(CDN_URL)` is `any`, and every downstream call with
   it. The `.d.ts` files live in the npm `pyodide` package **that D-B1
   rejected** — and D-B1's rejection reasoning was itself wrong (see 4).
4. **D-B1's rejection of the npm package conflated two things.** The package's
   data files *can* be emitted into `build/` and served same-origin, which does
   remove the network hop the rejection claimed it could not. Revised verdict:
   CDN at runtime **+ `pyodide` as a types-only devDependency**, with the
   version constant asserted equal to the devDependency version.
5. **Pyodide has left `0.x`.** Verified against the live registry and each
   build's own `pyodide-lock.json`: `latest` is **314.0.5 → Python 3.14.2**
   (ABI `2026_0`); `0.28.3` → Python **3.13.2** (ABI `2025_0`).
   `v314.0.5/full/pyodide.asm.js` **404s** (renamed `.mjs`) and classic workers
   are gone in 314.x. So §3.2's "Python 3.13.x" is a *consequence of pinning
   0.28.3*, not an independent requirement, and "a bump is one edit" is false.
   The spec must say which it is.

### Architecture / wiring

6. **D-E1's "five call sites" is wrong and incomplete — the real set is 12**,
   verified against code. It named the wrong e2e file, and missed
   `singleton_programs`, the `icons` record (separate from `doctypes`),
   `runningPrograms.update` (not uniform across existing branches),
   `exec_path: path`, `profile.json → folderOptions.fileTypes`, and
   `starting.svelte:34`'s hardcoded preload array. Worse: **`launch()` has no
   `else`** — a mistyped path is a silent no-op with no window, no error and no
   test failure.
7. **`SPECIFICATION.md` §6.3 mandates a central `appRegistry.ts`** with exactly
   the fields at issue (`singleton`, `minSize`, `desktopIcon`, lazy `component`).
   D-E1's answer to a 20-branch if-chain that has produced seven wiring defects
   was to add three more branches and write a checklist — against a section it
   never cited. **ACCEPTED**: adopt §6.3 and make the wrong thing
   unrepresentable, which is what `redteam-post-phase-2` recommends.
8. **`e2e/shell.spec.ts` is load-bearing and was missed.** Its header says the
   Python entry is "the surviving placeholder target". Its cascade test is the
   **only** coverage of the 24px rule and needs a *rect-less* window —
   `work_space.svelte:394-405` is the single branch that omits `exec_path`, so
   it cannot be re-pointed at a real Phase 3 app; it must move to a Games
   placeholder.
9. **Singleton is undecided per app.** Each Python instance is its own runtime:
   measured **~5.04 MiB wire** per instance (2.67 MB brotli wasm + 2.38 MB
   already-deflated stdlib zip) plus a full CPython heap. Three Start-Menu
   clicks is a tab kill on a mid-range phone.

### Shipped-state regressions

10. **The SEED_VERSION bump wipes user state D-D3 claimed was handled.**
    `seed.ts:65` is `const result = { ...seed }`, so every seed id is replaced
    wholesale; carry-by-provenance only carries ids **absent** from the new
    seed. And `desktop_folder.svelte:158` writes `desktop_css_transform` onto
    those seed items. So on the bump: all five desktop icon positions reset,
    per-folder sort settings reset, renames revert, and recycled seed items
    come back out of the bin (the desktop `.exe`s and the 11 wallpapers are not
    in `protected_items`). This would be the **first** bump against real user
    data — production went live 2026-08-23.
11. **Seeded tracks are a one-way door.** `merge_on_reseed` carries every
    non-placeholder cached item absent from the new seed, so a track renamed or
    removed in a later phase persists in every returning visitor's `My Music`
    forever, with no reaping mechanism.
12. **First >1 MB file in a visible folder.** `session-handoff.md` §8 records
    the KB-vs-adaptive divergence as a *deliberate* coverage gap precisely
    because no visible file exceeds 1 MB. Seeded MP3s put `3,072 KB` (Details)
    next to `3.00 MB` (status bar) on a shipped surface for the first time —
    and the next reader "unifies" them and re-breaks the five Desktop items.
    The phase should add the E2E §8 says was impossible; it is now free.
13. **Escape and Ctrl+C are unarbitrated.** D-A1 names the conflict in its own
    "against" and no sub-decision resolves it. Verified: every window-level
    keydown consumer guards on `window?.z_index === $zIndex` **except**
    `Dialog.svelte:53-68`, which compares only against other `.dialog` nodes —
    so Escape at a REPL prompt cancels a background Explorer's dialog. And if a
    terminal branch omits `runningPrograms.update`, `a_window_is_focused` goes
    false and **Ctrl+C at a Python prompt copies the desktop selection** —
    §8 rule 3's exact failure mode, re-armed.
14. **`CMFSItem.ts:49` reads `doctypes[item.ext]` with no `.toLowerCase()`** —
    alone among five call sites (`favorites.ts:51`, `desktop_folder.svelte:226`,
    `viewer.svelte:382`, `file_icon.ts:23` all lowercase). Harmless today;
    D-D6's second `.mp3` handler makes it user-visible. Instance #8.

### Correctness of the four apps

15. **FitAddon fails silently and nothing would ever call it.** Verified: zero
    `ResizeObserver` anywhere in `src/`; `Window.svelte` resizing is jQuery UI
    reporting to nothing. And `fit()` returns without throwing when the parent's
    computed height is `auto` (`parseInt("auto")` → `NaN`). Symptom: a terminal
    frozen at 80×24 in a 700×500 window, clipped, no console error.
16. **`createMediaElementSource()` is a permanent one-shot binding on the
    element** — a second call throws `InvalidStateError` even from a different
    `AudioContext` (the check is on the element). So play → pause → play throws.
    Cache one source node per element in a `WeakMap`. Also: a CORS-cross-origin
    element **must output silence** into the graph, so the phase guide's "drop
    in your own MP3s" instruction kills the visualizer if a remote URL is used;
    and `await ctx.resume()` outside a user gesture never settles.
17. **Headless Chromium ignores the autoplay policy** — `new AudioContext().state`
    is `"running"`. So the E2E gate structurally cannot catch the regression
    D-D4 exists to prevent. Needs a manual deploy-probe line.
18. **D-B7's deciding factor is false.** JSPI (`run_sync`) gives blocking
    `input()` with no `SharedArrayBuffer` and no COOP/COEP; it landed in Pyodide
    0.25 and is auto-detected. The *verdict* (defer `input()`) survives on
    Safari — not in stable — and experimental status, but the stated reasoning
    would have been carried into Phases 4 and 6 as settled fact. Rewrite it.
    (`SharedArrayBuffer` genuinely is unavailable — verified `crossOriginIsolated:
    false` — so `setInterruptBuffer` really is off the table, and
    terminate-and-respawn really is the only interrupt. But it **destroys every
    variable the user defined**; that is a restart, not an interrupt, and the UI
    must say so.)
19. **The mandatory banner advertises the commands D-A6 removed.** Exit
    criterion 1 requires printing §3.2's intro *verbatim*, and its third line is
    `Navigate my portfolio like a filesystem — try 'ls' or 'cd experience'.`
    Both lenses caught this independently. The first interaction a visitor has
    with the flagship developer app would be a dead end the app pointed them at.
20. **D-A8 overrides §3.2 with taste.** §3.2 line 1 is "Linux-style terminal
    (**bash emulation, not Windows cmd**)"; D-A8 chose cmd.exe's error string
    for the joke and did not record the deviation where gate 6 would see it.
21. **D-A4's `contact` command has no data source.** Verified: `profile.about`
    has exactly one key, `bio`. Email/location/name live in `profile.meta`.
    And `whoami`'s "literal `momad`" contradicts D-A4's own preamble and §3.2's
    "All command output data sourced from JSON" — `profile.meta.shortName` is
    `"Momad"`.
22. **D-C2 forbids the only fix for D-C1's own check.** You cannot remove a
    jspaint menu item from the wrapper — it only overrides `systemHooks` and
    toggles pointer-events — so "close gaps in our wrapper" cannot close the
    Upload-To-Imgur and Load-From-URL data paths that check (d) exists to find.
23. **D-C1 omitted the option §9 Phase 0 names in writing**: "jspaint alone is
    45MB; *optionally slim its dist further*". That answers the only genuine
    "against" at a fraction of the strawman alternative's cost.
24. **Synthesized pure tones undermine the visualizer.** Three ffmpeg tones fed
    to an `AnalyserNode` give a one- or two-spike spectrum — the visualizer,
    an explicit §3.2 feature and an exit criterion, looks broken rather than
    thin. D-D2's "against" was about taste and missed the coupling to D-D4.
25. **D-E7 misreads §4.6.** Portrait (<1024px) renders a single static page with
    no window management, explicitly defers "CMD terminal, Python REPL, Paint",
    and forbids loading "Pyodide, js-dos, **xterm.js**". `mobile.ts:19-22`
    returns `desktop` only at ≥1024px and mode is locked at load. So the
    "cramped terminal" the decision mitigates cannot occur, and the real
    undecided case — §4.6's own note that **≥1024px touch devices get the full
    desktop** — is untouched.

### Smaller, accepted

26. D-A2's deciding factor ("the only unit-testable option") is false and
    post-hoc; the honest one is D-B3's (continuation + interrupt semantics no
    generic addon exposes). Unbudgeted: xterm enables **bracketed paste**, so a
    hand-rolled readline must decode `ESC[200~`/`ESC[201~` or every paste
    corrupts the buffer.
27. D-A1's "~250 KB gzipped" overstates by ~2.8×. Measured on the published
    tarball: `@xterm/xterm@6.0.0` is **86 KB gz**, CSS 2.5 KB, addon-fit 0.8 KB —
    **~89 KB**. Since weight is the only "against", the verdict is stronger than
    the spec made it look. (`xterm` is deprecated → `@xterm/xterm`; addon-fit
    reaches into `terminal._core._renderService`, so pin both exactly.)
28. D-E3 names the wrong CSS trap. Code-splitting works as described (verified);
    the real trap is that a module **both** statically and dynamically imported
    is not split, and Rollup says so as a *warning*. Gate on the warning string
    and on "no `.xterm-` rules in entry CSS".
29. D-A5's teardown latch covers the easter eggs and forgets the worker: a
    `print()` chunk arriving after close writes into a disposed xterm and throws
    asynchronously into no handler. One `disposed` flag in the shared core must
    gate the animation loop, the worker `onmessage` and every write path.
30. D-D6's second handler surfaces on **one** path only — `CMFSItem.ts:73-76`
    renders Open With at `length >= 2`, but `viewer.svelte:393`,
    `desktop_folder.svelte:236` and `favorites.ts:52` all take `[0]`
    unconditionally, so File ▸ Open never shows it. Given §1b's "no dead
    entries" standard the guide must say so.
31. `export let window: WindowController` shadows the global in all 20 program
    components, so `window.requestAnimationFrame` / `getComputedStyle` /
    `devicePixelRatio` in the new components resolves to the prop.
32. Netlify limits are a non-issue and the concern should be dropped: 61 MB /
    3,467 files, largest directory 554 files against a 54,000 cap, no file over
    10 MB. (Incidental: ~10 MB of third-party `.map` files nobody fetches.)
33. Privacy/cost, unbudgeted: ~5 MB+ from jsDelivr per cold cache per visitor
    who opens Python, and jsDelivr sees their IP and UA. The project already
    cares (`referrerpolicy="no-referrer"` on the IE frame). Zero new Netlify
    function invocations. `scripts/gen-tracks.sh` creates "generated but
    committed" binaries with **no** CI freshness gate, unlike every other
    generated artifact — the spec must say which it is.

### Missing sub-decisions (15) — all accepted

Terminal font (§10 assigns **Lucida Console**, absent from all 651 lines, and it
does not exist on Linux/Android) and colour scheme; Python window title and icon
(`static/images/xp/icons/Python.png` exists and is unused while
`start_menu.svelte:132` passes the generic `ApplicationWindow.png`); **WMP vs
Winamp** and which WMP generation (§3.2 offers both; both icons ship);
singleton-vs-multi per app; keyboard arbitration; the worker file's language,
location and coverage treatment (the `sort.js` `.js` precedent conflicts with
strict TS); the track manifest's single source of truth across `static/` and the
seed; `whoami`'s source; the startup banner text; audio arbitration between MPC
and the new player; CSP/SRI/privacy posture; `date`/`time` output format;
minimum terminal width (deferred by D-A4 *and* D-E7, owned by neither); what
happens to `placeholder.svelte`'s tests; and new icons in `starting.svelte`'s
hardcoded preload array.

### Scope gaps vs SPECIFICATION.md (11) — all accepted

§10 Lucida Console; §6.3 central `appRegistry.ts`; §3.2 "bash emulation, not
Windows cmd"; §3.2's verbatim intro; §3.2 "All command output data sourced from
JSON"; §3.2 "Python branding"; §3.2 "WMP **or Winamp**"; §4.6 mobile; §10 icons
for CMD/Python/Paint/Media Player; §11 parity references; §9 Phase 0's
"optionally slim its dist further".

### The parity gap — the single highest-leverage fix

The spec deliberates 25 engineering decisions and **zero visual ones**, while
exit criterion 5 demands ≥95% parity on four surfaces. `design/` was checked:
it holds icons (`asset-pool/icons/cmd.png`, `media-player.png`, `paint.png`) but
**no screenshot reference for a terminal, a Python REPL, or a media player** —
only `gate-07-paint.png`. Worse, §3.2 specifies CMD as a *Linux-style* terminal
titled `momad@xp:~`, a surface Windows XP never had, so there is no XP reference
to score it against; `paint.svelte:241` runs jspaint's `classic.css` (Win98-ish)
so Paint's target is undefined too. The prior phase's parity pass scored 70–90%
on every surface it built (`redteam-post-phase-2` §F). This is the gate most
likely to fail, with nothing to iterate against, after the code is written.

---

## REJECTED — one finding, with a concrete counter

**Lens 3 #9: "Playwright's `page.route` may not intercept requests issued from
inside a dedicated worker, so D-B5's stated mechanism is unverified."**

Rejected on the mechanism. Lens 3 reasoned from historical scoping and marked it
unverified; lens 2 **actually ran it** and reported that `page.route` intercepts
both `fetch()` and dynamic `import()` issued from inside a dedicated worker, and
that `route.fulfill({contentType:'text/javascript'})` successfully substitutes a
module. An empirical result on the pinned Playwright version (1.61.1) beats an
inference about older versions. D-B5's hermetic strategy is mechanically sound.

Lens 3's *second* point in the same finding is **accepted**: the spec described
two different mechanisms in one breath ("route-stub the CDN" and "against a fake
worker"). If a fake worker is substituted the CDN is never contacted and routing
is moot. The revised D-B5 states one mechanism.

*(Note on D-B0: the new isolation architecture may move the runtime out of a
plain dedicated worker, in which case this interception result must be
re-confirmed for whatever context replaces it — recorded as a gate-3 spike.)*
