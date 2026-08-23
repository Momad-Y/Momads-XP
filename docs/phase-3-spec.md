# Phase 3 spec — Developer & Interactive Apps

> Gate 1 of the §11 six-gate workflow. Source scope: `SPECIFICATION.md` §3.2
> and §9 Phase 3. This document is the input to gate 2 (red-team the spec),
> gate 3 (plan) and gate 6 (did we build what we said).

## 1. Scope

Four apps, all reachable **only from the Start Menu** (§3.5 caps the desktop at
five icons and names CMD / Python / Paint / Music Player as Start-Menu-only —
so Phase 3 adds **no desktop icons**):

| App | State today | Phase 3 delivers |
| --- | --- | --- |
| CMD | `placeholder_entry('Command Prompt', …)` → `placeholder.svelte` | Real xterm.js terminal, 15 commands, 3 easter eggs |
| Python REPL | `placeholder_entry('Python', …)` → `placeholder.svelte` | Pyodide CPython in-page, real banner, real execution |
| Paint | **Already wired** — `paint.svelte` frames the bundled jspaint, with XP chrome, Save As (PNG/JPEG/BMP) and `doctypes` registration | Verification + parity + gaps only (see D-C1) |
| Music Player | Start-menu label points at the inherited `media_player_classic.svelte` | New WMP-styled app: track list, transport, volume, seek, Canvas visualizer |

### Exit criteria (from §9)

All four apps functional and styled authentically. Concretely, gate 6 must be
able to tick:

1. Start ▸ All Programs ▸ Command Prompt opens a terminal titled `momad@xp:~`,
   prints the §3.2 intro verbatim, and every command in the §3.2 Phase-3 list
   produces output sourced from `profile.json`.
2. Start ▸ All Programs ▸ Python opens a REPL that prints a real
   `Python 3.13.x` banner from the running Pyodide, evaluates arbitrary
   expressions, and shows `Welcome to Momad's XP` from the pre-loaded greeting.
3. Start ▸ All Programs ▸ Paint opens jspaint inside XP chrome; File ▸ Save As
   writes a PNG into the VFS; the §3.2 tool set is present.
4. Start ▸ All Programs ▸ Music Player opens a player that plays bundled
   tracks with working play/pause, next/prev, volume, seek, track list and a
   live Canvas visualizer.
5. §11 visual parity ≥95% on all four new/changed surfaces at 1280×800.
6. Full gate chain green; `docs/phase-3-guide.md` written.

### Explicitly OUT of scope

- **Filesystem commands** (`ls`, `cd`, `cat`, `pwd`) — §3.2 assigns these to
  Phase 6 by name. Phase 3 ships the core command set only.
- **Spotify embed mode** — §3.2 marks it stretch.
- **Games, AI chatbot, SFX polish** — Phases 4, 5, 6.
- **A custom Canvas Paint** — see D-C1.

---

## 2. Sub-decisions

Each is a binding choice. Per `decision-presentation.md` every one carries
for-and-against and a deciding factor; the two documented exceptions
(forced-by-fact, inherited-from-prior-phase) are used only where they truly
apply and are labelled.

### D-A1 — Terminal renderer: xterm.js vs a custom DOM terminal

**Option 1 — xterm.js** (`@xterm/xterm` + `@xterm/addon-fit`)
*For:* §3.2 and §9 both name xterm.js explicitly, so it is the specified
choice; gives a real VT emulator, so the Python REPL's ANSI-coloured
tracebacks and the `matrix` easter egg render without hand-rolled escape
handling; canvas/DOM renderer already solves selection, scrollback and
resize.
*Against:* ~250 KB gzipped added to the bundle for two apps; its own CSS must
be imported and then overridden to look like XP's console; it owns keyboard
input, so every XP-level shortcut (Ctrl+C, Escape-closes-menus) has to be
reconciled with it; no built-in line editor (see D-A2).

**Option 2 — custom DOM terminal** (a `<div>` of lines + a hidden input)
*For:* zero dependency, trivially styled to XP's console, ~100 lines; keyboard
handling stays in our own code where the Escape/Ctrl+C conventions already
live.
*Against:* re-implements scrollback, selection, wrapping and ANSI parsing —
and Pyodide's error output *is* ANSI-coloured, so the parser is not optional;
diverges from the written spec, which a later reader would read as drift.

