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
