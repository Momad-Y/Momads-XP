# Phase 3 spec — Developer & Interactive Apps (v2)

> Gate 1 of the §11 six-gate workflow, **revised after gate 2**. The red team's
> findings and my disposition on each are in `docs/phase-3-redteam-spec.md`;
> v1 is commit `adb14ec`. Source scope: `SPECIFICATION.md` §3.2 and §9 Phase 3.

## 0. What changed from v1, and why

Gate 2 returned 2 CRITICAL, 12 HIGH and ~15 MEDIUM findings, 15 missing
sub-decisions and 11 scope gaps. Five claims v1 made about the codebase were
false. One finding was rejected with a concrete counter. The four structural
changes:

1. **Python is isolated on an opaque origin (new D-B0).** v1's worker reasoned
   only about hangs; a plain worker inherits our origin and hands user-typed
   Python the VFS in IndexedDB and both API endpoints.
2. **Apps are wired through a registry (D-E1), per `SPECIFICATION.md` §6.3** —
   which v1 contradicted without citing. The real call-site count is 12, not 5,
   and `launch()` has no `else`, so a mistyped path is a silent no-op.
3. **Root config work is up-front (new D-E8).** Vite emits workers as IIFE by
   default; the Pyodide worker would have shipped broken past every green gate
   and failed only on the deployed site.
4. **A visual-decisions block exists (new §3).** v1 deliberated 25 engineering
   decisions and zero visual ones against an exit criterion demanding ≥95%
   parity on four surfaces, two of which have no reference anywhere in `design/`.

---

## 1. Scope

Four apps, all Start-Menu-only (§3.5 caps the desktop at five icons and names
these four as Start-Menu-only), plus the hardening and config work gate 2
attached to them.

| App | State today | Phase 3 delivers |
| --- | --- | --- |
| CMD | `placeholder_entry` → `placeholder.svelte` | xterm.js terminal, 15 commands, 3 easter eggs |
| Python REPL | `placeholder_entry` → `placeholder.svelte` | Pyodide CPython on an **opaque origin**, real banner, real execution |
| Paint | `paint.svelte` frames bundled jspaint; Save As + `doctypes` already wired | Hardening (D-C3), parity, gap verification — **not** a rebuild |
| Music Player | Start-menu label points at inherited MPC | New WMP-styled app: track list, transport, volume, seek, Canvas visualizer |

Also in scope, because Phase 3 is the phase that blesses or breaks them:

- **jspaint hardening** (D-C3) — a live `#load:<url>` primitive on the
  production domain, an Imgur upload path, 12 third-party image fetches per
  open, and a frame with no `sandbox`. Verified on production, pre-existing.
- **Root config** (D-E8) — `vite.config.js` worker format, vitest DOM
  environment, `pyodide` types-only devDependency.
- **App registry** (D-E1) — §6.3's `appRegistry.ts`, replacing the 20-branch
  if-chain for the three new apps and making a missing entry a type error.

### Exit criteria