**Verdict: xterm.js.** Deciding factor: the spec names it, and the Python REPL
makes ANSI parsing mandatory rather than optional — writing that ourselves is
the expensive half of a terminal, so the "zero dependency" saving is smaller
than it looks. **Against, accepted:** bundle weight, which D-E3 mitigates by
lazy-loading both terminal apps.

### D-A2 — Line editing: an addon vs our own readline

**Option 1 — own readline in `src/lib/cmd/readline.ts`**
*For:* xterm.js ships no line editor, and the community addons for it are
unmaintained; a pure-TS readline (cursor, backspace, ←/→, Home/End, ↑/↓
history) is ~120 lines, is 100% unit-testable without a DOM, and therefore
counts toward the diff-coverage gate rather than hiding in a `.svelte` file.
*Against:* we own the edge cases (wide chars, paste with embedded newlines,
wrapping across the terminal width).

**Option 2 — pull an xterm readline addon from npm**
*For:* less code to write.
*Against:* the candidates are single-maintainer packages with no releases in
years; adding an unmaintained dependency to satisfy 120 lines of logic is a
poor trade, and it would put the logic outside our test suite.

**Verdict: own readline, as a pure TS module.** Deciding factor: it is the
only option that is unit-testable, and this repo's diff-cover ≥80% gate on
changed `.ts` makes testability a hard requirement, not a preference.
**Against, accepted:** we own paste/wrap edge cases; the plan budgets tests for
each.

### D-A3 — Where the command layer lives

**Option 1 — pure module `src/lib/cmd/` (registry + dispatch + formatters), the
`.svelte` component only wires it to xterm**
*For:* commands become pure `(args, profile) => string[]`, testable without a
browser; matches the shape the repo already uses for `status_bar.ts`,
`details_columns.ts`, `nav_history.ts`; keeps the component under the size
limit in the global rules.
*Against:* more files; a formatting change touches a module plus its test
rather than one component.

**Option 2 — dispatch inside `cmd.svelte`**
*For:* one file, direct access to the terminal handle.
*Against:* `.svelte` is exempt from diff-coverage, so this is precisely the
"hide logic in a component to dodge the gate" anti-pattern the handoff §6
warns against; and the repo's own history shows component-resident logic is
where the cross-window bugs came from.

**Verdict: pure module.** Deciding factor: an explicit standing rule in
`session-handoff.md` §6 forbids option 2's motivation, and every comparable
Phase-2 feature already took option 1. **Against, accepted:** more files.

### D-A4 — What the commands print, and from where

Commands read `profile` from `src/lib/profile.ts` (the CLAUDE.md rule: no
hardcoded personal content in components — and a command module is no more
exempt than a component). Mapping:

| Command | Source |
| --- | --- |
| `about` | `profile.about` |
| `skills` | `profile.skills` |
| `experience` | `profile.experience` |
| `projects` | `profile.projects` |
| `contact` | `profile.about` contact fields + `profile.social` |
| `social` | `profile.social` |
| `whoami` | literal `momad` (§3.2 states the exact output) |
| `uname -a` | composed from `profile.systemProperties` + fixed XP strings |
| `help`, `clear`, `echo`, `date`, `time` | no profile data |

**Option 1 — formatters return `string[]` of already-wrapped lines**
*For:* pure, snapshot-testable, no terminal handle needed.
*Against:* wrapping decisions are made without knowing the terminal width.

**Option 2 — formatters return a structured tree the renderer wraps**
*For:* correct wrapping at any width.
*Against:* a whole layout engine for four screens of text.

**Verdict: `string[]`, wrapped by xterm at its own width, with our formatters
emitting short lines (≤72 cols) and column alignment only where the content is
naturally narrow (skills, social).** Deciding factor: xterm already reflows,
so option 2 solves a problem we do not have. **Against, accepted:** a very
narrow window will wrap our aligned columns awkwardly; the plan adds a minimum
window width instead.

