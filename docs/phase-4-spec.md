# Phase 4 — Games: specification

**Gate 1 of the §11 six-gate loop.** Owner said go on 2026-09-13, from a clean
tree at `6cf9a34` with `main` == `dev` == `origin`.

**Goal (SPECIFICATION.md §9):** Minesweeper, Solitaire, Chess, DOOM.
**Exit criteria (§9):** all four playable inside XP windows.

Two decisions in this document were made by the owner, not by me, and are
recorded as locked before anything else was written:

- **Third-party licensing:** ship both GPL components (js-dos GPL-2.0 for
  DOOM, Stockfish GPL-3.0 for Chess) behind a `LICENSE-third-party.md`
  carve-out. Asked because the repo `LICENSE` currently reads *"All rights
  reserved … redistribution not permitted"*, which cannot be applied to GPL'd
  files (GPL-2 §6, GPL-3 §10 forbid imposing further restrictions).
- **Chess opponent:** real Stockfish, deliberately weakened — not a
  hand-written engine. This resolves a contradiction inside SPECIFICATION.md
  itself: §3.3 says "a simple AI" while the §5 technology table names
  Stockfish WASM. §5 wins.

---

## 1. What already exists (inherited surfaces this phase plugs into)

Nothing here is new work; it is the shape the four games must fit.

| Surface | File | What it means for Phase 4 |
| --- | --- | --- |
| App registry | `src/lib/app_registry.ts` | Each game gets one `AppDefinition` row: `path`, `title`, `icon`, lazy `component`, sizes, `singleton`. `work_space.svelte:516` launches through `find_app()`. |
| All Programs | `src/lib/start_menu_programs.ts:111-119` | The Games flyout already lists all four as `placeholder_entry(...)`. Each becomes a real `path:` row. |
| Placeholder | `src/routes/xp/programs/placeholder.svelte` | The "not built yet" dialog four games currently open. Stays — other things still use it. |
| Icons | `static/assets/icons/{minesweeper,solitaire,chess,doom}.png` | Already shipped in Phase 0. No new icon work. |
| Registry test | `src/lib/start_menu_programs.test.ts` | Walks `src/routes/xp/programs/` and fails if a component is neither listed nor explained in `NOT_PROGRAMS`. It will fail the moment a game component lands unlisted — this is a feature. |
| Window chrome | `src/lib/components/xp/Window.svelte` + `WindowOptions` | `resizable`, `min_width/height`, `aspect_ratio`, `maximize_btn` all exist. |
| Volume | `systemVolume` store (`volume_adjust.svelte:22`) | DOOM has audio and must respect it. |
| Origin allowlist | `e2e/no_cdn.spec.ts` | An **allowlist** of `code.jquery.com` + `unpkg.com/loadjs`. Any new third-party origin fails this spec. Binding on every choice below. |
| Vendoring precedent | `static/js/three/` + `netlify.toml` immutable block + `vendored_three.test.ts` | The established pattern for "a big third-party file we serve ourselves and pin by bytes". |

## 2. Verified constraints (measured, not assumed)

Each of these was checked against the real artefact during this gate. Two of
them contradict what the Phase 4 handoff note carried in, which is why they
are written down here rather than in the plan.

1. **js-dos is fully self-hostable, and only its low layer is safe to ship.**
   `js-dos@8.4.1` ships two layers. `dist/js-dos.js` (316K) is a cloud-connected
   UI: it hardcodes `br.cdn.dos.zone` (×10), `net.dos.zone`, `v8.js-dos.com`
   and a Yandex API gateway. `dist/emulators/emulators.js` (84K) is the
   emulator API, and grepping it for `https?://` finds **only** licence URLs
   and comment text — every fetch it makes is `pathPrefix + filename`, which we
   set to our own origin. Shipping the UI layer would fail `no_cdn.spec.ts`;
   shipping the low layer cannot.
2. **DOOM needs no CSP change.** The handoff note predicted js-dos would need
   its own `netlify.toml` CSP block. It does not. The `/*` block sets only
   `frame-ancestors 'self'` — it deliberately carries **no `script-src`**
   (gate 4 of Phase 3 established that adding one blanks the whole site), and
   with no `script-src` there is no directive for WebAssembly to be blocked
   against. `wasm-unsafe-eval` is only needed on `/html/python-sandbox.html`
   because *that* path replaces the policy with a `default-src 'none'` one.
3. **Bytes actually needed from js-dos:** `emulators.js` (84K), `wdosbox.js`
   (112K), `wdosbox.wasm` (1.4M), `wlibzip.js` (72K), `wlibzip.wasm` (112K) —
   **~1.8MB**. Not the 29MB npm tarball, not `dosbox-x`, not `sockdrive`.
4. **Stockfish: `stockfish.js@10.0.2` is the right build.** Measured against
   the alternative the upstream README recommends:

   | Build | Bytes over the wire | SharedArrayBuffer | Notes |
   | --- | --- | --- | --- |
   | `stockfish.js@10.0.2` (WASM path: `stockfish.wasm` 545K + `stockfish.wasm.js` 94K) | **~640K** (≈250K gzipped) | **0 references** — verified by grep | SF10, hand-crafted eval. `Skill Level` UCI option present (verified in the `.wasm` strings). GPL-3 `Copying.txt` ships in the package. |
   | `stockfish-18-lite-single` | **7.32MB** (20K js + 7.30MB wasm) | none | Current SF, NNUE. |
   | `stockfish.wasm@0.10.0` (lichess) | 433K | **required** | Ruled out by §5 — COOP/COEP breaks other embeds. |

   SF10 is ~3400 Elo. The owner's decision is to weaken it deliberately, so the
   7.3MB NNUE build buys strength we then throw away. 640K wins.
5. **`@online` is a grep tag, not a network property.** `playwright.config.ts`
   splits `default` (`grepInvert: /@online/`) from `online` (`grep: /@online/`).
   Because Stockfish and js-dos are self-hosted, **games are hermetic** and
   belong in `default`. The only reason to tag one `@online` would be runtime
   cost on a 2-core CI runner — see D19.