1. Start ▸ All Programs ▸ Command Prompt opens a terminal titled `momad@xp:~`,
   prints the intro (see D-A6 — §3.2's third line is amended for Phase 3), and
   every command in §3.2's Phase-3 list outputs data read from `profile.json`.
2. Start ▸ All Programs ▸ Python opens a REPL that prints the real banner from
   the running Pyodide, evaluates arbitrary expressions, shows the pre-loaded
   greeting, and **runs on an opaque origin** — proven by a test that asserts
   Python cannot read the VFS or reach `/api/*`.
3. Start ▸ All Programs ▸ Paint opens jspaint in XP chrome; File ▸ Save As
   writes a PNG into the VFS; §3.2's tool set is present; D-C3's hardening is
   verified **on the deployed site**, not just locally.
4. Start ▸ All Programs ▸ Music Player plays bundled tracks with working
   play/pause, next/prev, volume, seek, track list and a live visualizer that
   shows real spectral movement.
5. §11 visual parity ≥95% against the references fixed in §3 below — **each
   surface has a named reference before implementation starts**.
6. Full gate chain green; `docs/phase-3-guide.md` written.

### Explicitly OUT of scope

- `ls`/`cd`/`cat`/`pwd` — §3.2 assigns them to Phase 6 by name (D-A6).
- Spotify embed mode — §3.2 marks it stretch.
- `input()` in the REPL (D-B7). Games, AI chatbot, SFX polish — Phases 4–6.
- A custom Canvas Paint (D-C1).

---

## 2. Corrections to false claims v1 made

Recorded so they are not re-introduced:

| v1 claimed | Truth |
| --- | --- |
| `contact` reads `profile.about` contact fields | `about` has exactly one key, `bio`. Contact data is in `profile.meta` |
| Only My Computer and IE have `.exe` entries | The shipped seed gives Desktop **five** `.exe` children |
| `start_menu.spec.ts` is the e2e that breaks | It asserts labels only. **`e2e/shell.spec.ts`** breaks — 2 tests, one of them the sole coverage of the 24px cascade rule |
| Adding an app touches five call sites | Twelve (D-E1) |
| xterm.js is ~250 KB gzipped | ~89 KB total, measured on the published tarball |
| Portrait mobile gets a cramped terminal | §4.6 renders a static page with no windows and forbids loading xterm.js at all |

---

## 3. Visual decisions (new — gate 2's highest-leverage finding)

Exit criterion 5 demands ≥95% parity. `design/` holds icons but **no screenshot
reference for a terminal, a Python REPL or a media player**; §3.2 specifies CMD
as a *Linux-style* terminal, which Windows XP never had; and `paint.svelte:241`
runs jspaint's `classic.css`, so Paint's target was undefined. Each surface now
gets a named reference *before* code is written.

### D-V1 — Terminal font

§10 assigns **Lucida Console** to "CMD terminal, monospace contexts". It does
not exist on Linux or Android, and xterm.js defaults to
`courier-new, courier, monospace`.

*Option 1 — declare the §10 stack with fallbacks* (`'Lucida Console', 'DejaVu
Sans Mono', 'Consolas', monospace`). **For:** honours §10 where the font exists
(Windows/macOS), degrades to a metrically similar mono elsewhere; zero bytes.
**Against:** the rendered surface differs by platform, so parity screenshots are
platform-dependent — they must be taken on one fixed platform.
*Option 2 — bundle a webfont.* **For:** identical everywhere. **Against:** §10
lists Lucida Console as "Web-safe", i.e. deliberately not bundled; adds weight
for one app; licensing for Lucida Console is not ours to grant.

**Verdict: option 1**, and parity screenshots are taken on the CI/dev Linux box
so the measured surface is the DejaVu fallback. Deciding factor: §10 already
chose "web-safe", and bundling a font we cannot license is not available.

### D-V2 — Terminal colour scheme

§3.2 says "black background, white/green monospace text" without choosing.
**Verdict:** black `#000000` background, `#c0c0c0` default foreground (XP
console grey-white), `#00ff00` for the prompt and the `matrix` egg, XP's
16-colour ANSI palette for everything else. Deciding factor: "white/green" is
satisfied by grey-white body text with a green prompt, which is what a
bash-style prompt actually looks like, and a full ANSI palette is required
anyway by Pyodide's coloured tracebacks (D-B6). **Against, accepted:** pure
`#ffffff` would be brighter than XP's console; grey-white is the faithful choice.

### D-V3 — Python branding

§3.2 requires "Python branding" and v1 decided nothing.
**Verdict:** title `Python 3.13 — Momad's XP`, icon
`/images/xp/icons/Python.png` (**exists in the shipped icon set and is
currently unused**; `start_menu.svelte:132` passes the generic
`ApplicationWindow.png`), prompt `>>>` in Python-blue `#3572A5`, otherwise
identical to CMD's chrome. Deciding factor: the correct icon is already in the
repo, so the only reason v1's generic icon survived was that nobody looked.
**Against, accepted:** the title hardcodes `3.13`, which D-B1's pin makes true
today — the plan derives it from the runtime banner instead of a literal.

### D-V4 — Media player: WMP or Winamp, and which generation

§3.2 offers either and v1 asserted "WMP-styled" with no deliberation.

*Option 1 — Windows Media Player 9 (the XP-era default).* **For:** it is what
shipped *with* XP, so it is the period-correct choice and sits naturally beside
the rest of the desktop; `WindowsMediaPlayer9.png` ships in the icon set;
abundant reference screenshots exist. **Against:** WMP9's real chrome is a
skinned, rounded, blue-gradient shell that is a large amount of custom CSS to
reach ≥95%.
*Option 2 — Winamp 2.x classic.* **For:** iconic, and its fixed 275×116 skin is
far simpler to reproduce faithfully; the visualizer is native to its design.
**Against:** it is not a Windows XP surface — it is a third-party app of the
era, so it weakens the "this is XP" illusion; no icon in the set.
*Option 3 — WMP10.* **For:** more capable. **Against:** WMP10 shipped after XP
RTM as a separate download; less period-correct than 9.

**Verdict: WMP 9**, reference `design/research/ref-wmp9.png` (to be captured at
gate 3 before implementation). Deciding factor: it is the only option that both
shipped with XP and has an icon already in the repo, and §3.2 lists Windows
Media Player first. **Against, accepted:** more custom CSS than Winamp would
need; the plan budgets the skin as its own task.

### D-V5 — Parity references, per surface

| Surface | Reference | Why |
| --- | --- | --- |
| CMD | XP Command Prompt window chrome + a real bash session for the content area | §3.2 asks for XP chrome around a Linux-style terminal; the chrome is the part XP defines and the part parity can score |
| Python REPL | Same chrome as CMD; content scored against a real CPython REPL transcript | The window is the XP surface; the transcript is correctness, not parity |
| Paint | `design/research/gate-07-paint.png` (already captured) + real XP Paint for the chrome | jspaint's interior runs `classic.css` and is **not** scored against XP Paint's interior — recorded as a documented deviation, not a silent one |
| Music Player | `design/research/ref-wmp9.png` | D-V4 |

**Verdict:** parity is scored on **the XP window chrome and the app's own
layout**, not on the interior of a vendored bundle we do not control.
Deciding factor: §11's own standard distinguishes inherited surfaces ("do not
regress") from new ones ("compare against the closest reference") — jspaint's
interior is neither, and pretending to score it produces a fake number.
**Against, accepted:** Paint's interior gets no parity figure; the phase guide
states this explicitly rather than reporting a score that was never measured.

---

## 4. Sub-decisions

Unchanged from v1 unless marked. Full for-and-against per
`decision-presentation.md`; the two documented exceptions are labelled.

### D-B0 — Python isolation architecture **(NEW — resolves both CRITICALs)**

v1's D-B2 chose a Web Worker reasoning only about hangs. A dedicated worker
inherits the creating document's origin, so Python typed by a visitor gets:
`js.fetch("/api/browse")` with a genuine `Sec-Fetch-Site: same-origin` (the
header §5 calls unforgeable origin proof), `/api/email` with a valid `Origin`
and a bypassable `too_fast` check, and **`indexedDB`, which is exposed in
workers and holds the entire VFS**. Reachable by a pasted snippet or by a bad
byte on the CDN, which has no integrity control either (`importScripts` accepts
no `integrity`; Pyodide fetches its own payload from `indexURL` afterwards).

*Option 1 — plain dedicated worker (v1).* **For:** simplest; solves hangs.
**Against:** full same-origin authority for arbitrary user code. Not viable.
*Option 2 — opaque-origin sandboxed iframe hosting the runtime.* **For:** it is
this project's own shipped pattern (§5: the IE frame is sandboxed **without**
`allow-same-origin`); on an opaque origin there is no IndexedDB of ours, no
cookies, and fetches present `Origin: null` / `Sec-Fetch-Site: cross-site`,
which both endpoints already reject; it simultaneously caps the CDN-compromise
blast radius; and because the host page lives in `static/`, Vite never processes
it — which sidesteps D-E8's worker-format trap entirely. **Against:** an extra
`postMessage` hop; code in `static/` is outside lint/test/coverage; and whether
the runtime also needs a worker *inside* the frame for thread isolation depends
on whether the browser gives a sandboxed frame its own event loop — which is
not guaranteed by spec.
*Option 3 — self-host Pyodide and keep the plain worker.* **For:** removes the
CDN supply-chain half. **Against:** does nothing about C1 — user-typed Python
still runs with our origin's authority. Solves the smaller problem.