### D-A5 — Easter eggs: `matrix`, `hack`, `sudo`

`sudo` is a one-liner (`momad is not in the sudoers file. This incident will
be reported.`) and needs no decision. `matrix` and `hack` are animations.

**Option 1 — timed animation owned by the component, cancellable by any key**
*For:* matches every real terminal toy; the user is never trapped; a single
`AbortController`-style latch covers both eggs and the app close path.
*Against:* needs an explicit teardown on window close or the interval leaks
after the component is unmounted.

**Option 2 — fixed-length animation that must run to completion**
*For:* simpler.
*Against:* a user who opens `matrix` and wants to type is stuck; and a leaked
interval writing into a disposed xterm throws.

**Verdict: option 1 — cancellable, with teardown on unmount.** Deciding
factor: the teardown is required in *both* options (the window can be closed
mid-animation), so option 2's simplicity is illusory while its UX is worse.
**Against, accepted:** the cancellation latch is state that must be reset per
invocation — and this repo has a scar (`rename_cancelled`) from exactly that
shape, so the plan requires a test that runs two animations back to back.

### D-A6 — Confirming `ls`/`cd`/`cat`/`pwd` stay out

**Option 1 — defer to Phase 6 as written**
*For:* §3.2 assigns them to Phase 6 by name; they require a second filesystem
model (a POSIX-ish view of the portfolio) that does not exist yet and that
Phase 6 can build against a settled `profile.json`.
*Against:* a terminal without `ls` invites the user to type it and get
"command not found", which reads as broken rather than deferred.

**Option 2 — pull them forward**
*For:* completes the illusion.
*Against:* an unscoped scope change at gate 1 — the autonomy rule says scope
changes go to the owner — and it needs the path model Phase 6 owns.

**Verdict: defer, but make the deferral legible** — `ls`/`cd`/`cat`/`pwd` are
*known* commands that print `<cmd>: not available yet — filesystem navigation
lands in a later update`, and `help` lists them under a "coming soon" heading.
Deciding factor: it costs ~10 lines to turn a dead end into a deliberate one,
without touching Phase 6's scope. **Against, accepted:** a stub reply is still
not the feature.

### D-A7 — Window chrome and title

§3.2 specifies title `momad@xp:~`, black background, monospace. Inherited
`Window.svelte` supplies XP chrome; the terminal is the content.
**Marked: inherited-from-prior-phase** — window chrome, taskbar registration
and z-order were settled in Phase 1 and every Phase-2 app follows the same
pattern (`Window.svelte` + `runningPrograms` + `exec_path`). No alternative is
weighed here; deviating would be the decision needing justification.

### D-A8 — Unknown commands and casing