6. **`C:\` root is the portfolio's information architecture.** Its twelve
   children are `My Documents`, `My Music`, `My Pictures`, `Desktop`,
   `Recycle Bin`, `Wallpapers`, `Experience`, `Projects`, `Education`,
   `Skills`, `Certificates & Awards`, `CV.pdf`. Every visible folder is a CV
   section. This is load-bearing for D3.

---

## 3. Sub-decisions

Every binding choice, with for-and-against on each option and the deciding
factor for the verdict. Per `~/.claude/rules/common/decision-presentation.md`,
the "forced-by-fact" and "inherited-from-prior-phase" shortcuts are used only
where named explicitly.

### D1 — Where game logic lives

**Option A — logic in `src/lib/games/<game>/*.ts`, component is a thin view.**
*For:* `vitest.config.ts` instruments `src/**/*.ts` and exempts `.svelte`
("owned by the Playwright E2E suite"), so this is the only split where the CI
diff-coverage gate (≥80% on changed lines) can actually see the rules of each
game. Mine placement, flood-fill reveal, Klondike legality and UCI parsing are
pure functions with no DOM. Matches `src/lib/term/`, `src/lib/cmd/`,
`src/lib/python/`, `src/lib/music/`.
*Against:* four more directories; a trivial game (Minesweeper is ~200 lines)
pays a module boundary it could have skipped.

**Option B — everything inside the `.svelte` component.**
*For:* fewer files; state and view sit together, which for a game loop is
genuinely natural in Svelte.
*Against:* the rules become untestable by vitest, so the diff-coverage gate
would be satisfied by whatever `.ts` happened to change — a false green. It
also pushes every game toward an 800-line component, against
`coding-style.md`'s 200–400 line norm.

**Verdict: A.** *Deciding factor:* coverage instrumentation is
extension-scoped, so B makes the phase's core correctness (does a mine get
placed under the first click? is this Klondike move legal?) structurally
invisible to the unit suite.

### D2 — Start-menu entries

**Option A — replace the four `placeholder_entry(...)` calls with real
`path:` rows.**
*For:* the flyout, its ordering and its `top: '-40px'` offset already exist and
are already covered by `start_menu_programs.test.ts`; this is a four-line diff.
*Against:* none identified.

**Option B — add new entries and leave the placeholders.**
*For:* nothing.
*Against:* duplicate menu items.

**Verdict: A — no alternatives, forced by the shipped shape of
`start_menu_programs.ts:111-119`.**

### D3 — Do the games get VFS `.exe` entries?

The mechanism exists: `scripts/vfs-base.json` holds
`{"storage_type": "fake", "url": "./programs/my_computer.svelte", "ext": ".exe"}`
items, which is how the desktop icons launch.

**Option A — no VFS presence. Start menu only.**
*For:* `C:\`'s twelve children are each a CV section or a shell folder (§2.6);
`Games` at that level competes with `Experience` and `Projects` for a
recruiter's attention on the one screen this site exists to control. Costs
nothing: XP's own Start menu is where games live. Mints no seed ids, so no
`retired_seed_ids.json` churn and no `SEED_VERSION` bump for returning
visitors.
*Against:* CMD and Explorer cannot reach the games, so `cd Games` and
`ls` do not show them — a small inconsistency with Python, which does have a
`My Documents\Python` folder.

**Option B — a `C:\Games\` folder holding four fake `.exe`s.**
*For:* discoverable from Explorer and CMD; consistent with the desktop `.exe`
pattern; reinforces "this is a real filesystem".
*Against:* puts a games folder in the root of a portfolio drive, above the
fold, next to `Experience`. Adds five seed items and a `SEED_VERSION` bump.

**Option C — desktop icons.**
*For:* one click.
*Against:* §3.5 curates the desktop to five icons plus Recycle Bin. Out by
spec.

**Verdict: A.** *Deciding factor:* `C:\` root is the portfolio's own
information architecture, not a general-purpose drive, and Phase 4 is the
first content that is not part of the CV. The Python precedent actually
supports this — Python's folder is at `My Documents\Python` because it holds
the user's *scripts*, not because the program needed a home. **What A gives
up, explicitly:** CMD/Explorer discoverability of games; revisit in Phase 6 if
the owner wants it.

### D4 — Minesweeper window sizing across three difficulties

Beginner 9×9, Intermediate 16×16, Expert 30×16. At XP's 16px cells that is
144×144 / 256×256 / 480×256 for the grid alone.

**Option A — non-resizable window that re-sizes itself when difficulty
changes.**
*For:* exactly what real XP Minesweeper does — the window is fixed and snaps to
the board. Highest fidelity, which is the project's whole premise.
*Against:* requires writing `options.width/height` at runtime and having
`Window.svelte` honour it after mount. Not yet proven — **Spike 1**.

**Option B — resizable window, board centred on the felt.**
*For:* no runtime-resize risk; falls out of existing `WindowOptions`.
*Against:* wrong. XP Minesweeper cannot be resized, and a board floating in a
grey void is the single most obvious "this is a web page" tell in the phase.

**Option C — fixed at Expert size for all difficulties.**
*For:* trivially simple.
*Against:* Beginner in a 480px window is visibly wrong and wastes two thirds of
the window.

**Verdict: A, contingent on Spike 1.** *Deciding factor:* fidelity is the
product. If Spike 1 shows `Window.svelte` cannot be driven after mount, the
fallback is A-with-remount (close and reopen the window on difficulty change),
not B.

### D5 — Minesweeper first-click safety

**Option A — place mines after the first click, excluding that cell.**
*For:* XP's actual behaviour; losing on click one is indefensible.
*Against:* mine placement is no longer a pure `new_board()` — it needs the
first coordinate. (Mitigated: it stays a pure function, just with one more
argument, so it is still unit-testable.)

**Option B — place mines up front, and if the first click is a mine, move it.**
*For:* the classic Minesweeper 1.x implementation; the board exists before the
first click, which is marginally simpler state.
*Against:* relocating a mine changes neighbour counts around two cells, which
is a fiddlier invariant to test than "these coordinates were excluded".

**Option C — exclude the first cell *and its eight neighbours* (Win7+
behaviour: guarantees an opening).**
*For:* a nicer first move.
*Against:* not XP. Expert is 99 mines in 480 cells; excluding nine cells is a
measurable difficulty change and would make the board differ from the real
game.

**Verdict: A.** *Deciding factor:* it is XP's behaviour, and it expresses the
invariant the unit test wants to assert directly ("no mine at the first click")
rather than through a repair step.

### D6 — Solitaire: own implementation vs a library

§3.3 explicitly offers "adopt an MIT-licensed Klondike library".

**Option A — own implementation in `src/lib/games/solitaire/`.**
*For:* Klondike rules are small (~200 lines: seven tableaus, four foundations,
a stock/waste with draw-3, alternating-colour descending builds). The win
animation, the green felt, the XP card backs and the drag feel are the entire
point and would all be fought against in a library. No new dependency, no
licence to audit, and the rules land in vitest.
*Against:* more code than `npm i`; edge cases (draw-3 waste recycling,
auto-complete detection) must be got right ourselves.

**Option B — an MIT Klondike library.**
*For:* rules are someone else's problem and are probably better tested.
*Against:* every such library ships its own DOM and its own card rendering, so
the XP skin becomes a fight with the library's CSS; it adds a dependency the
repo would then have to keep on the npm-10 lockfile treadmill; and the phase's
testable surface moves into `node_modules`, where diff-coverage cannot see it.
Phase 0 pruned the base's CrazyGames solitaire embed for adjacent reasons.

**Verdict: A.** *Deciding factor:* the deliverable is *XP's* Solitaire, and in
a card game the presentation is ~80% of the work — a library would supply the
20% we can most easily test ourselves while obstructing the 80%.

### D7 — Solitaire: drag mechanism

**Option A — Pointer Events (`pointerdown`/`move`/`up` + `setPointerCapture`).**
*For:* one code path for mouse and pen; capture makes drags survive leaving the
element; full control of the drag image, which for a card *stack* (dragging
seven cards as a unit) is mandatory.
*Against:* we implement hit-testing and drop targets ourselves.

**Option B — HTML5 drag-and-drop.**
*For:* browser supplies the drag lifecycle.
*Against:* the drag image is a single element, so a multi-card stack drag is
not expressible without a canvas hack; it does not fire on touch at all; and
`dragstart` inside a window the manager is also tracking for movement is a
known source of conflict.

**Option C — jQuery UI draggable (already loaded, used by the window manager).**
*For:* zero new bytes; already a proven dependency in this app.
*Against:* jQuery UI mutates DOM it owns, which fights Svelte's rendering, and
the window manager's own draggable would need careful scoping to not capture
card drags.

**Verdict: A.** *Deciding factor:* dragging a run of cards as one unit is a
core Klondike interaction and B cannot express it. **What A gives up:** we own
the hit-testing, roughly 60 lines.

### D8 — Card face artwork

**Option A — a public-domain vector deck (Byron Knoll's
`vector-playing-cards`), vendored under `static/assets/cards/`.**
*For:* the standard choice for exactly this; scales cleanly; if genuinely
public domain it adds nothing to the notices file.
*Against:* **the licence claim must be verified before use, not assumed** —
this is listed as a gate-5 blocking check, not a fact.

**Option B — draw the faces ourselves as SVG (pip layouts + simple court
cards).**
*For:* no provenance question at all; tiny.
*Against:* court cards drawn by hand look wrong in a way players notice
immediately, and it is a day of illustration work inside a code phase.

**Option C — XP's own `cards.dll` artwork.**
*For:* perfect fidelity.
*Against:* Microsoft copyright, not licensed for redistribution. **Excluded.**

**Verdict: A, with B as the named fallback if provenance does not check out.**
*Deciding factor:* C is unavailable on licence grounds and B costs
disproportionate effort, so A is the only option that delivers recognisable
cards — but it converts into a verification task rather than an assumption.

### D9 — DOOM: which js-dos layer

**Option A — `emulators.js` only (the low layer), with our own XP chrome.**
*For:* verified in §2.1 to make no third-party request, so `no_cdn.spec.ts`
stays green; we render frames to our own `<canvas>` and own the window
furniture, which is what every other program in this app does.
*Against:* we write the canvas blit, the keyboard mapping and the audio sink
ourselves — roughly 150 lines that `js-dos.js` would have supplied.

**Option B — `js-dos.js` (the full UI layer).**
*For:* turnkey; ships its own controls, save states and file explorer.
*Against:* it hardcodes `br.cdn.dos.zone` ×10, `net.dos.zone`, `v8.js-dos.com`
and a Yandex API gateway (§2.1), so it fails `no_cdn.spec.ts` and puts
third-party network calls in a portfolio; and it paints its own purple,
non-XP UI inside an XP window.

**Verdict: A.** *Deciding factor:* B is disqualified outright by the origin
allowlist, before the fidelity argument is even reached.

### D10 — DOOM: worker vs main-thread backend

**Option A — `emulators.dosboxWorker(bundle)`.**
*For:* DOSBox is a hard real-time loop; on the main thread it would compete
with the window manager's drag/resize, the taskbar clock and every other open
program. Phase 3 measured exactly this failure mode for Pyodide: a 3s busy
loop in a bare sandboxed frame let the parent tick 21 times against ~320
expected. Same reasoning, same verdict.
*Against:* frames and audio cross a postMessage boundary; `onFrame` hands back
an RGBA `Uint8Array` per frame, which must be blitted without copying more than
necessary.

**Option B — `emulators.dosboxDirect(bundle)`.**
*For:* no message-passing; simplest possible wiring.
*Against:* freezes the entire desktop while DOOM runs. Unacceptable in a shell
whose whole premise is that other windows keep working.

**Verdict: A.** *Deciding factor:* the desktop must stay responsive while a
game runs — that is what makes this a window manager rather than a game page.
*Inherited reasoning:* Phase 3's Python worker decision, measured there.

### D11 — DOOM: the game bundle

js-dos consumes a `.jsdos` file — a zip containing `.jsdos/dosbox.conf` plus
the DOS program.

**Option A — commit a prebuilt `static/games/doom/doom.jsdos`, with a
`docs/` note recording exactly how it was assembled.**
*For:* the build stays hermetic and reproducible on a CI runner with no
network; `npm run build` does not have to construct a zip; the artefact that
ships is the artefact that was reviewed.
*Against:* a binary blob in git that a reviewer cannot diff; the assembly
recipe lives in prose rather than in code.

**Option B — a `scripts/build-doom-bundle.ts` that zips the WAD at build time.**
*For:* the recipe is executable and reviewable.
*Against:* the WAD has to be committed anyway (it is the bulk of the bytes), so
this adds a build step and a `SEED_VERSION`-adjacent freshness question while
removing nothing from git.

**Verdict: A.** *Deciding factor:* B does not remove the binary from the repo,
so it buys reviewability of the wrapper while paying a build step — and this
repo already has a generated-file freshness gate it would have to be reconciled
with. The id Software shareware notice ships in the same folder.

### D12 — DOOM: "fullscreen toggle" (§9)

**Option A — the browser Fullscreen API on the window's content element.**
*For:* it is what "fullscreen" means, and DOOM at 320×200 upscaled to a real
display is the point of the feature; `Escape` returns.
*Against:* leaves the XP illusion entirely for the duration.

**Option B — maximize the XP window instead.**
*For:* stays inside the fiction.
*Against:* the maximize button already does this, so the feature would be a
second button that duplicates an existing one — a dead control, which this repo
explicitly does not ship ("No dead controls", §Phase-2 note).

**Verdict: A.** *Deciding factor:* B is indistinguishable from the maximize
button that already exists, which makes it not a feature.

### D13 — Chess: hosting Stockfish

**Option A — vendor `stockfish.wasm` + `stockfish.wasm.js` to
`static/js/stockfish/`, mirroring `static/js/three/`.**
*For:* the pattern is established and has a test (`vendored_three.test.ts`
pins the bytes) and a `netlify.toml` immutable `Cache-Control` block; keeps
`no_cdn.spec.ts` green; version is pinned by the path.
*Against:* 640K in git.
**Option B — load from a CDN.**
*For:* no bytes in git.
*Against:* fails `no_cdn.spec.ts`, and `docs/cdn-removal-plan.md` exists
precisely to remove origins we cannot pin by hash.
**Verdict: A — forced by the origin allowlist in `e2e/no_cdn.spec.ts`.**

### D14 — Chess: how the engine is weakened

**Option A — UCI `setoption name Skill Level value N` plus a capped
`go depth`, mapped from three difficulty levels.**
*For:* `Skill Level` is Stockfish's own designed-for-this knob (verified
present in the shipped `.wasm`); at low values it deliberately picks non-best
moves, which reads as a human-like mistake rather than a stalled engine. The
level→(skill, depth) mapping is a pure function and unit-testable.
*Against:* even Skill Level 0 is stronger than most casual players; "Easy"
will still beat many visitors.
**Option B — cap search depth only.**
*For:* one option.
*Against:* a depth-1 Stockfish plays greedy, ugly, obviously-broken chess — it
hangs pieces to grab a pawn. Reads as a bug, not as an easy opponent.
**Option C — `UCI_LimitStrength` / `UCI_Elo`.**
*For:* the most intuitive dial.
*Against:* **not present in SF10** — grepping the shipped `.wasm` finds
`Skill Level` and `MultiPV` but no `UCI_Elo`. Unavailable.
**Verdict: A.** *Deciding factor:* C does not exist in this build and B
produces moves that look like a defect.

### D15 — Chess: piece artwork

**Option A — the Cburnett SVG set (Wikimedia; CC BY-SA 3.0 / GFDL / GPL).**
*For:* the set nearly every chess site uses, so it reads as "chess pieces"
instantly; vector, so it scales to any board size.
*Against:* attribution and share-alike on the artwork — one more entry in
`LICENSE-third-party.md`. (Share-alike binds the images, not our code.)
**Option B — draw pieces as glyphs (the Unicode chess characters).**
*For:* zero assets, zero licence.
*Against:* renders differently on every OS and looks like a text document.
**Option C — match XP exactly.**
*For:* fidelity.
*Against:* **XP shipped no chess game** — Chess Titans is Vista. §3.3's
"classic Windows chess" has no XP referent, so there is nothing to match.
**Verdict: A.** *Deciding factor:* C's target does not exist, and B is
visibly not a chess set. The owner has already accepted a third-party notices
file, so A's cost is one more row in it.

### D16 — Chess: two-player local mode

§3.3 offers it as an alternative ("Or: two-player local mode").

**Option A — ship both: an opponent selector (Computer / Two players).**
*For:* once a legal-move board exists, "don't ask the engine for a reply" is a
branch, not a feature; it also gives the E2E suite a way to exercise the board
without waiting on Stockfish.
*Against:* one more UI control and one more state to test.
**Option B — computer only.**
*For:* less surface.
*Against:* throws away a nearly-free mode and makes every board test depend on
the engine.
**Verdict: A.** *Deciding factor:* it makes the board independently testable,
which is worth more than it costs.

### D17 — Mobile

**Verdict: games are excluded on mobile portrait — inherited from §4.6,
alternatives weighed there** ("What's deferred on mobile (portrait): … Games
(DOOM, Minesweeper, Solitaire, Chess)"). The one obligation this phase carries
is that `APP_REGISTRY`'s lazy `component: () => import(...)` must be preserved
so no game code, and neither WASM runtime, enters the mobile bundle.

### D18 — `netlify.toml`

**Verdict: add immutable `Cache-Control` blocks for `/js/stockfish/*` and
`/games/*`, and add nothing else — no CSP change is required (§2.2).** Both
new blocks name only `Cache-Control`, so the `/*` CSP still applies, and both
must be declared **before** the `/html/python-sandbox.html` block, which
carries a "KEEP THIS BLOCK LAST" warning because Netlify resolves duplicate
header names last-rule-wins rather than most-specific-wins. *No alternatives —
forced by the documented ordering rule at `netlify.toml:60-75`.*

### D19 — Test strategy and the CI runtime budget

**Option A — all four games hermetic in the `default` Playwright project.**
*For:* they are genuinely hermetic once self-hosted (§2.5), and `default` is
what runs on every PR, so regressions are caught before `dev`.
*Against:* booting DOSBox and instantiating Stockfish on a 2-core CI runner
adds real wall-clock to every PR.
**Option B — tag the heavy game specs `@online`.**
*For:* keeps PR CI fast.
*Against:* `@online` only runs on cutovers (`github.base_ref == 'main'`), so a
DOOM regression would be found at the last possible moment — the exact failure
mode the cutover flow exists to avoid. It would also be a lie: the tag means
"needs the network", and these do not.
**Verdict: A, with a per-game budget.** *Deciding factor:* B mislabels
hermetic tests and defers the failure to the riskiest moment. **What A gives
up:** PR CI gets slower; the mitigation is that each game's E2E asserts
*reaching a playable state and one interaction*, not a full playthrough, and
DOOM's spec asserts that the first frame renders rather than that the menu is
navigable.

Layers:
- **vitest** (`src/lib/games/**`): mine placement excludes the first click;
  flood-fill reveal; win/lose detection; flag counting. Klondike move legality;
  draw-3 waste recycling; auto-complete detection; win detection. Chess
  difficulty→UCI mapping; UCI line parsing (`bestmove`, `info`).
- **Playwright** (`default`): each game opens from All Programs with the right
  title and icon; Minesweeper reveals a cell and the counter changes;
  Solitaire deals 28 cards and one drag succeeds; Chess makes a legal move and
  the engine answers; DOOM renders a non-blank first frame.
- **`no_cdn.spec.ts`**: extended so opening each game is covered by the
  allowlist assertion. This is the guard that would catch a js-dos or
  Stockfish URL slipping back in.
- **Mutation testing** on every behaviour change, per the repo's standing rule:
  revert the fix, confirm the test goes red.

### D20 — `LICENSE-third-party.md`

**Verdict: a new top-level file, plus a scope line in `LICENSE`. No
alternatives — forced by GPL-2 §6 / GPL-3 §10**, which forbid imposing further
restrictions on the covered works, while `LICENSE` currently forbids
redistribution of everything in the repo. Shape follows the existing
`LICENSE-win32.run` precedent. It must name, for each component: the files as
they ship, the licence, the upstream source URL, and the version/tag that
constitutes the corresponding source.

Entries: js-dos / DOSBox (GPL-2.0); DOOM shareware WAD + executable (id
Software shareware licence — **verbatim, unmodified**, notice included);
Stockfish 10 via `stockfish.js` (GPL-3.0, `Copying.txt` shipped); card
artwork (D8, pending verification); Cburnett chess pieces (CC BY-SA 3.0).

---

## 4. Out of scope (deliberately)

- **Networked or multiplayer anything.** No IPX, no `sockdrive`, no cloud
  saves — `sockdrive.js` is simply not vendored.
- **Save states / persisted game progress.** Not in §9. Each window starts a
  fresh game.
- **High-score tables.** XP Minesweeper has one; it is not in §9 and would need
  a persistence decision of its own.
- **Games on mobile** (D17).
- **Games in the VFS** (D3) — named as a possible Phase 6 item.
- **Migrating the 20 inherited `launch()` branches** to `APP_REGISTRY` — Phase
  6 work per `app_registry.ts`'s own header comment.
- **DOOM beyond the shareware episode.** Only `DOOM1.WAD`.

## 5. Spikes to run before the plan is final

These are the three places the plan's sequencing depends on an unverified
mechanism. Each is a timeboxed check, not a task.

1. **`Window.svelte` runtime resize** (blocks D4). Can a mounted window be
   driven to a new `width`/`height` after mount via its `options`, and does the
   chrome follow? If not, D4 falls back to remount-on-difficulty-change.
2. **Stockfish worker instantiation** (blocks D13/D14). Which file is the
   worker entry — `stockfish.wasm.js` directly, or `stockfish.js` with a WASM
   feature test — and does it resolve `stockfish.wasm` relative to its own URL
   when served from `/js/stockfish/`?
3. **`emulators.js` module shape** (blocks D9/D10). It is a UMD/IIFE that
   defines a global rather than an ES module. Determine how it is loaded from a
   Svelte component (injected `<script>` on demand, matching the jspaint/loadjs
   precedent) and how `pathPrefix` is set before first use.

## 6. Verification gates specific to this phase

- **Asset provenance** (D8, D20): the card deck's public-domain claim and the
  DOOM shareware redistribution terms are **checked against the upstream
  licence text before the assets are committed**, not after. If either does not
  hold, the named fallback applies (D8 → option B; DOOM → back to the owner).
- **Deploy probe:** `netlify.toml` changes cannot be seen by any local gate
  (`vite preview` does not apply the file). After the cutover, probe the
  production host for the new `Cache-Control` headers *and* re-confirm the
  `/` and `/html/python-sandbox.html` CSPs are still intact — the ordering
  rule means a new block can silently disable an existing policy.
- **Bundle budget:** confirm no game code and neither WASM runtime appears in
  the entry chunk or the mobile path.

## 7. Exit criteria for the phase

1. All four games open from Start ▸ All Programs ▸ Games and are playable in
   XP windows (§9).
2. Minesweeper has three difficulties, a timer, a mine counter and the smiley
   button; right-click flags; the first click is never a mine.
3. Solitaire deals Klondike, drags stacks, auto-completes, and animates a win.
4. Chess plays a legal game against a weakened Stockfish, with a two-player
   mode, and never blocks the desktop.
5. DOOM boots the shareware episode, takes keyboard input, has audio wired to
   `systemVolume`, and toggles fullscreen.
6. `no_cdn.spec.ts` passes with all four games opened — no new origin.
7. `LICENSE-third-party.md` exists and names every vendored component with its
   licence and upstream source; `LICENSE` carries the carve-out line.
8. All gates green: `npm run check`, `lint`, `format:check`,
   `vitest run --coverage` (diff-coverage ≥80% on changed lines), `build`,
   `playwright test --project=default`.

---

# Part B — corrections and additions after gate 2

The red team's findings and dispositions are in `docs/phase-4-redteam-spec.md`.
Three sub-decisions were graded Weak; ten missing sub-decisions were found.
Nothing was rejected. Corrections to Part A are stated here rather than edited
in place, so the reviewed version stays readable.

Also folded in: the three spikes from §5 and the two provenance checks from §6
were executed during gate 2. Results are noted against the decisions they
resolve.

## Corrections to Part A

- **D1** — amended. The verdict stands, but "pure functions" did not cover the
  worker adapters, which is where message-ordering and timeout bugs live. The
  DOSBox and Stockfish adapters are named files
  (`src/lib/games/doom/dosbox_adapter.ts`, `src/lib/games/chess/engine.ts`) and
  get integration-style vitest coverage against a mocked `postMessage`, not
  just the parsers either side of them.
- **D3** — amended with a benefit it did not claim: because games never open
  through Explorer, the "File Transfer" one-time dialog that CLAUDE.md names as
  an E2E trap cannot fire for game specs. No defensive dismiss step is needed;
  adding one would be dead code.
- **D4** — verdict **stands**, mechanism **replaced**. Spike 1 concluded there
  was no jQuery UI conflict; that conclusion is void because it tested a
  hand-built options object rather than the registry output (see D21). The
  correct mechanism is D21's passthrough plus reassignment of the component's
  `options` variable.
- **D7** — strengthened, not changed: `Window.svelte:325` scopes jQuery UI
  draggable to `handle: '.titlebar'`, so pointer capture in the content area
  cannot fight it. D7 also satisfies §4.6's pointer/touch requirement for
  ≥1024px touch devices for free.
- **D8** — provenance **cleared**. The deck is public domain, WTFPL offered as
  a fallback where public domain is not recognised; no attribution required.
  Fallback option B is not needed.
- **D11** — provenance **cleared with a stated caveat**. Free redistribution is
  granted ("you may make copies of the Software to give to other persons",
  barred only from charging consideration). The formal text does not explicitly
  address extracting the WAD from its original archive; the precedent relied on
  is Debian/Ubuntu's `doom-wad-shareware` package, which does exactly that.
  `LICENSE-third-party.md` states the ambiguity and the precedent rather than
  asserting a clean grant. Bundle contents stay byte-identical to upstream.
- **D14** — upgraded from argued to **proven**. The engine was driven over UCI
  during gate 2. It advertises exactly one strength knob,
  `option name Skill Level type spin default 20 min 0 max 20`; there is no
  `UCI_Elo` and no `UCI_LimitStrength`, so option C is disproven rather than
  doubted. At Skill Level 0 / depth 6 it answered 1.e4 with 1...e6, a normal
  French Defence — the evidence for "weaker human, not visible bug".
- **D20** — **factual correction**. The engine identifies itself as
  `Stockfish 2019-08-15 Multi-Variant`, the ddugovic multi-variant fork, not
  vanilla Stockfish 10. The notices file must name that fork as the
  corresponding source; pointing at official-stockfish/Stockfish would make the
  GPL source pointer wrong.
- **D19** — flake mitigation **replaced** by D31. Shrinking assertions does not
  address CPU contention, which `playwright.config.ts:10-18` documents as the
  actual cause.

Spike 2 and 3 results (worker entry, `pathPrefix`, module shape) are
implementation detail and carry into the plan unchanged.

---

## D21 — Registry passthrough for window chrome

**The problem:** `app_registry.ts:167` sets `resizable: true` unconditionally,
inside the object its own comment says replaces the component's default
wholesale. `AppDefinition` has no `resizable`, `aspect_ratio` or
`maximize_btn`. D4, D9 and D12 all need at least one of them.

**Option A — add optional `resizable?`, `aspect_ratio?`, `maximize_btn?` to
`AppDefinition`, honoured by `to_window_options()`, with `resizable` defaulting
to `true`.**
*For:* one typed place; the default preserves today's output byte-for-byte, so
no shipped window changes; unblocks three decisions at once; moves in the same
direction as the Phase 6 migration that wants *more* apps on the registry.
*Against:* widens a contract Phase 3 deliberately kept minimal — three optional
fields that only games use today.

**Option B — launch games through the inherited `launch()` if-chain instead.**
*For:* no registry change.
*Against:* `app_registry.ts:1-25` exists precisely because that if-chain has no
`else` and silently no-ops on a typo, and lists forgotten taskbar registration
as this repo's most-repeated defect. Deliberately walking back into it to avoid
three optional fields is the wrong trade.

**Option C — let the component override `options` after mount.**
*For:* no registry change.
*Against:* does not work. `setup_gestures()` reads `options.resizable` during
mount and has already called `jQuery(el).resizable(...)` by the time the
component could intervene; undoing it means tearing down a jQuery UI plugin
instance. Fragile, and invisible to type-checking.

**Verdict: A.** *Deciding factor:* C is defeated by mount ordering and B
reverses the architecture's direction, so A is the only option that works —
and its default keeps every shipped window identical.

## D22 — Teardown contract for heavy runtimes

**Option A — every game's `destroy()` releases what it owns, explicitly:
`ci.exit()` then `worker.terminate()` for DOOM, `worker.terminate()` for the
chess engine, `ctx.close()` for any AudioContext, `cancelAnimationFrame` for
any loop, `URL.revokeObjectURL` for any blob.**
*For:* this is the shipped pattern, twice — `python.svelte` disposes its client
and `music_player.svelte` cancels its rAF, closes its context and revokes its
URLs. Without it, opening and closing DOOM three times leaks three DOSBox
workers and three WASM heaps, and the tab dies.
*Against:* none. Omitting teardown is not a simpler design, it is a defect.

**Verdict: A — inherited from Phase 3, alternatives weighed there.** Added to
the exit criteria so it is checked rather than assumed.

## D23 — Singleton policy, per game

**Option A — Minesweeper and Solitaire multi-instance; Chess and DOOM
singletons.**
*For:* exactly the distinction `app_registry.ts:97-111` already draws between
CMD ("multi-instance on purpose: a second terminal is cheap") and Python
("SINGLETON … each instance owns its own runtime … three Start-Menu clicks is
a tab kill"). Minesweeper and Solitaire are pure DOM and cost nothing to
duplicate; a second DOOM is a second x86 emulator and a second WASM heap, and a
second Chess is a second engine worker.
*Against:* a visitor cannot compare two chess positions side by side. Trivial.

**Option B — all four singletons.**
*For:* uniform, least memory.
*Against:* two Minesweeper boards is a normal thing to want and costs nothing;
making it impossible is a fidelity loss for no gain.

**Option C — all four multi-instance.**
*For:* uniform the other way.
*Against:* the Python precedent says why this fails on a mid-range phone —
except games are desktop-only (D17), so the argument is weaker here. Still
loses on DOOM, where two emulators contend for CPU.

**Verdict: A.** *Deciding factor:* the CMD/Python split already encodes the
right rule — cheap programs multiply, runtime-owning programs do not — and
these four fall cleanly on either side of it. **Also required per game:**
`taskbar` left at its default `true`, verified rather than assumed, because
omitting it is the defect `app_registry.ts:9-12` names eight times.

## D24 — What happens to a running game when its window is minimized

Verified: `Window.svelte:206-221` applies a transform and sets
`minimized = true`. It does not unmount and does not pause.

**Option A — pause the emulator on minimize, resume on restore; mute while
minimized.**
*For:* `CommandInterface` exposes `pause()`, `resume()`, `mute()` and
`unmute()` as first-class methods, so this is four lines. Leaving it out
contradicts D10's own rationale: the reason DOSBox is on a worker is to keep
the desktop responsive, and a minimized-but-running DOOM saturates a core for a
window nobody can see — on a laptop, audibly.
*Against:* a player who minimizes mid-firefight returns to a paused game rather
than a dead one. That is the better outcome anyway.

**Option B — keep running.**
*For:* matches a real OS, where minimizing does not pause.
*Against:* a real OS is not running an x86 emulator inside a browser tab that
also has to keep a window manager smooth.

**Verdict: A for DOOM.** Chess needs nothing: its worker is only busy between
`go` and `bestmove`. Minesweeper's timer keeps running, as it does in XP.
*Deciding factor:* `pause()`/`resume()` already exist on the interface, so the
cost is negligible against a real CPU burn.

## D25 — Keyboard focus and Escape routing

**The problem:** at least six components bind `svelte:window` Escape handlers
(Menu, Dialog, start menu, my_computer, ContextMenu, …), nothing in
`Window.svelte` gives window *content* DOM focus, and DOOM needs raw keys
including Escape for its own menu.

**Option A — give the DOOM surface `tabindex="0"`, focus it when the window
gains focus, and have its own `keydown`/`keyup` call `stopPropagation()` (plus
`preventDefault()` for keys the browser would otherwise act on) so desktop
handlers never see game input. Escape reaches DOOM only when not in
fullscreen; in fullscreen the browser owns Escape, and DOOM's menu is reached
from an on-screen button in the window chrome.**
*For:* precise and local — the desktop's Escape keeps working everywhere else,
because the handlers are only bypassed while the game surface holds focus.
Uses standard DOM event flow.
*Against:* the fullscreen/Escape split is a genuine wart: the same key does two
different things depending on a mode the player may not be tracking.

**Option B — `navigator.keyboard.lock(['Escape'])` while fullscreen.**
*For:* Escape would reach DOOM in fullscreen, removing the wart entirely.
*Against:* Keyboard Lock is Chromium-only; Firefox and Safari ignore it. Making
DOOM's only route to its own menu depend on it means the menu is unreachable in
fullscreen for two of three engines. **Rejected** — but it is a legitimate
progressive enhancement to layer on later, never a load-bearing mechanism.

**Option C — do not capture keys; let events bubble.**
*For:* nothing to write.
*Against:* pressing Escape in DOOM would close the Start menu, and movement
keys would leak into whatever else listens. Non-viable.

**Verdict: A.** *Deciding factor:* B is unavailable on two of three engines,
and the on-screen menu button makes A's wart survivable while keeping the
desktop's own Escape semantics intact.

## D26 — AudioContext and the autoplay policy

**Option A — a "Click to start" overlay inside the DOOM window; the
AudioContext is constructed synchronously in that click handler, and the
emulator boot is kicked off from the same gesture.**
*For:* `music_player.svelte:310-314` already documents the constraint in this
codebase — a context created outside a gesture starts suspended and plays
silently. An overlay is also the natural place to defer the ~1.8MB js-dos
download plus the WAD until the visitor actually wants DOOM, rather than on
window open.
*Against:* one extra click before the game starts. DOS games opened from a menu
screen anyway, so this reads as period-appropriate rather than as friction.

**Option B — start on window open and call `ctx.resume()` on the first
interaction.**
*For:* no overlay.
*Against:* the first frames play silently with no explanation, and the download
starts for anyone who opens the window to look at it.

**Verdict: A.** *Deciding factor:* the repo has already been bitten by exactly
this and wrote the reason down; A also removes an unconditional multi-megabyte
download.

## D27 — Reactive wiring at the component boundary

CLAUDE.md documents that in Svelte 5 legacy mode, state written from inside a
`$:` block does **not** invalidate other `$:` blocks — it shipped once already
as the Music Player's wrong title.

**Option A — game state is a plain value produced by `src/lib/games/**`
reducers; the component holds `let state` and **reassigns** it
(`state = reduce(state, action)`) from event handlers and timers only. `$:` is
used for read-only derivations and never writes state. Timers start in
`onMount`.**
*For:* sidesteps the documented trap by construction rather than by discipline;
the reducer shape is exactly what D1 needs for unit coverage; one-shot setup in
`onMount` is what CLAUDE.md prescribes.
*Against:* marginally more verbose than `$: won = check(board)` — though that
form stays legal, because it only reads.

**Option B — derive and write inside `$:`.**
*For:* shorter.
*Against:* reproduces the shipped bug. A win-detection `$:` that sets
`game_over`, plus a second `$:` reading `game_over` to stop the timer, is the
exact documented failure: the write lands and the sibling stays frozen, with no
error and no warning.

**Verdict: A.** *Deciding factor:* B is a known-shipped defect in this
codebase, not a hypothetical.

## D28 — `prefers-reduced-motion` and the Solitaire win animation

**Option A — honour `prefers-reduced-motion: reduce`: no bouncing cards, a
static win state instead.**
*For:* a full-screen cascade of bouncing cards is close to the canonical
example of motion that triggers vestibular discomfort; the media query costs
one CSS block.
*Against:* the win animation is the single most recognisable thing about XP
Solitaire, and a visitor who set the preference OS-wide for other reasons loses
it. Mitigated: they still get a clear win state, and the preference is theirs.

**Verdict: A.** *Deciding factor:* one CSS block against a known accessibility
harm is not a close call.

## D29 — New npm dependencies and the lockfile

**New this phase:** `chess.js` (runtime dependency, BSD-2-Clause, 1.4.0) and
`stockfish.js` (dev-only, pinned exactly — see D30).

**CLAUDE.md hard rule, now an explicit action item rather than an assumption:**
after *any* `package.json` or lockfile change, regenerate with
`npx -y npm@10 install`. CI runs `npm ci` under npm 10 (Node 22) and a lock
written by npm 11+ fails it. This applies to each dependency addition
separately, not once at the end.

*No alternatives — forced by CLAUDE.md.* Recorded because the spec's first
draft mentioned the rule only as an argument against an already-rejected
option, which is how an action item goes missing.

## D30 — How the vendored binaries are pinned

D13 said "mirror `static/js/three/`". That pattern's own test header states
`three` "is a pinned devDependency purely so this comparison has something to
compare against". Applied literally to both new vendors, that means pinning
`js-dos` too.

**Option A — pin `stockfish.js` as an exact devDependency with a
byte-identity test mirroring `vendored_three.test.ts`; pin the js-dos files and
the `.jsdos` bundle with a committed SHA-256 manifest instead.**
*For:* `stockfish.js` is 2.3MB unpacked, so the three.js pattern applies
cleanly and proves provenance, not merely stability. `js-dos` is **29MB
unpacked** for the 1.8MB we actually ship — paying that on every `npm ci` in CI
to verify five files is a bad trade, and a checksum manifest catches the thing
that actually goes wrong (silent drift of a committed binary). The `.jsdos`
bundle has no npm upstream at all, so a manifest is the only option for it
regardless.
*Against:* two mechanisms instead of one, and the manifest proves stability
rather than provenance — it cannot tell you the bytes came from upstream, only
that nobody changed them since. Provenance for those files is carried by
`LICENSE-third-party.md` recording the exact version and source URL.

**Option B — pin both as devDependencies, one mechanism.**
*For:* uniform; both get genuine provenance.
*Against:* 29MB added to every CI install to verify 1.8MB of files, and it
still leaves the `.jsdos` bundle unpinned because it is not an npm artefact.
So it pays the cost and does not actually achieve uniformity.

**Option C — no pinning; rely on review.**
*For:* nothing.
*Against:* this is precisely what `vendored_three.test.ts` exists to prevent,
and a committed binary blob is the case where review is weakest.

**Verdict: A.** *Deciding factor:* B's uniformity is illusory — the `.jsdos`
bundle needs a manifest either way — so B pays 29MB per CI run for nothing.
**What A gives up, explicitly:** the js-dos files get drift protection, not
provenance proof; the notices file carries the provenance claim instead.

## D31 — How the heavy game specs run in CI

`playwright.config.ts:10-18` records that the `default` project, on the exact
2-core CI configuration, "still flaked one run in three here", that failures
"follow overall machine load … not worker count", and that each passes in
isolation. Phase 4 adds two WASM-boot-heavy specs to that pool.

**Option A — a third Playwright project `heavy` (`grep: /@heavy/`, `workers:
1`), excluded from `default` via its `grepInvert`, run as its own CI step after
`default` finishes. DOOM and the Chess-versus-engine spec are tagged `@heavy`;
Minesweeper, Solitaire and the Chess board-only spec stay in `default`.**
*For:* it attacks the documented cause — concurrent CPU pressure — rather than
the symptom, by guaranteeing the two expensive specs never run beside four
parallel siblings. Keeps every game on every PR, unlike `@online`. Serial
within the project also makes a genuine failure reproducible.
*Against:* a third project and a second CI step to maintain; total CI wall-clock
grows by the serial run.

**Option B — keep them in `default` with smaller assertions.** (Part A's
answer.)
*For:* no config change.
*Against:* shrinking assertions reduces wall-clock, not contention. The config's
own comment says load is the cause and that worker count is not. This mitigates
nothing.

**Option C — tag them `@online`.**
*For:* `default` stays fast.
*Against:* `@online` runs only on cutovers, so a DOOM regression surfaces at the
riskiest possible moment; and the tag would be false, since both are hermetic.

**Verdict: A.** *Deciding factor:* B is the only option that does not address
the documented cause, and C defers failures to the cutover. **What A gives up:**
CI gets slower by one serial project.

## Additions to the exit criteria (§7)

9. Every game registers in `runningPrograms` and gets a taskbar button —
   checked explicitly, per D23.
10. Opening and closing DOOM and Chess three times each leaves no live worker
    and no open AudioContext (D22).
11. A minimized DOOM window consumes no CPU (D24).
12. With the Start menu open, keys pressed inside DOOM do not close it; Escape
    outside a focused game still closes menus (D25).
13. `prefers-reduced-motion: reduce` suppresses the Solitaire win animation
    (D28).
14. `npx -y npm@10 install` has been run after every `package.json` change, and
    `npm ci` passes under npm 10 (D29).
