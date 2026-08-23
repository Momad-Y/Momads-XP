# Phase 3 implementation plan

> Gate 3 of the §11 six-gate workflow. Input: `docs/phase-3-spec.md` (v2) and
> `docs/phase-3-redteam-spec.md`. Gate 4 red-teams this document before any
> code is written.

## 0. Spike results — both open questions are now closed

The spec left two mechanisms unproven and required they be settled before
planning. Both were run in real Chromium (Playwright 1.61.1).

### Spike A — does an opaque-origin sandboxed iframe isolate Pyodide? (D-B0)

`<iframe sandbox="allow-scripts">` (no `allow-same-origin`), probed from inside:

| Probe | Result | Meaning |
| --- | --- | --- |
| `indexedDB.open()` | **SecurityError — "access to the Indexed Database API is denied in this context"** | The VFS is unreachable. C1's main prize is gone |
| `fetch()` request headers | **`Origin: null`** | `/api/email`'s origin check rejects it |
| `new Worker('/w.js')` | **SecurityError — "cannot be accessed from origin `null`"** | Confirms the document's real origin is opaque |
| `new Worker(blob:…)` | **works** | The fallback mechanism is available |
| `location.origin` | `"https://example.test"` | **A trap** — it reports the URL's origin while the security origin is opaque. Never verify isolation with this; verify with a capability probe |
| **Parent event-loop ticks during a 3 s busy loop in the frame** | **21, against ~320 expected** | **The parent IS blocked** |

**Conclusion: the sandbox alone is not enough.** It delivers the origin
isolation (C1/C2) completely, and delivers *no* thread isolation — a `while
True: pass` in a bare sandboxed frame would still freeze the desktop, which is
the exact failure D-B2 existed to prevent. The spec's written-down fallback is
therefore the design, not a contingency:

> **sandboxed iframe (origin isolation) + a worker created inside it from a
> `blob:` URL (thread isolation).** Blob URLs inherit the creating context's
> opaque origin, so the worker is same-origin with the frame and inherits its
> powerlessness.

### Spike B — does `sandbox` break Paint? (D-C3)

`paint.svelte` needs `iframe.contentDocument` and `contentWindow.systemHooks`.

| Attribute | `contentDocument` | `systemHooks` |
| --- | --- | --- |
| none (today) | ACCESSIBLE | ACCESSIBLE |
| `sandbox="allow-scripts"` | **null** | **THREW SecurityError** |
| `sandbox="allow-scripts allow-same-origin"` | ACCESSIBLE | ACCESSIBLE |

**Conclusion:** Paint cannot be origin-isolated while it depends on
`contentDocument` — `netlify.toml` already documents that dependency. But
`allow-scripts allow-same-origin` is not a no-op: it still blocks top-level
navigation, popups, forms, modals, pointer-lock and downloads. So Paint gets
that attribute, and **the prune (D-C3) remains the actual hardening**, not the
sandbox.

---

## 1. Task order and dependencies

Ordering is driven by three hard constraints: config must precede the code that
depends on it; **the seed-safety fix must precede any seed bump**; and the
registry must precede the app wiring that uses it.

```
T1 config ──┬─> T5 terminal core ──┬─> T6 CMD ──┐
            │                      └─> T8 Python REPL
            └─> T7 python sandbox host ──────────┘
T2 jspaint hardening        (independent)
T3 seed safety ─> T9 music assets + seed ─> T10 Music Player
T4 app registry ─> (T6, T8, T10 wiring)
T11 Paint verification   (after T2)
T12 parity references + visual loop   (after T6, T8, T10, T11)
T13 phase guide          (last)
```

Each task is one `feature/*` branch off `dev` with its own CI-gated PR, per §5.

---

## 2. The tasks

### T1 — Root config (D-E8, D-B1)

**Files:** `vite.config.js`, `vitest.config.ts`, `package.json`, lockfile,
`src/lib/python/version.ts` (new), `netlify.toml`.