**Verdict:** case-insensitive command lookup (XP's shell is), arguments passed
through verbatim (so `echo Hello` keeps its case), unknown input prints
`'foo' is not recognized as an internal or external command.` — XP's real
wording. Deciding factor: §3.2 asks for "bash emulation" in *style* but the
window is Command Prompt; the XP error string is the more recognisable joke and
costs nothing. **Against, accepted:** mixing a bash-flavoured prompt with a
cmd.exe error string is technically inconsistent — a deliberate, documented
inconsistency in favour of the gag.

### D-B1 — Pyodide delivery: pinned CDN vs self-host vs npm

**Option 1 — pinned CDN** (`cdn.jsdelivr.net/pyodide/v0.28.x/full/`)
*For:* §3.2 states this explicitly, and states the reason (the dist is tens of
MB and would bloat `static/`); jsDelivr serves the official build; zero repo
size cost; no Netlify bandwidth cost.
*Against:* a third-party runtime origin — if jsDelivr is down or blocked, the
app cannot start; it is the only external runtime dependency in the product;
and it must be pinned by exact version or a CDN-side change silently alters
behaviour.

**Option 2 — self-host in `static/`**
*For:* no external dependency, works offline, no supply-chain surface.
*Against:* ~10 MB minimum for a trimmed dist (the full one is far larger),
against a repo whose `static/` already carries 45 MB of jspaint; every deploy
uploads it; §3.2 rejected this in writing.

**Option 3 — npm `pyodide` package bundled by Vite**
*For:* version-locked in the lockfile.
*Against:* the package still fetches its `.wasm`/`.zip` data files at runtime
from wherever `indexURL` points, so it does not remove the network hop — it
only adds a build-time dependency on top of it.

**Verdict: pinned CDN, exact version, with an explicit failure UI.** Deciding
factor: the spec already weighed size against dependency and chose CDN; option
3's "lock it in npm" benefit does not survive the fact that Pyodide loads its
payload at runtime regardless. **Against, accepted:** an external origin can
fail — so the REPL must degrade to a legible error inside the terminal
("Python runtime unavailable — check your connection"), never a blank window
or a hang, and the version is a single named constant so a bump is one edit.

### D-B2 — Execution context: main thread vs Web Worker

**Option 1 — main thread**
*For:* far simpler; `print()` and results come back synchronously; Pyodide's
own console API (`PyodideConsole`) is designed for this.
*Against:* `while True: pass` freezes the whole desktop — not just the REPL —
with no way back except a page reload. That is a hard hang of the entire
product, triggerable by one line of user input.

**Option 2 — Web Worker**
*For:* a runaway loop freezes only the worker; the app stays alive and the
worker can be terminated and respawned, which is a real "interrupt" story.
*Against:* all I/O crosses `postMessage`, so `print` streaming, incremental
input and error objects need a protocol; Pyodide-in-worker is a documented
pattern but it is meaningfully more code; and reloading the worker means
reloading Pyodide (seconds).

**Verdict: Web Worker.** Deciding factor: option 1's failure mode is a
total-product hang reachable by typing three words into a REPL we are inviting
people to type into — that is not an acceptable state for a portfolio site,
and no amount of simplicity buys it back. **Against, accepted:** a
`postMessage` protocol and a slower recovery path; the plan makes the protocol
a typed, unit-tested module rather than ad-hoc message shapes, and Ctrl+C
terminates and respawns the worker with a "Restarting Python…" line.

### D-B3 — Does Python reuse CMD's terminal core?

**Option 1 — shared `src/lib/term/` core (xterm bootstrap + readline + theme),
two thin app components**
*For:* one terminal look, one keyboard model, one place to fix a wrapping bug;
the readline from D-A2 is needed identically by both.
*Against:* a shared abstraction written before its second consumer exists is
the classic wrong abstraction — Python needs multi-line continuation and
interrupt semantics CMD does not.

**Option 2 — duplicate the bootstrap in each app**
*For:* each app evolves freely.
*Against:* this repo's single most-repeated defect is "a rule applied at one
call site, siblings left alone" — now at seven instances. Two independent
terminals is that pattern pre-installed.

**Verdict: share the *mechanical* layer (xterm construction, XP theme, fit,
readline, teardown), keep *semantics* per app (prompt string, submit handler,
continuation, interrupt).** Deciding factor: the seven-instance history makes
duplicated mechanism the higher risk, while the semantic split keeps the
abstraction honest about what actually differs. **Against, accepted:** the
shared layer must not grow app-specific branches; if it needs an `if (python)`
it has become the wrong abstraction and the plan says to split it instead.

### D-B4 — Load UX and failure handling

**Verdict:** the REPL window opens immediately, prints `Loading Python
runtime…`, streams a progress line, then the real banner. On failure (CDN
unreachable, wasm blocked, worker error) it prints a single legible error and
leaves the window usable so it can be closed normally; no spinner-forever, no
silent blank.
*For:* Pyodide is a multi-second, multi-megabyte load on a cold cache; showing
nothing reads as broken.
*Against:* a progress line requires wiring Pyodide's loader messages through
the worker protocol.
Deciding factor: the global rule "never silently swallow errors / provide
user-friendly messages in UI-facing code" applies directly, and a portfolio
visitor on hotel wifi is the likely first user of this window.

### D-B5 — E2E strategy for an app whose runtime is on a CDN

This is the sharpest cross-decision conflict in the phase: the standing
constraint is **"new e2e specs must not reach the internet"**, and D-B1 puts
the Python runtime on the internet.

**Option 1 — Playwright route-stub the CDN, assert the REPL's *shell* (banner
line, prompt, error path) against a fake worker**
*For:* honours the constraint; fast and deterministic; covers the parts that
are ours (the protocol, the readline, the failure UI).
*Against:* never executes real Python, so "the REPL actually runs code" is not
covered by CI.