**Verdict: option 2 — the runtime is isolated on an opaque origin.** Deciding
factor: it is the only option that addresses the actual threat (arbitrary user
code with our origin's authority), and it is a pattern already shipped and
reviewed in this codebase rather than an invention.

**Against, accepted, and how each is handled:**
- *Thread isolation is not guaranteed by the sandbox alone.* **Gate 3 opens with
  a spike** that measures whether an infinite loop in the sandboxed frame blocks
  the parent. If it does, a worker is created *inside* the frame from a
  `blob:` URL (blob URLs inherit the creating context's opaque origin, so the
  worker is same-origin with the frame). The spike decides; the fallback is
  written down now so it is not invented under pressure.
- *`static/` code is untested.* The host page is a thin bootstrap only; the
  protocol, the readline and every formatter live in tested `src/` modules on
  the parent side.
- *The interception result must be re-confirmed.* Playwright's ability to stub
  the CDN was verified for a dedicated worker; whichever context D-B0's spike
  lands on, D-B5's stub is re-proved against it before the plan locks.

### D-B1 — Pyodide delivery **(REVISED)**

v1 rejected the npm package by conflating "npm package" with "CDN `indexURL`":
its data files *can* be emitted into `build/` and served same-origin, so the
rejection's stated reason was wrong. And the repo's lint config makes the
rejection expensive: `eslint.config.js:29-32` applies `strictTypeChecked` with
`no-explicit-any` and `no-unsafe-type-assertion` as errors, and a dynamic
`import(CDN_URL)` is `any` all the way down. The `.d.ts` files live only in the
package v1 rejected.

**Verdict: CDN at runtime, pinned to an exact version, PLUS `pyodide` as a
types-only devDependency**, with a unit test asserting the CDN version constant
equals the devDependency's version. Deciding factor: it is the only combination
that satisfies §3.2's size reasoning *and* the lint gate, and the version
assertion converts "the pin drifted from the types" from a silent class of bug
into a red test.

**Version pin.** Verified against the live registry and each build's own
`pyodide-lock.json`: `latest` is **314.0.5 → Python 3.14.2**; **0.28.3 → Python
3.13.2**. `v314.0.5/full/pyodide.asm.js` 404s (renamed `.mjs`) and classic
workers are gone in 314.x. **Pin 0.28.3**, because §3.2 and exit criterion 2
specify a `3.13.x` banner. The spec records that **§3.2's "3.13.x" is a
consequence of this pin, not an independent requirement** — a later bump to
314.x changes the banner, the asset filenames and the worker contract, so "a
bump is one edit" is false and is not claimed.

**Integrity/privacy posture, recorded rather than defaulted:** SRI is not
available (`importScripts` takes no `integrity`, and the runtime fetches its own
payload afterwards), so the blast radius is capped by D-B0's opaque origin
instead. `netlify.toml` gains `connect-src` / `script-src` entries scoped to the
Pyodide origin. The phase guide discloses that opening Python sends ~5 MB from
jsDelivr and reveals the visitor's IP and UA to it.

### D-B2 — Hang isolation **(SUPERSEDED by D-B0)**

The verdict (do not run Pyodide on the main thread) stands; the mechanism is now
D-B0's. Recorded correction: terminate-and-respawn **destroys every variable the
visitor defined**, so it is a restart, not an interrupt, and the UI says
`Restarting Python… (session state cleared)`. `setInterruptBuffer` is genuinely
unavailable — verified `crossOriginIsolated: false`, so `SharedArrayBuffer`
throws — so a true interrupt is not on the table at any price.

### D-B5 — E2E strategy **(REVISED)**

v1 offered a false trichotomy and described two mechanisms in one breath
("route-stub the CDN" *and* "against a fake worker"), which are mutually
exclusive. A fourth option exists and is standard Playwright.

**Verdict:** the default suite is hermetic and uses **one** mechanism —
`page.route` stubs the runtime origin (verified to intercept `fetch()` and
dynamic `import()` from inside a dedicated worker on the pinned Playwright
1.61.1; re-proved against whatever context D-B0's spike selects). Real execution
is covered by a **tagged `@online` Playwright project excluded from the default
run**, plus a cheap CI check that the pinned URL returns 200. Deciding factor:
v1's option 3 left the spec's own stated risk ("a bad pin is a dead app with no
local test that would catch it") permanently true; a URL check is three lines
and closes it. **Against, accepted:** the `@online` project is only run
deliberately; the phase guide names when.

### D-B7 — `input()` **(REASONING REWRITTEN)**

The verdict (defer) stands; v1's deciding factor was false. JSPI (`run_sync`)
gives blocking `input()` with **no** `SharedArrayBuffer` and **no** COOP/COEP;
it landed in Pyodide 0.25 and is auto-detected. The honest reasoning: JSPI is
experimental and **absent from Safari stable**, so it cannot carry a
user-facing feature in Phase 3. This correction matters beyond this decision —
v1's "input() ⇒ COOP/COEP ⇒ breaks Phase 4" would have been carried forward as
settled fact. `input()` prints a clear refusal; verified that with no stdin
handler it *raises* rather than hanging, so the refusal is a message, not a
rescue from deadlock.

### D-A6 — Deferred filesystem commands **(REVISED — resolves the banner conflict)**

Both lenses caught what v1 missed: exit criterion 1 required printing §3.2's
intro **verbatim**, and its third line is `Navigate my portfolio like a
filesystem — try 'ls' or 'cd experience'.` — advertising the two commands v1
deferred. The visitor's first interaction with the flagship developer app would
be a dead end the app pointed them at.

*Option 1 — pull `ls`/`cd`/`cat`/`pwd` forward.* **For:** the banner becomes
true. **Against:** a scope change at gate 1, and it needs the POSIX-ish path
model Phase 6 owns.
*Option 2 — keep the banner, keep the stubs.* **For:** no spec edit. **Against:**
ships a self-contradicting first screen.
*Option 3 — amend the banner's third line for Phase 3 and restore it in Phase 6.*
**For:** ~1 line; the banner stops lying; Phase 6's scope is untouched.
**Against:** edits `SPECIFICATION.md`'s fixed copy, so exit criterion 1 can no
longer say "verbatim".

**Verdict: option 3.** Phase 3's third line becomes `Type 'about' to start, or
'projects' to see what I have built.`; §3.2 gains a note that the
filesystem-navigation line returns with the Phase 6 commands. `ls`/`cd`/`cat`/
`pwd` remain *known* commands answering `not available yet — filesystem
navigation lands in a later update`. Deciding factor: it is the only option that
makes the shipped app self-consistent without moving Phase 6's work.
**Against, accepted:** a spec-copy edit and a weaker exit criterion — both
recorded here rather than discovered at gate 6.

### D-A8 — Unknown commands **(REVERSED)**

v1 chose cmd.exe's `'foo' is not recognized as an internal or external
command.` for the joke, overriding §3.2 line 1 — "Linux-style terminal (**bash
emulation, not Windows cmd**)" — with taste, and recorded the deviation nowhere.
**Verdict reversed:** bash's `momad@xp:~$ foo: command not found`, and lookup
is **case-sensitive**, as bash is. Deciding factor: §3.2 states the intent in
bold and v1 had no argument against it beyond preference; a spec directive
beats a joke. **Against, accepted:** the cmd.exe string is funnier to a Windows
audience; the window is still titled Command Prompt in the Start Menu, which is
where that joke already lives.

### D-A4 — Command data sources **(CORRECTED)**

v1's mapping was factually wrong. Verified: `profile.about` has exactly one key,
`bio`; name, title, location, email, avatar and resume live in `profile.meta`.

| Command | Source |
| --- | --- |
| `about` | `profile.about.bio` |
| `skills` | `profile.skills` |
| `experience` | `profile.experience` |
| `projects` | `profile.projects` |
| `contact` | `profile.meta.email`, `profile.meta.location` + `profile.social` |
| `social` | `profile.social` |
| `whoami` | `profile.meta.shortName.toLowerCase()` |
| `uname -a` | `profile.systemProperties` + fixed XP strings |

`whoami` is **derived, not literal** — v1's literal `momad` contradicted D-A4's
own preamble and §3.2's "All command output data sourced from JSON".
Formatters return `string[]`; the ≤72-column rule is now owned together with the
minimum window width in D-E11 rather than orphaned between two decisions.

### D-A2 — Readline **(REASONING CORRECTED, verdict stands)**

v1's deciding factor ("the only unit-testable option") was false and post-hoc.
The honest one is D-B3's: Python needs continuation and interrupt semantics no
generic readline addon exposes, so a shared addon would need forking anyway.
**Newly budgeted:** xterm enables **bracketed paste**, so the readline must
decode `ESC[200~` / `ESC[201~` or every multi-line paste corrupts the buffer —
v1 budgeted nothing for it.

### D-A5 — Easter eggs **(EXTENDED)**

Verdict stands (cancellable, teardown on unmount). v1's latch covered the
animations and forgot the runtime: a `print()` chunk arriving after the window
closes writes into a disposed xterm and throws asynchronously into no handler.
**One `disposed` flag owned by the shared core gates the animation loop, the
runtime's message handler and every write path**, and teardown tears down the
runtime. Tested both ways: two animations back to back (the `rename_cancelled`
shape), and close-during-execution.

### D-A1, D-A3, D-B3, D-B4, D-B6 — unchanged

Corrections only: xterm.js is **~89 KB gzipped total**, not ~250 KB (measured),
which strengthens D-A1 since weight was its only "against"; the package is
`@xterm/xterm` (`xterm` is deprecated) and `addon-fit` reaches into
`terminal._core._renderService`, so both are pinned exactly. D-B6 verified
correct: `PyodideConsole().push()` returns `incomplete` / `complete` /
`syntax-error` as claimed, unchanged across 0.28 → 314.x.

### D-A9 — Terminal sizing **(NEW)**

Verified: there is **zero `ResizeObserver` anywhere in `src/`**, and
`Window.svelte`'s jQuery-UI resizing reports to nothing — so nothing would ever
call `fit()`. Worse, `FitAddon.fit()` returns silently when the parent's
computed height is `auto` (`parseInt("auto")` → `NaN`), which is exactly what a
flex child without an explicit height gives. Symptom: a terminal frozen at 80×24
inside a 700×500 window, clipped, with no console error.
**Verdict:** the terminal container gets an explicit height, a `ResizeObserver`
drives `fit()`, and the first `fit()` is deferred a frame past the window's open
transition. Deciding factor: without this the app is broken on first open in a
way that produces no error to debug from. **Against, accepted:** the first
`ResizeObserver` in the codebase; it is scoped to the terminal component.

### D-C1 — Paint **(REVISED — a third option v1 omitted)**

Verdict (do not rebuild Paint) stands, but v1's option set was incomplete: §9
Phase 0's own exit criteria name **"jspaint alone is 45MB; *optionally slim its
dist further*"**, which answers the only genuine "against" at a fraction of a
rebuild's cost. And v1 scheduled its check (d) — "confirm jspaint ships no
network calls" — to run *after* locking the verdict. It has now run and
falsified the premise (D-C3).
**Verdict: keep jspaint, slim the dist, and harden it (D-C3).** The rebuild
option remains rejected: it spends the phase's largest budget to ship fewer
features than are already deployed.

### D-C2 — Where gaps get closed **(REVISED)**

v1 said gaps are closed in our wrapper, never the vendored bundle. That is
impossible for the gaps that matter: the wrapper only overrides `systemHooks`
and toggles pointer-events, so it **cannot** remove a jspaint menu item — and
Upload-To-Imgur and Load-From-URL are menu items.
**Verdict: a committed prune script may delete script tags and menu entries from
the vendored bundle; it may not patch jspaint's logic.** Deciding factor:
removing a capability is a reviewable one-line diff and is not the
unmaintainable "forked vendor" v1 was guarding against; patching behaviour is.
**Against, accepted:** the vendored tree is no longer pristine upstream; the
prune script documents exactly what was removed and why.

### D-C3 — jspaint hardening **(NEW)**

Verified on the **live production site**: `/html/jspaint/index.html`,
`package.json`, `CNAME`, `src/imgur.js` and `CHANGELOG.md` all return 200. The
tree is directly linkable, and `sessions.js:505-556` honours `#load:<url>` —
fetching and rendering an arbitrary attacker URL on the owner's domain — and
`#session:<id>` (Firebase, hardcoded key). `index.html` loads `imgur.js`
(hardcoded Imgur client ID, live as File ▸ Upload To Imgur),
`speech-recognition.js` (audio to Google) and `sessions.js`, and embeds **12**
`i.postimg.cc` images in a `hidden` div — `hidden` is `display:none`, which does
not suppress image fetches, so every Paint open leaks the visitor's IP to a
third party. `paint.svelte:331-343` sets **no `sandbox` and no `allow`**.

**Verdict:** prune `imgur.js`, `speech-recognition.js`, `sessions.js` and the
`i.postimg.cc` news block from the vendored `index.html` via a committed script;
prune the tree to the files `index.html` actually loads; add `sandbox` and a
`Permissions-Policy` denying camera/microphone/geolocation; add
`X-Robots-Tag: noindex` for `/html/*`. Deciding factor: this is a live
phishing-grade primitive on the owner's production domain, and Phase 3 is the
phase that blesses the bundle carrying it. **Against, accepted:** removing
`sessions.js` also removes jspaint's multi-user and session-restore features,
which this embed never exposed; and `sandbox` must be verified not to break
`contentDocument` access, which `netlify.toml` documents Paint depends on —
that verification is a gate-3 spike, and if `sandbox` breaks it, the prune
alone still closes the two data paths.

### D-D2 — Music assets **(REVISED)**

Verdict (generate locally, commit, document the swap) stands; v1's "against"
was about taste and missed the coupling to D-D4. Three pure ffmpeg tones give an
`AnalyserNode` a one- or two-spike spectrum — the visualizer, an explicit §3.2
feature and an exit criterion, would look **broken**, not thin.
**Verdict:** the generator produces **broadband material with real spectral
movement** — layered harmonics, a percussive transient track and a filtered
noise sweep — so the analyser has something to draw. Deciding factor: the music
exists to make the visualizer demonstrable; content that defeats it fails the
only reason it is there. Also recorded: `scripts/gen-tracks.sh` is
**documentation, not a CI gate** — unlike every other generated artifact in this
repo, which has a freshness check — because ffmpeg is not a declared dependency.

### D-D3 — Track location **(REVISED — the real risk named)**

Verdict ("both": `static/` is the source of truth, the same files seeded into
`My Music` as remote-URL entries) stands, but v1 asserted the seed's
carry-by-provenance rule handles the migration. **It does not.** Traced:
`seed.ts:48` selects only ids *absent* from the new seed, and `seed.ts:65` is
`const result = { ...seed }` — every seed id is replaced wholesale. Provenance
carries user-**authored items**; it says nothing about user **modifications to
seed items**. So on the bump, a returning visitor loses: all five desktop icon
positions (`desktop_folder.svelte:158` writes `desktop_css_transform` onto those
seed items), per-folder sort settings, and renames — and recycled seed items
return, since the desktop `.exe`s and the 11 wallpapers are not in
`protected_items`. Production went live 2026-08-23, so this is the **first**
bump against real user data.

**Verdict:** `merge_on_reseed` gains a named set of user-owned mutable fields
carried forward onto surviving seed items — `desktop_css_transform`,
`sort_option`, `sort_order`, and `parent` when it equals the Recycle Bin — each
with a unit test that reverts the carry and goes red. Deciding factor: v1 spent
this migration's budget on a feature while claiming a safety property that does
not exist; the fix is small and the alternative is silently resetting shipped
users' desktops.
**Also recorded, and genuinely one-way:** carried items can never be reaped, so
a track renamed in a later phase persists in every returning visitor's
`My Music` forever. Track ids are therefore fixed now and treated as permanent.
**Units:** `VfsItem.size` is **KB** (`types.ts:35`); the wallpaper entries prove
the convention. A byte-valued seed entry would render `3,145,728 KB`.
**And a bonus:** these are the first >1 MB files in a *visible* folder, which
makes `3,072 KB` (Details) sit beside `3.00 MB` (status bar) on a shipped
surface for the first time. §8 rule 1 records that divergence as XP's two
different rules and warns the next reader will "unify" them. The phase adds the
E2E §8 called impossible — it is now free — converting a documented gap into
coverage instead of a regression.

### D-D4 — Visualizer **(EXTENDED with three verified footguns)**

Verdict (AnalyserNode + Canvas, context created on the first user gesture)
stands. v1 named the routing footgun; the sharper ones are:
- **`createMediaElementSource()` is a permanent one-shot binding on the
  element.** A second call throws `InvalidStateError` **even from a different
  `AudioContext`** — the check is on the element. So play → pause → play throws.
  Cache one source node per element in a `WeakMap`.
- **A CORS-cross-origin element must output silence** into the graph. Playback
  still works; the analyser reads zeros. This matters because the phase guide
  tells the owner how to swap in his own tracks — a remote URL there kills the
  visualizer with nothing but a console warning.
- **`await ctx.resume()` outside a user gesture never settles** — the promise
  neither resolves nor rejects. `resume()` is called synchronously first thing
  inside the click handler, before any other `await`.
**And the gate cannot catch it:** headless Chromium ignores the autoplay policy
— `new AudioContext().state` is `"running"` — so a regression moving context
creation back to `onMount` passes CI and fails for every real visitor. Recorded
as a manual gate-6 deploy-probe line.

### D-D6 — MPC boundary **(EXTENDED)**

Verdict stands (`.mp3` keeps opening MPC; Music Player is the second
`doctypes['.mp3']` entry). Three corrections:
- **`CMFSItem.ts:49` reads `doctypes[item.ext]` with no `.toLowerCase()`** —
  alone among five call sites. Harmless today; the second handler makes it
  user-visible. Fixed here; instance #8 of the recurring root cause.
- The second handler surfaces on **one** path only: `CMFSItem.ts:73-76` renders
  Open With at `length >= 2`, but `viewer.svelte:393`,
  `desktop_folder.svelte:236` and `favorites.ts:52` all take `[0]`, so File ▸
  Open never shows it. Given §1b's "no dead entries" standard the guide says so.
- `profile.json → folderOptions.fileTypes` is a hand-written list rendered by
  `folder_options.svelte:99-111` and asserted by `xp_chrome_a.spec.ts:151`; a
  new association without a row there makes a shipped surface contradict itself.

### D-D5, D-D1 — unchanged

Recorded addition to D-D1: MPC **already ships a visualizer**
(`media_player_classic.svelte:342`, `/html/visualizers/{1..12}.html`), so the
product will have two. D-E12 arbitrates.

### D-E1 — App wiring **(REPLACED)**

v1 answered a 20-branch if-chain — the source of seven wiring defects — by
adding three more branches and writing a checklist, against a spec section it
never cited. `SPECIFICATION.md` **§6.3 mandates a central `appRegistry.ts`**
with exactly the fields at issue (`singleton`, `minSize`, `desktopIcon`,
`startMenu`, lazy `component`). And `launch()` has **no `else`**, so a mistyped
path is a silent no-op — no window, no error, no failing test.

*Option 1 — extend the if-chain (v1).* **For:** no refactor of shipped code.
**Against:** contradicts §6.3; keeps the silent-no-op trap; makes the checklist
the only defence, and v1's checklist was provably wrong at gate 1.
*Option 2 — full migration of all 20 programs to §6.3's registry.* **For:**
one shape everywhere. **Against:** a 20-program refactor inside a feature phase,
touching every shipped launch path — a regression surface far larger than the
feature.
*Option 3 — introduce the registry, register the three new apps through it, and
route the if-chain's fallthrough into it.* **For:** satisfies §6.3; new apps get
`singleton` and `minSize` declaratively; a missing entry becomes a type error;
existing programs are untouched. **Against:** two mechanisms coexist until a
later phase finishes the migration.

**Verdict: option 3**, plus an `else` on `launch()` that throws in dev and logs
in production. Deciding factor: it is the only option that both honours §6.3 and
keeps the blast radius inside Phase 3's own apps. **Against, accepted:** two
mechanisms; the phase guide records the migration as Phase 6 work.

**The verified call-site set is 12, not 5** (v1's list was wrong at item 5 and
missing six):

| # | Site | Miss ⇒ |
| --- | --- | --- |
| 1 | `start_menu.svelte:128-144` | no launcher |
| 2 | `work_space.svelte` `launch()` | **silent no-op — no `else`** |
| 3 | …its `exec_path: path` | window rect never persists |
| 4 | …its `runningPrograms.update` | no taskbar button, **and** the desktop's Ctrl+C guard stops backing off |
| 5 | `work_space.svelte:39` `singleton_programs` | duplicate runtimes |
| 6 | `system.ts` `doctypes` | no association / no Open With |
| 7 | `system.ts` `icons` (separate record) | default icon in Explorer |
| 8 | `scripts/vfs-base.json` → `generate:vfs` | CI freshness gate fails |
| 9 | `e2e/start_menu.spec.ts:52-60` | red |
| 10 | **`e2e/shell.spec.ts:5-51`** | red, **and** the 24px cascade rule loses its only coverage |
| 11 | `profile.json → folderOptions.fileTypes` | shipped surface contradicts the association |
| 12 | `starting.svelte:34` preload array | the documented preload-regen gotcha |

On #10: the cascade test needs a **rect-less** window, and
`work_space.svelte:394-405` is the only branch omitting `exec_path`, so it
cannot be re-pointed at a real Phase 3 app — it moves to a Games placeholder,
which survives to Phase 4.

### D-E8 — Root config **(NEW)**

Verified in this repo: `resolveConfig(...).worker` is `{"format":"iife"}`. A
worker that statically imports the Pyodide ESM emits an undefined global with
only a Rollup *warning*; `build`, `svelte-check`, ESLint, vitest and Playwright
all stay green and it fails **only on the deployed site**, as an opaque
`worker.onerror`. Any local dynamic import inside a worker is instead a hard
build failure attributed to `index.html`.

**Verdict:** three up-front config tasks, each verified by inspecting output
rather than by a green gate —
1. `vite.config.js` gains `worker: { format: 'es' }`. **Verified by reading the
   emitted worker file**, and re-checking the existing `sort.js` worker, whose
   emitted format this also changes.
2. vitest gains a DOM environment (`jsdom`) **or** a coverage exclusion for the
   terminal/runtime entry files — decided at gate 3 by which keeps diff-cover
   honest. Verified: vitest currently has no `environment` (→ Node), no
   `jsdom`/`happy-dom` installed, zero existing DOM tests, and coverage includes
   all `src/**/*.ts` against an 80% CI gate.
3. `pyodide` added as a types-only devDependency (D-B1).
Two of these are `package.json` edits, so **`npx -y npm@10 install`** follows
each (D-E5). Deciding factor: gate 2 named this the most likely cause of a
mid-implementation re-plan precisely because a plan written at the app level
would not anticipate root-config work. **Against, accepted:** `worker.format`
changes an existing shipped worker's output; that is why it is verified by
reading the artifact.

### D-E11 — Keyboard arbitration **(NEW)**

D-A1's own "against" named this and no v1 decision resolved it. Verified: every
window-level keydown consumer guards on `window?.z_index === $zIndex` **except**
`Dialog.svelte:53-68`, which compares only against other `.dialog` nodes — so
Escape typed at a REPL prompt cancels a background Explorer's dialog. And
`desktop_folder.svelte:352` backs off only via `a_window_is_focused`, so a
terminal branch that omitted `runningPrograms.update` would make **Ctrl+C at a
Python prompt copy the desktop selection** — §8 rule 3's exact failure mode.

**Verdict:** terminals bind keyboard handling on the xterm textarea **only**,
never `svelte:window`, and never `stopPropagation` at window level; Escape
remains Dialog's; `Dialog.svelte` gains the same z-index guard every other
consumer already has. Ctrl+C in a terminal is handled by xterm and does not
reach the desktop handler. Deciding factor: §8 rule 2 names "handlers each
deciding in isolation" as a root cause of three shipped defects, and Phase 3
adds two keyboard-hungry surfaces. **Against, accepted:** Dialog's guard is a
change to a shipped, red-teamed component; it gets its own test.

Also owned here: the **minimum terminal width** v1 orphaned between D-A4 and
D-E7 — `min_width` is set via `WindowOptions.min_width`, which already exists
and every program already sets, sized so the ≤72-column formatters do not wrap.

### D-E12 — Singleton and audio arbitration **(NEW)**

`work_space.svelte:39` has a real `singleton_programs` list that v1 never
mentioned. Each Python instance is its own runtime: measured **~5.04 MiB wire**
per instance plus a full CPython heap, so three Start-Menu clicks is a tab kill
on a mid-range phone.
**Verdict:** Python and Music Player are **singletons**; CMD is
multi-instance. Deciding factor: the two singletons own a scarce exclusive
resource (a multi-megabyte runtime; the audio output and the visualizer's
context), while a second terminal is cheap and genuinely useful.
**Against, accepted:** a visitor cannot run two REPLs side by side.
**Audio arbitration:** the Music Player pauses on window close and does not
auto-pause MPC; if both play, both are heard — matching XP, where two media
apps do not coordinate. Recorded so it is a decision, not an accident.

### D-E3 — Bundle size **(TRAP CORRECTED)**

Verified: CSS code-splitting works exactly as v1 described — a `.css` imported
by a dynamic chunk emits as its own asset and is not linked from the entry HTML.
So v1's stated trap ("a stray top-level import of the CSS") is not the risk. The
real one: **a module both statically and dynamically imported is not split**,
and Rollup reports it as a *warning*, not an error. **Verdict:** gate on that
warning string in the build log, and assert no `.xterm-` rules appear in entry
CSS. Deciding factor: the failure is a silent ~89 KB regression on initial page
load that no existing gate would surface.

### D-E7 — Mobile **(REWRITTEN — v1's premise was false)**

v1 reasoned about "a terminal at 360 px" and mitigated with a minimum width.
Verified: §4.6 renders portrait (<1024px) as a **single static page with no
window management**, explicitly defers "CMD terminal, Python REPL, Paint", and
forbids loading "Pyodide, js-dos, **xterm.js**"; `mobile.ts:19-22` returns
`desktop` only at ≥1024px and the mode is locked at load. The cramped terminal
cannot occur.
**Verdict:** no mobile-specific work, and the plan **asserts** that the mobile
bundle never pulls xterm.js or Pyodide (§4.6's performance requirement, now
testable via the chunk check D-E3 already adds). The real undecided case is
§4.6's own note that **≥1024px touch devices get the full desktop** — xterm's
hidden textarea, the on-screen keyboard and Ctrl+C have no story there.
**Verdict:** recorded as a known limitation with a named owner (Phase 6, which
already owns touch polish), not silently inherited. Deciding factor: §4.6
already decided the portrait case; the honest gap is the touch-desktop case, and
naming it beats v1's mitigation of an impossible one.

### D-E4 — Test strategy **(EXTENDED)**

Verdict stands. The new problem v1 missed: the terminal bootstrap and the
runtime entry are `.ts`, counted by coverage, and untestable in a Node
environment (`terminal.open()` throws without a DOM). The existing worker dodges
this by being `.js` (`my_computer/sort.js`), which also puts it outside the
strict-lint block — a precedent that conflicts with CLAUDE.md's strict-TS rule.
D-E8 task 2 decides between `jsdom` and a coverage exclusion at gate 3.
Unchanged and re-emphasised: **every new test must be shown to fail against the
un-fixed code** — three shipped occasions of tests that could not fail.

### D-A7, D-E2, D-E5, D-E6, D-E9, D-E10 — unchanged

D-A7's inherited-from-prior-phase exception is narrowed to window chrome,
taskbar registration and z-order only; the title/icon, singleton and min-size
choices it was quietly carrying are now D-V3, D-E12 and D-E11.
D-E2 (no `.exe` entries) stands on §3.5, but v1's premise was wrong: the shipped
seed gives Desktop **five** `.exe` children. The real rule is "every §3.5
desktop icon is an `.exe`", which still excludes these four.

---

## 5. Risks carried into gate 3

| Risk | Why it bites |
| --- | --- |
| D-B0's thread isolation is unproven | Opens gate 3 as a spike; the fallback (blob-URL worker inside the frame) is written down now |
| `worker.format` change touches a shipped worker | Verified by reading the emitted file, not by a green build |
| `sandbox` on the Paint frame may break `contentDocument` | `netlify.toml` documents Paint depends on it; gate-3 spike, and the prune alone still closes the data paths |
| Seed migration carries user-owned fields | First bump against real user data; each carried field gets a revert-and-go-red test |
| Track ids are permanent | Carried items can never be reaped |
| Autoplay + `createMediaElementSource` | Both fail silently, and headless Chromium cannot catch the first |
| Parity on invented surfaces | §3 fixes references now; Paint's interior is explicitly unscored |
| E2E flake budget | The suite already flakes ~1 spec per 2–3 local runs |

## 6. What gate 4 should attack

The D-B0 spike's fallback if a sandboxed frame does **not** get its own event
loop; whether option 3's two coexisting wiring mechanisms are worse than the
if-chain they partially replace; whether D-C3's prune breaks jspaint in ways the
e2e suite cannot see; whether D-D3's carried-field list is complete or whether
there is a sixth user-owned field on seed items; whether D-V5's decision not to
score jspaint's interior is honest scoping or a pre-authorised waiver of exit
criterion 5; and whether pinning Pyodide 0.28.3 to satisfy a "3.13.x" banner is
worth shipping two ABI generations behind.