1. `vite.config.js` gains `worker: { format: 'es' }`.
   **Verification is reading the emitted worker file in `build/`, not a green
   build** — the failure mode is a silent IIFE wrapper that passes every gate
   and breaks only when deployed. Also re-verify the existing
   `my_computer/sort.js` worker still functions, since this changes its emitted
   format too.
2. `pyodide` added as a **types-only devDependency** pinned to `0.28.3`.
   `src/lib/python/version.ts` exports `PYODIDE_VERSION`, and a unit test
   asserts it equals the installed package's version — so a drifted pin is a red
   test rather than a 404 on the deployed site.
3. vitest DOM environment: install `jsdom` and set `environment: 'jsdom'` for
   the terminal tests only (via a docblock), **rather than** excluding files
   from coverage. Rationale for gate 4 to attack: an exclusion would let the
   terminal core ship untested while still counting as "80% on changed lines";
   `jsdom` keeps the gate honest at the cost of one devDependency.
4. `netlify.toml`: `script-src` / `connect-src` scoped to the Pyodide origin;
   `Permissions-Policy: camera=(), microphone=(), geolocation=()`;
   `X-Robots-Tag: noindex` for `/html/*`.
5. **`npx -y npm@10 install` after every `package.json` edit** (CI runs npm 10;
   local is npm 11.6.2 / Node 25).

**Tests:** version-pin equality test; a build-output assertion that the emitted
worker is ESM and that no `.xterm-` rule appears in entry CSS; a check that the
Rollup "dynamically imported … also statically imported" warning is absent.

### T2 — jspaint hardening (D-C3) — *independent, ship first*

This closes a **live production hole**, verified by probing the deploy:
`/html/jspaint/{index.html,package.json,CNAME,src/imgur.js,CHANGELOG.md}` all
return 200, and `sessions.js` honours `#load:<url>` — fetching and rendering an
arbitrary attacker URL on the owner's domain.

**Files:** `scripts/prune-jspaint.sh` (new, committed),
`static/html/jspaint/index.html`, `src/routes/xp/programs/paint.svelte`,
`netlify.toml` (in T1).