**Option 2 — let one e2e spec hit the real CDN**
*For:* proves the whole thing end to end.
*Against:* violates the constraint; adds ~10 MB and several seconds to every
CI run; makes the suite fail when jsDelivr hiccups — and this suite already
has a measured flake problem we are told not to make worse.

**Option 3 — stub in e2e AND verify real execution on the deployed site**
*For:* CI stays hermetic; the real-runtime claim is verified where it matters,
which is the standing "probe the running deploy" rule that has already caught
two holes nothing else did.
*Against:* the real-execution check is manual, so it is only as reliable as the
gate-6 checklist that names it.

**Verdict: option 3.** Deciding factor: the constraint is not negotiable and
the deploy-probe rule already exists precisely for claims CI cannot make.
**Against, accepted:** the manual step is recorded as an explicit line in the
gate-6 checklist and in `docs/phase-3-guide.md` §8, not left to memory.

### D-B6 — Multi-line input

**Verdict:** use Pyodide's `PyodideConsole`, which reports
`incomplete`/`complete`/`syntax-error` per pushed line; on `incomplete` the
prompt becomes `...` and the buffer accumulates.
*For:* it is CPython's own `codeop` semantics, so `def f():` behaves exactly as
a real REPL — hand-rolled brace counting does not.
*Against:* couples us to a Pyodide API that has moved between major versions.
Deciding factor: correctness of the REPL is the feature; and the version is
pinned anyway (D-B1), so API drift is a deliberate upgrade, not a surprise.

### D-B7 — Output routing

**Verdict:** `stdout` and `stderr` stream to the terminal as they are produced
(not batched at completion); the repr of a non-`None` result prints after; a
Python exception prints the real traceback. `input()` is **not** supported in
Phase 3 — it prints a clear `input() is not supported here` rather than
deadlocking the worker.
*For:* streaming is what makes a `for i in range(5): print(i)` loop feel real;
refusing `input()` explicitly beats a hang.
*Against:* `input()` is a natural thing for a visitor to try, and refusing it
is a visible gap.
Deciding factor: supporting `input()` needs a blocking read across a worker
boundary (`SharedArrayBuffer` + `Atomics.wait`), which needs COOP/COEP headers
— and §5 of the spec already records that COOP/COEP breaks other embeds on
this site. So it is not a small feature, it is an architecture change that
would damage Phase 4.

### D-C1 — Paint: keep the bundled jspaint, or write a Canvas app?

**Option 1 — keep jspaint** (already at `static/html/jspaint`, already framed
by `paint.svelte`, already wired into `doctypes` for `.bmp/.png/.jpg/.jpeg`,
already integrated with Save As through its `systemHooks`)
*For:* §3.2 offers it as an explicit option and Phase 0 deliberately kept it;
it is a far more complete Paint than we would write, and the integration work
(Save As into the VFS, open-from-Explorer) is already shipped and tested;
Phase 3 cost is verification and parity, not construction.
*Against:* 45 MB of `static/`; it is third-party code running same-origin (it
must, for `contentDocument` access — `netlify.toml` documents this); its chrome
is jspaint's own XP-ish styling, which may not hit ≥95% against real XP Paint
in every corner.

**Option 2 — custom Canvas Paint**
*For:* removes 45 MB and the same-origin third-party surface; total control of
parity.
*Against:* re-implements pencil/brush/eraser/fill/shapes/text/undo/palette —
easily the largest single item in the phase — and would *replace working,
shipped, integrated functionality with less of it*. Also strands the existing
`doctypes` and Save As wiring.

