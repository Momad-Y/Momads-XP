# Phase 4 — independent red team of the implementation (gate 6, second attempt)

Fresh-context subagent against `git diff 6cf9a34..dev`, 25 commits, find-problems
framing. The first two attempts died on API rate limits; this one completed.

**It found 6 HIGH, 6 MEDIUM and 8 LOW, and it verified six of them by
executing mutations.** Every finding was accepted. Nothing was rejected.

The single most important result: **it mutation-tested the test suite and
proved three tests could not fail** — two of which the earlier self-review had
written to close its own findings. That is the difference an independent pass
makes, and it is why the first document is kept rather than deleted.

## HIGH

| # | Finding | Disposition |
| --- | --- | --- |
| H1 | `e2e/doom.spec.ts` pause test asserts `data-paused`, a mirror of the bound prop. Replacing `sync_running()` with a no-op left it green — D24 and exit criterion 11 had no working check. | **Fixed.** The component now samples audio buffers from the emulator (`data-audio-ticks`), the one signal a running emulator sends the main thread: the canvas is transferred to the worker so its pixels cannot be read, and a minimized window screenshots blank. The reviewer's exact mutation now fails with *"the emulator kept producing audio while minimized"*. The test also asserts audio is flowing at all first, so it cannot pass vacuously. |
| H2 | Key-isolation test pressed ArrowUp/Space, but `start_menu.svelte:140` is `if (event.key !== 'Escape') return;` — those keys could never have closed the menu. Deleting `stopPropagation` left it green. | **Fixed.** Now presses **Escape** into the focused canvas, which is the one key the desktop and the game genuinely compete over. Mutation-verified: removing the isolation fails with *"Escape leaked out of the game"*. |
| H3 | `verify-build.mjs`'s xterm check called `skip()` on **both** branches, and recomputed a condition it was already inside — no failing path, in the file whose header warns about exactly that. | **Fixed.** Proves the target exists (are the terminal apps in this build at all?) then `fail()`s. Verified by rewriting `.xterm` in the built stylesheet: `✗ xterm CSS is in no stylesheet, but the terminal apps ARE in this build`. |
| H4 | `chess.svelte` created the engine in `onMount`, so **every** Chess open downloaded 96KB JS + 559KB WASM and started a Worker — including two-player games, and including the board-only E2E that exists to stay out of the serial `heavy` pool. | **Fixed.** The engine is created on first use. Verified: a two-player game now issues zero `stockfish` requests. |
| H5 | `New Game` or an opponent switch during a search left the in-flight request live; the reply was applied to a fresh board, chess.js threw, and `void reply()` made it an unhandled rejection. Trivially reachable at "hard" (depth 12). | **Fixed.** A generation token invalidates superseded searches, and the engine's move is wrapped in `try/catch` — the human side already was, for the same documented reason. |
| H6 | GPL-2.0 licence text was **not shipped** with js-dos/DOSBox. The test only grepped `LICENSE-third-party.md` for the string "GPL-2.0" — a check that passes with no licence anywhere. Asymmetric with Stockfish, whose own test states the principle. | **Fixed.** `static/js/js-dos/COPYING` now ships, pinned by checksum and asserted for content the way `Copying.txt` is. |

## MEDIUM

| # | Finding | Disposition |
| --- | --- | --- |
| M1 | The `slice(0, -0)` guard test never reached `without()` — `can_move` returns false first — so the guard was untested despite the self-review claiming it was tested "through the only public path". | **Fixed.** Replaced with tests that exercise real behaviour; the guard is kept and documented as unreachable-by-construction rather than falsely claimed as covered. |
| M2 | The recycle test asserted lengths only; dropping `.reverse()` left all tests green. `draw: 3` had no test at all. | **Fixed.** Order is now pinned for both recycle and draw-3. Both mutants verified to fail. |
| M3 | **D28 was not implemented.** `data-reduced-motion` was read by nothing, and there was no win animation to suppress — §3.3's bouncing cards were never built, while the guide claimed a "reduced-motion-aware win state". | **Fixed.** The cascade is implemented, with its physics extracted to `games/solitaire/cascade.ts` and unit-tested (bounce damping, settling, off-screen culling, immutability) — winning a game from an E2E is impractical, which is exactly why the logic does not live in the component. Reduced motion suppresses it. |
| M4 | Minimizing during DOOM's several-second load left the emulator running unpaused: the reactive statement tracks `is_minimized`, not `session`. | **Fixed.** `launch()` applies the current minimized state as soon as the session exists. |
| M5 | The Solitaire foundation test asserted nothing ~43% of the time — an unseeded deal with no Ace exposed took a branch that passes with the feature deleted. | **Fixed.** Deals until an Ace is exposed, bounded at 40. |
| M6 | `card_code` — which produces the asset filename — had no test, and nothing asserted the 53 card PNGs or 12 chess SVGs exist. A wrong mapping ships as broken images the E2E cannot see, because it counts `<img>` elements. | **Fixed.** Mapping tested, and every referenced asset is asserted present. |

## LOW — fixed

- **L1** Changing Opponent or Difficulty never refreshed the status line.
- **L2** The mine counter clamped at zero, contradicting `board.ts`'s own
  *"may go negative, exactly as XP's counter does"*. Now renders `-01`.
- **L4** `on_key` returned before `stopPropagation()` when `session` was null,
  so keys leaked during load and after teardown. Isolation now happens first.
- **L6** Comments that were false as written: `shell.spec.ts` described a
  placeholder that this phase deleted (and the note now records what that cost
  — `cascade_position` lost its only end-to-end walker), and `work_space.svelte`
  claimed registry components declare no `options` default, which all four new
  components do.
- **L8** `/games/*` froze the README and licence notice for a year; the
  immutable rule is now scoped to the bundle, and the notices get
  `X-Robots-Tag: noindex`.

## LOW — accepted, not fixed

- **L3** Minesweeper persists a window rect on drag but not on a difficulty
  change, so dragging at Expert then reopening restores an Expert-sized frame
  around a Beginner board. Real but cosmetic, and the fix reaches into
  `Window.svelte`'s persistence — deliberately out of scope for a fix pass.
- **L5** `Source = {pile:'foundation'}` is handled but unreachable from the UI.
  Dead but harmless, and removing it narrows a public type for no gain.
- **L7** Exit criteria #9 (a taskbar button per game) and #10 (three
  open/close cycles leak nothing) still have no automated check; #11 and #12
  were H1/H2 and now do.

## Confirmed sound by the reviewer

`netlify.toml` CSP ordering; no personal-data leak; the npm-10 lockfile rule;
mine-placement uniformity; `auto_finish` termination; King-onto-empty-column
from a run; and `verify-build.mjs`'s games section, which the reviewer failed
in all three ways it tried.