1. Prune script removes, with a one-line comment each: the `imgur.js`,
   `speech-recognition.js` and `sessions.js` script tags; the `#news` block
   containing 12 `i.postimg.cc` images (`hidden` is `display:none`, which does
   **not** suppress image fetches, so every Paint open leaks the visitor's IP);
   and the File ▸ Upload To Imgur / Load From URL menu entries in `src/menus.js`.
2. Prune the tree to what `index.html` actually loads — drops `package.json`,
   `CNAME`, `CHANGELOG.md`, `cypress/`, `.map` files.
3. `paint.svelte` iframe gains `sandbox="allow-scripts allow-same-origin"`
   (Spike B: preserves `contentDocument`, blocks top-navigation and popups).

**Tests:** an e2e asserting Paint still opens, draws and Saves As after the
prune; a test asserting `#load:` no longer resolves; a build-output assertion
that the pruned files are absent from `build/`.
**Risk:** the prune breaks jspaint in a way e2e cannot see. Mitigation: the
script is a diff of removals only, each reviewable, and Paint's existing e2e
plus a manual draw/save pass on the deploy preview.

### T3 — Seed safety (D-D3) — **must land before T9**

Today `merge_on_reseed` carries only ids *absent* from the new seed
(`seed.ts:48`) and rebuilds from `{ ...seed }` (`seed.ts:65`), so every seed item
is replaced wholesale. Provenance carries user-*authored items*; it does nothing
for user *modifications to seed items*. Production went live 2026-08-23, so the
Phase 3 bump is the **first against real user data**.

**Files:** `src/lib/seed.ts`, `src/lib/seed.test.ts`.

Carry forward onto surviving seed items: `desktop_css_transform` (written by
`desktop_folder.svelte:158` onto the five desktop `.exe` items), `sort_option`,
`sort_order`, and `parent` when it equals the Recycle Bin id.

**Tests:** one per carried field, each written to **fail first** — revert the
carry and watch it go red. This is non-negotiable: three shipped occasions of
tests that could not fail.
**Open for gate 4:** is the carried-field list complete, or is there a sixth
user-owned field on seed items?

### T4 — App registry (D-E1, §6.3)

**Files:** `src/lib/app_registry.ts` (new), `src/lib/app_registry.test.ts`,
`src/routes/xp/work_space.svelte`.

`AppDefinition` per §6.3 (`id`, `title`, `icon`, `defaultSize`, `minSize`,
lazy `component`, `singleton`, `startMenu`). The three new apps register here;
the existing 20 branches are untouched (full migration is Phase 6). `launch()`
falls through to the registry, and its currently-absent `else` throws in dev and
logs in production — today a mistyped path is a **silent no-op**.

**Tests:** registry shape; every registered id resolves to a component;
the fallthrough throws on an unknown path.

### T5 — Shared terminal core (D-B3, D-A2, D-A9, D-E11)

**Files:** `src/lib/term/terminal.ts`, `readline.ts`, `theme.ts`, `ansi.ts`
+ tests.

- xterm construction, XP theme (D-V2: `#000000` bg, `#c0c0c0` fg, `#00ff00`
  prompt, 16-colour ANSI), font stack per D-V1.
- **Readline**: cursor, backspace, ←/→, Home/End, ↑/↓ history — and
  **bracketed-paste decoding (`ESC[200~`/`ESC[201~`)**, which v1 budgeted
  nothing for and which corrupts every multi-line paste if missed.
- **Sizing (D-A9)**: explicit container height, a `ResizeObserver` driving
  `fit()`, first `fit()` deferred one frame past the window's open transition.
  There is currently **zero `ResizeObserver` in `src/`** and `FitAddon.fit()`
  returns *silently* when the parent's computed height is `auto` — the symptom
  is a terminal frozen at 80×24 with no console error.
- **One `disposed` flag** gating the animation loop, the runtime message handler
  and every write path (D-A5), with teardown tearing down the runtime.
- **Keyboard (D-E11)**: bound on the xterm textarea only, never `svelte:window`,
  never `stopPropagation` at window level.

**Tests (jsdom):** readline edits incl. bracketed paste; disposed-flag gating;
theme/font constants. `terminal.open()` needs a DOM — this is what T1.3 buys.

### T6 — CMD (D-A1…A8, D-V1, D-V2)

**Files:** `src/lib/cmd/registry.ts`, `commands/*.ts`, `format.ts` + tests;
`src/routes/xp/programs/cmd.svelte`.

Pure `(args, profile) => string[]` commands. Data sources per the **corrected**
D-A4 table — `profile.meta` for contact/whoami, not `profile.about`, which holds
only `bio`. `whoami` is `profile.meta.shortName.toLowerCase()`, derived, because
§3.2 requires all output to come from JSON.

- Unknown command: **bash's `foo: command not found`**, case-sensitive
  (D-A8 reversed — §3.2 says "bash emulation, **not Windows cmd**" in bold).
- **Banner (D-A6):** third line becomes `Type 'about' to start, or 'projects' to
  see what I have built.` §3.2 gains a note that the filesystem line returns in
  Phase 6. Without this the app's first screen advertises `ls`, which answers
  "not available yet".
- `ls`/`cd`/`cat`/`pwd` are known commands answering `not available yet`.
- Easter eggs cancellable on any key, torn down on unmount.

**Tests:** one per command against a fixture profile; unknown-command wording;
egg cancellation across two back-to-back runs.

### T7 — Python sandbox host (D-B0)

**Files:** `static/html/python-sandbox.html` (new, thin bootstrap),
`src/lib/python/protocol.ts` (new, typed messages) + tests,
`src/lib/python/client.ts` (parent side) + tests.

Architecture, settled by Spike A:

```
parent (our origin)
  └─ <iframe sandbox="allow-scripts">  ← opaque origin: no IndexedDB, Origin: null
        └─ Worker(blob: URL)           ← thread isolation; loads Pyodide from CDN
```

The host page is a **thin bootstrap only**; the protocol, readline and
formatters live in tested `src/` modules on the parent side, because `static/`
is outside lint, tests and coverage.

Protocol: typed request/response messages (`eval`, `stdout`, `stderr`, `result`,
`error`, `ready`, `progress`). Streaming, not batched. `PyodideConsole` for
continuation (verified: returns `incomplete`/`complete`/`syntax-error`).

**Tests:** protocol encode/decode and exhaustive message-kind handling; client
state machine incl. the failure path.
**Verification that isolation actually holds** (exit criterion 2): an e2e that
runs Python attempting `indexedDB.open` and `fetch('/api/browse')` and asserts
both fail.

### T8 — Python REPL app (D-B1, D-B4, D-B6, D-B7, D-V3)

**Files:** `src/routes/xp/programs/python.svelte`.

Title derived from the runtime banner (not a literal), icon
`/images/xp/icons/Python.png` — **already in the shipped icon set and currently
unused**; the Start Menu passes the generic `ApplicationWindow.png` today.
Load UX: `Loading Python runtime…` → progress → real banner. Failure prints one
legible error and leaves the window closable. Ctrl+C terminates and respawns,
printing `Restarting Python… (session state cleared)` — it is a restart, not an
interrupt, because `SharedArrayBuffer` is unavailable (verified
`crossOriginIsolated: false`). `input()` prints a refusal.

**Tests:** e2e against a stubbed runtime (hermetic, per D-B5); a tagged
`@online` spec excluded from the default run for real execution; a CI check that
the pinned CDN URL returns 200.

### T9 — Music assets + seed (D-D2, D-D3)

**Files:** `scripts/gen-tracks.sh` (new), `static/audio/music/*.mp3`,
`src/lib/music/manifest.ts` + test, `scripts/vfs-base.json`, regenerated VFS.

Tracks are **broadband with real spectral movement** — layered harmonics, a
percussive transient track, a filtered noise sweep — because three pure tones
give the analyser a one-spike spectrum and make the visualizer look broken
(D-D2's coupling to D-D4). `gen-tracks.sh` is **documentation, not a CI gate**
(ffmpeg is not a declared dependency) — stated explicitly, since every other
generated artifact here *does* have a freshness gate.

Seed entries are `storage_type: 'remote'` pointing at the same static URLs, so
no bytes are duplicated. **`size` is in KB** (`types.ts:35`) — a byte-valued
entry renders `3,145,728 KB`. Track ids are **permanent**: carried items can
never be reaped, so a later rename persists in every returning visitor's
`My Music` forever.

The manifest is the single source of truth; `generate:vfs` **derives** the seed
entries from it rather than a second hand-maintained list.

**Tests:** manifest validation; a **new e2e for the KB-vs-adaptive divergence** —
these are the first >1 MB files in a visible folder, so §8's documented
"impossible" coverage gap is now free to close, and closing it protects
`size_label` vs `format_size` from the next reader who "unifies" them.

### T10 — Music Player (D-D1, D-D4, D-D5, D-D6, D-E12, D-V4)

**Files:** `src/lib/music/player.ts` (playlist model) + tests,
`src/routes/xp/programs/music_player.svelte`.

WMP 9 chrome (D-V4). Transport, volume (× `$systemVolume`, per MPC's shipped
rule), seek, track list, Canvas visualizer.

Three verified footguns, each an explicit wiring step with a test:
- **`createMediaElementSource()` is a permanent one-shot binding on the
  element** — a second call throws `InvalidStateError` *even from a different
  `AudioContext`*. So play → pause → play throws. Cache one node per element in
  a `WeakMap`.
- **`resume()` is called synchronously first** inside the click handler;
  `await ctx.resume()` outside a user gesture **never settles**.
- **A CORS-cross-origin element outputs silence** into the graph — playback
  works, the analyser reads zeros. The phase guide's "drop in your own MP3s"
  instruction must say *local files only*.

`.mp3` keeps opening MPC; Music Player is the **second** `doctypes['.mp3']`
entry. Also fix **`CMFSItem.ts:49`**, the only one of five `doctypes` lookups
missing `.toLowerCase()` — instance #8 of the repo's recurring root cause, made
user-visible by the second handler. Add the `.mp3` row to
`profile.json → folderOptions.fileTypes` (asserted by `xp_chrome_a.spec.ts:151`).

**Known gate blindness:** headless Chromium ignores the autoplay policy
(`new AudioContext().state === "running"`), so CI **cannot** catch a regression
moving context creation back to `onMount`. This becomes a manual gate-6
deploy-probe line.

### T11 — Paint verification (D-C1, D-C2, D-V5)

Confirm §3.2's tool set and menus after T2's prune; confirm Save As into the
VFS; screenshot the chrome. **Paint's interior is explicitly not parity-scored**
— it runs jspaint's `classic.css` (`paint.svelte:241`), which is Win98-ish, and
pretending to score it produces a fake number. Recorded as a documented
deviation.

### T12 — Parity references and the visual loop (D-V5, §11)

Capture the references that do not exist today —
`design/research/ref-wmp9.png` and XP Command Prompt chrome — **before**
iterating. Then the §11 loop at 1280×800 to ≥95% on: CMD chrome, Python chrome,
Music Player, Paint chrome.

### T13 — `docs/phase-3-guide.md` (§11 handoff structure)

Ten sections per §11, including: required assets (how to swap the generated
tracks, **local files only**), the jsDelivr privacy disclosure (~5 MB and the
visitor's IP/UA per cold open), the Pyodide pin and that **§3.2's "3.13.x" is a
consequence of pinning 0.28.3** — `latest` is 314.0.5 / Python 3.14.2 — the
manual deploy-probe lines CI cannot cover, and the two known limitations
(Paint's unscored interior; ≥1024px touch devices).

---

## 3. Test strategy

- **Unit (vitest)**: every `.ts` module — command registry and formatters,
  readline, ANSI, protocol, client state machine, playlist model, manifest,
  seed carry. jsdom only where a DOM is genuinely required (T5).
- **E2E (Playwright)**: app open/close, command output, REPL shell against a
  stubbed runtime, isolation assertions, music transport, Paint after prune,
  the KB-vs-adaptive divergence. Hermetic — no new spec reaches the internet.
- **`@online` project**: excluded from the default run; real Pyodide execution.
- **Mutation discipline**: every new test is shown to fail against the un-fixed
  code before it counts. Three shipped occasions of tests that could not fail.
- **Before every push**: `npm run check && lint && format:check && vitest
  --coverage && diff-cover --fail-under 80 && build && playwright test`.
- **Deploy probe** (the rule that caught two holes nothing else did): after
  deploy — Python isolation, the emitted worker is ESM, jspaint's pruned paths
  404, the autoplay path works on a real browser gesture.

## 4. Risks

| Risk | Mitigation |
| --- | --- |
| `worker.format` change breaks the shipped `sort.js` worker | Verify by reading emitted output and re-running Explorer sort e2e |
| jspaint prune breaks Paint invisibly | Removals-only diff; existing e2e + manual draw/save on a deploy preview |
| Seed carry list incomplete | Gate 4 is asked directly; each field gets a fail-first test |
| Blob-worker inside a sandboxed frame behaves differently under Netlify's headers | Deploy-probe line; CSP is set in T1 before T7 ships |
| Playwright interception must be re-proved for the frame+blob-worker context | T7 opens by re-proving it; fallback is a stub-worker build flag |
| E2E flake budget | New specs use `bootToDesktop`; no new full-boot specs |
| Pinning 0.28.3 ships two ABI generations behind | Documented as a consequence of §3.2's "3.13.x"; bump is a Phase 6 decision |

## 5. What gate 4 should attack

Whether T3's carried-field list is complete. Whether T4's two coexisting wiring
mechanisms are worse than the if-chain they partially replace. Whether T1.3's
`jsdom` choice is right versus a coverage exclusion. Whether the T7 architecture
survives Netlify's CSP and `X-Frame-Options: SAMEORIGIN`. Whether T2's prune is
reviewable enough to be safe. Whether the ordering has a missed dependency —
especially anything that bumps the seed before T3 lands. And whether T12's
parity references can actually be captured, or whether the phase is planning to
measure against images that will not exist.