**Verdict: keep jspaint. Phase 3's Paint work is a verification-and-gap pass,
not a build.** Deciding factor: option 2 spends the phase's largest budget to
end up with fewer features than are already deployed — the only genuine
argument for it is bundle size, which is a Phase 6 concern and does not justify
deleting working code. **Against, accepted:** we keep 45 MB and a same-origin
third-party bundle. The plan therefore requires (a) confirming every §3.2 tool
and menu item exists, (b) parity screenshots against real XP Paint, (c) an
explicit note in the phase guide that jspaint is third-party and same-origin by
necessity, and (d) checking that jspaint ships no network calls of its own.

### D-C2 — What if jspaint fails a §3.2 requirement?

**Verdict:** gaps are closed in *our wrapper* (window chrome, title, Save As
filetypes, icon) rather than by patching the vendored bundle. Deciding factor:
a patched vendor bundle is unmaintainable and invisible to review; if a gap is
genuinely inside jspaint and material, it is recorded in the phase guide as a
known limitation rather than forked.

### D-D1 — Music Player: new app vs extending the inherited MPC

**Option 1 — new `music_player.svelte`, MPC untouched**
*For:* §3.2 asks for a WMP/Winamp-styled player with a track list and
visualizer; MPC is a *file* player with no playlist concept, reached by
double-clicking media in Explorer, and it is load-bearing for `.mp3/.mp4/.wav`
via `doctypes`; rebuilding it into a playlist app would regress that path.
*Against:* two media players in one product, and two places that touch
`systemVolume` and the audio element lifecycle.

**Option 2 — extend MPC into the Music Player**
*For:* one player.
*Against:* MPC's whole contract is "play the file I was opened with"; adding a
playlist, a visualizer and a different chrome to it changes the behaviour of
every existing Explorer double-click — a regression to an inherited surface,
which is exactly what gate 4 is told to hunt for.

**Verdict: new app; MPC keeps the file-association role untouched.** Deciding
factor: MPC is on the `doctypes` path for three extensions and changing it
would regress shipped behaviour for a feature that does not need it.
**Against, accepted:** two players coexist — so D-D6 defines the boundary
explicitly rather than leaving it to chance.

### D-D2 — Where the tracks come from

**Option 1 — synthesize original instrumental tracks locally with ffmpeg and
commit them as MP3s**
*For:* no licensing question at all (we authored them), no download of
third-party binaries into the repo, fully reproducible from a committed script,
and the player is *demonstrably* functional at gate 6 rather than
functional-in-principle.
*Against:* synthesized tracks are not real music — they are pleasant tones, and
a visitor may find them thin.

**Option 2 — ship no audio, document a placeholder for the owner to fill**
*For:* zero bytes, and the owner picks music they like.
*Against:* the exit criterion is "functional"; a player with no tracks cannot
be shown to work, and the visualizer cannot be parity-checked.

**Option 3 — fetch CC0 tracks from an external source**
*For:* real music.
*Against:* pulls unverified binaries into the repo, and the licence claim would
rest on a page I cannot audit at commit time.

**Verdict: option 1 — three short original instrumental tracks generated by a
committed `scripts/gen-tracks.sh`, with the phase guide documenting exactly how
to drop in real MP3s instead.** Deciding factor: it is the only option that is
both licence-clean by construction and demonstrably functional at gate 6.
**Against, accepted:** the shipped music is placeholder-grade; that is stated
plainly in the phase guide's "Required assets" section, and swapping it is one
manifest edit. *Flagged for the owner at handoff:* if he wants his own tracks,
this is where they go.

### D-D3 — Do the tracks live in `static/` or in the VFS?

**Option 1 — `static/audio/music/` + a manifest the app reads**
*For:* the player always has content, even after a VFS reset; no seeding
churn; no interaction with `hidden_items`, protected ids or the seed-version
stamp.
*Against:* the tracks are then invisible in Explorer's `My Music` folder, which
is an obvious place a visitor would look.

**Option 2 — seed them into the VFS `My Music` folder**
*For:* discoverable in Explorer; double-clicking one opens MPC, which already
works.
*Against:* touches `scripts/vfs-base.json` and forces a `SEED_VERSION` bump,
which is a shipped-data migration — and the seed has already produced one
regression on real user data this project had to fix.

