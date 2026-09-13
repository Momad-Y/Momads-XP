# Phase 4 — Games: handoff guide

**Status:** complete on `dev`, awaiting the owner's cutover. Nothing here is in
production yet.

Gate artefacts: `docs/phase-4-spec.md` (Part A decisions D1–D20, Part B
corrections and D21–D31), `docs/phase-4-redteam-spec.md`,
`docs/phase-4-plan.md`, `docs/phase-4-redteam-plan.md`.

## 1. What shipped

Four real programs, replacing the four Start-menu placeholders:

| Game | Where the rules live | Notes |
| --- | --- | --- |
| Minesweeper | `src/lib/games/minesweeper/` | 3 difficulties, timer, mine counter, drawn XP flag/mine/faces. Fixed window that resizes to the board. |
| Solitaire | `src/lib/games/solitaire/` | Klondike, pointer-event drag of card runs, auto-complete, reduced-motion-aware win state. |
| Chess | `src/lib/games/chess/` | chess.js for legality, weakened Stockfish over UCI in a Worker, two-player mode. |
| DOOM | `src/lib/games/doom/` | js-dos emulator layer, shareware episode one, OffscreenCanvas rendering, fullscreen toggle. |

Every game registers in `src/lib/app_registry.ts`. Minesweeper and Solitaire
are multi-instance; Chess and DOOM are singletons because each owns a runtime.

## 2. Notes — read these before changing anything here

- **`to_window_options()` used to force `resizable: true`.** `AppDefinition`
  now carries `resizable`, `aspect_ratio` and `maximize_btn`. This matters more
  than it looks: `work_space.svelte:551` mounts a registered app with an
  explicit `options` prop, and Svelte replaces a component's own default
  **wholesale** rather than merging. A registry row without `default_size`
  therefore produces a window with *no width or height at all* —
  `style:width="undefinedpx"`, silently dropped, shrink-wrapping the content.
  A spike that builds its own `WindowOptions` object proves nothing about a
  registered app.
- **`stockfish.js@10.0.2` has no main-thread API.** The script assigns a global
  `onmessage` and calls a global `postMessage`; it only works as a Worker. It
  also finds its own `.wasm` beside itself, so serving from `/js/stockfish/`
  needs no configuration.
- **`Skill Level` is the only strength knob.** No `UCI_Elo`, no
  `UCI_LimitStrength` in this build. Capping depth alone is not a difficulty
  control — a depth-1 engine hangs pieces and reads as a bug.
- **`emulators.js` is UMD, not an ES module.** It assigns `window.emulators`,
  is declared in `src/app.d.ts` beside jQuery and loadjs, and its `pathPrefix`
  must be set **before** the first `dosboxWorker()` call — it is read at call
  time to build the `wdosbox.js` URL.
- **js-dos's worker transport never fires `onFrame`.** Measured: `onFrameSize`
  reports 640×400 then 320×200 while `onFrame` stays silent forever. Rendering
  goes through an OffscreenCanvas handed to the worker instead. Do not try to
  forward frames.
- **DOSBox aspect correction breaks js-dos.** With `aspect=true` the render
  height changes mid-stream and js-dos's own frame-line assembler throws
  `RangeError: offset is out of bounds` on every frame, from inside
  `emulators.js`. The bundle ships `aspect=false`; the 4:3 shape comes from the
  window's `aspect_ratio`.
- **NEVER ship `js-dos.js`.** That is the cloud UI layer and it hardcodes
  `br.cdn.dos.zone` (×10), `net.dos.zone`, `v8.js-dos.com` and a Yandex API
  gateway. Only the emulator layer is vendored, and
  `vendored_games.test.ts` asserts the UI layer's absence.
- **AudioContext must be built inside the gesture.** DOOM's start button
  constructs it synchronously before any `await`; one created after an await
  starts suspended and plays silently. `music_player.svelte:310-314` documents
  the same constraint.
- **The `heavy` Playwright project is hermetic.** The tag means *expensive*,
  not networked. It runs with `workers: 1` as its own CI step because
  `playwright.config.ts` records that `default` flakes about one run in three
  under CPU contention. Do not retag these `@online` — that project only runs
  on cutovers, so a regression would surface at the riskiest moment.
- **The placeholder mechanism is deleted.** `placeholder.svelte`,
  `placeholder.ts`, `placeholder_entry` and the `work_space` branch all went
  with DOOM. `NOT_PROGRAMS` documents components that "open from somewhere
  specific"; an unlaunchable one listed there would have been a lie. Git has it
  if a later phase wants it back.

## 3. Deploy probe — run this at the cutover

`netlify.toml` is invisible to every local gate: `vite preview` does not apply
it, so check/lint/vitest/build/playwright all stay green while production is
wrong. **Three new `[[headers]]` blocks landed this phase**, and Netlify
resolves duplicate header names **last-rule-wins**, so any of them could have
silently replaced an existing policy.

After deploying, against the production host (not the URL the CLI echoes):

1. `/js/stockfish/stockfish.wasm` → 200 and
   `Cache-Control: public, max-age=31536000, immutable`
2. `/js/js-dos/wdosbox.wasm` → 200 and the same header
3. `/games/doom/doom.jsdos` → 200 and the same header
4. **`/` still returns `Content-Security-Policy: frame-ancestors 'self'`**
5. **`/html/python-sandbox.html` still returns its full
   `default-src 'none'; script-src …` policy** — grep for `script-src`, not
   merely for the header's presence
6. Open each of the four games on the production host: zero console errors,
   and DOOM reaches its title screen

## 4. What is deliberately not here

- No VFS presence for games (`C:\` root is the portfolio's own information
  architecture; every folder there is a CV section). Revisit in Phase 6 if the
  owner wants `cd Games` to work.
- No save states, no high-score table, no multiplayer — none are in §9.
- Games remain excluded on mobile portrait (§4.6). `scripts/verify-build.mjs`
  now enforces that no game code or WASM runtime reaches the entry bundle.
- Only DOOM's shareware episode one.

## 5. Sitting on `dev`, awaiting cutover

Everything above. The cutover and the production deploy happen only when the
owner asks (CLAUDE.md).