**Verdict: both, deliberately — `static/` is the source of truth the player
reads from a manifest, and the same files are *also* seeded into `My Music` as
remote-URL VFS entries.** Deciding factor: the player must not depend on
mutable user state (a visitor can delete files), but an empty `My Music` in a
Windows recreation is a visible hole; pointing the VFS entries at the same
static URLs makes the second copy metadata-only, so there is no duplication of
bytes. **Against, accepted:** a seed change and a `SEED_VERSION` bump, with the
carry-by-provenance rule in `seed.ts` respected — the plan calls this out as
the phase's single highest-risk edit.

### D-D4 — Visualizer and browser autoplay policy

**Verdict:** Web Audio `AnalyserNode` fed from a `MediaElementAudioSourceNode`,
drawn on a Canvas at `requestAnimationFrame`; the `AudioContext` is created
**on the first user gesture** (the play click), not on mount.
*For:* browsers block or suspend an `AudioContext` created without a gesture,
which would produce a dead visualizer with no error; creating it on play is the
documented pattern.
*Against:* the visualizer cannot render anything before the first play, so the
idle state needs a designed "flat line" look rather than being accidentally
blank.
Deciding factor: this is a hard browser rule, not a preference — building it
the other way produces a feature that silently does not work, which is the
failure mode this project has been bitten by most.
Note: `MediaElementAudioSourceNode` **routes the audio through the graph**, so
once connected, the element's own output is muted unless the graph is connected
to the destination. That is a known footgun; the plan makes it an explicit
wiring step with a test.

### D-D5 — Volume: app slider vs the global `systemVolume`

**Marked: inherited-from-prior-phase.** MPC already multiplies its own slider
by `$systemVolume` (`audio_volume = wmp_volume * $systemVolume`) and the tray
volume control is a shipped surface. The Music Player follows the identical
rule. Deviating — e.g. ignoring the tray — is what would need justification.

### D-D6 — Boundary with MPC when opening an `.mp3` from Explorer

**Option 1 — `.mp3` keeps opening MPC; Music Player is Start-Menu-only**
*For:* no change to shipped `doctypes` behaviour; matches XP, where
double-clicking a file and opening Media Player are different acts.
*Against:* a visitor who double-clicks a track in `My Music` gets the plain
player, not the pretty one.

**Option 2 — `.mp3` opens the Music Player**
*For:* the nicer app wins.
*Against:* changes a shipped association; MPC also handles `.wav`/`.mp4`, so
either it keeps some audio types (incoherent) or the Music Player must handle
video too (out of scope).

**Verdict: option 1, plus Music Player appears in `doctypes['.mp3']` as the
*second* entry** — so it shows up in Explorer's "Open With" list without
becoming the default. Deciding factor: it gives the discoverability of option 2
with none of the shipped-behaviour change, and `doctypes` already models
multiple handlers this way (`.png` lists Image Viewer then Paint).
**Against, accepted:** the default double-click is still the plainer player.

### D-E1 — Launch wiring: every call site

Adding an app touches **five** places, and the repo's recurring defect is
missing one:

1. `src/routes/xp/start_menu.svelte` — replace the two `placeholder_entry`
   calls; repoint Music Player
2. `src/routes/xp/work_space.svelte` — the `launch()` if-chain needs a branch
   per new component
3. `src/lib/system.ts` — `doctypes` (Music Player under `.mp3`) and any icon
   mapping
4. `scripts/vfs-base.json` → `npm run generate:vfs` — see D-E2
5. e2e locators — `start_menu.spec.ts` asserts the current placeholder
   behaviour and will break

**Verdict:** the plan carries this as an explicit five-point checklist per app,
and gate 6 re-derives the list from the code rather than trusting the plan.
Deciding factor: seven recorded instances of exactly this failure.

### D-E2 — Do the new apps get VFS `.exe` entries?

**Option 1 — no**
*For:* only My Computer and Internet Explorer have `.exe` entries today, and
those exist because they are *desktop icons*; §3.5 keeps these four off the
desktop, so nothing needs to resolve them from the VFS.
*Against:* they are then invisible to Explorer and to Search.

**Option 2 — yes, seeded into a `Program Files`-ish folder**
*For:* discoverable; consistent with a real system.
*Against:* invents VFS structure the spec does not ask for, and every seeded
item is shipped data with a migration cost.

**Verdict: no `.exe` entries in Phase 3.** Deciding factor: nothing in the
phase's exit criteria reaches these apps through the VFS, and the seed is the
riskiest file in the repo to touch — D-D3 already spends that budget on the
music tracks, which do have a user-visible reason.

### D-E3 — Bundle size

**Verdict:** both terminal apps are `await import(…)`-loaded through the
existing `work_space.launch()` pattern, so xterm.js lands only when a terminal
is opened; Pyodide is fetched by the worker, so it never enters the main
bundle; the visualizer is plain Canvas with no library.
**Marked: inherited-from-prior-phase** for the lazy-load mechanism —
`work_space.svelte` already dynamic-imports all 20 programs. The new part is
only the assertion that xterm's CSS is imported *inside* the lazily-loaded
component, not globally; the plan verifies this by inspecting the built chunk
list, because a stray top-level import silently defeats it.

### D-E4 — Test strategy

**Verdict:** logic in `.ts` modules with unit tests (command registry,
formatters, readline, worker protocol, playlist model, manifest validation);
`.svelte` covered by e2e; diff-cover run locally before every push. Every new
test must be shown to fail against the un-fixed code — the handoff records
three separate occasions where a test could not fail. Deciding factor: the
diff-cover gate is a hard CI gate at 80% on changed `.ts`, and the
"tests that cannot fail" scar is at three instances.

### D-E5 — Lockfile

**Marked: forced-by-fact.** CLAUDE.md: CI's `npm ci` runs npm 10; the local
toolchain is npm 11.6.2 / Node 25. Any `package.json` change is followed by
`npx -y npm@10 install`. No alternative exists that keeps CI green.

### D-E6 — Sounds for the new apps

**Verdict:** none in Phase 3. §9 assigns SFX to Phase 6, and `static/audio`
already holds the XP set for it. Deciding factor: adding ad-hoc sounds now
would pre-empt Phase 6's sound-manager design (§6.5) and create a second place
that plays audio outside it. **Against, accepted:** the apps are silent apart
from the music itself.

### D-E7 — Mobile

**Verdict:** the four apps inherit the existing mobile rules (§4.6) with no
special handling, except that the terminals declare a minimum usable width and
the Music Player's visualizer canvas resizes with its window.
*For:* §4.6 and `mobile.ts` are shipped and tested; a portrait phone user is
not the audience for a Python REPL.
*Against:* a terminal at 360 px is genuinely unusable.
Deciding factor: making terminals mobile-first is a design project of its own
and is not in §9's exit criteria; the honest move is to let them open and be
cramped rather than to special-case them badly. Recorded as a known limitation.

---

## 3. Risks carried into gate 3

| Risk | Why it bites here |
| --- | --- |
| Seed migration (D-D3) | Shipped user data; this project has already had one seed regression |
| `MediaElementAudioSourceNode` muting the element (D-D4) | Silent failure — audio "works" until the graph is connected |
| Worker protocol drift (D-B2) | Untyped `postMessage` shapes are where the bugs hide |
| xterm CSS leaking into the main bundle (D-E3) | Silently defeats the lazy load; only visible in the chunk list |
| Five-call-site wiring (D-E1) | The single most repeated defect in this repo |
| Pyodide pinned version (D-B1) | A CDN 404 on a bad pin is a dead app with no local test that would catch it |
| E2E flake budget | The suite already flakes ~1 spec per 2–3 local runs; four new apps' specs must not make that worse |

## 4. What gate 2 should attack

Deliberate invitations for the red team: the D-B5 hermetic-e2e-vs-real-runtime
compromise; the D-C1 "don't build Paint" verdict (is verification really
enough for an exit criterion that says *functional and styled authentically*?);
D-D2's synthesized music; D-D3's decision to spend a seed migration on audio
files; D-B2's worker complexity versus the odds anyone types an infinite loop;
and whether D-A6's "known but deferred" stubs are honest or are dead entries of
the kind Phase 2 spent a whole PR removing.
