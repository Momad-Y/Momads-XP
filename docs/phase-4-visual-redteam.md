# Phase 4 — visual red team

Two deliberate passes per game, driven through a real browser (Playwright MCP)
against the dev server and the production preview: open it, look at it, play it.
Requested by the owner after Phase 4 shipped, on the report that **"doom is a
video I can't control it for some reason."**

That report was accurate, and it was not the only one.

## Why the gates missed all of this

Every bug below sat behind a test that looked like coverage and could not fail.
The pattern is consistent enough to be worth naming:

| Test                                   | What it asserted                        | Why it could not fail                                         |
| -------------------------------------- | --------------------------------------- | ------------------------------------------------------------- |
| `keymap.test.ts`                       | every key maps to a value `> 0`, all distinct | true of any table, including an entirely wrong one       |
| `minesweeper.spec.ts` sizing           | `width === cols * CELL_PX + FRAME_W`    | derives the expectation from the constant under test          |
| `solitaire.spec.ts`                    | deal, draw, double-click-to-foundation  | never dragged anything, and dragging was the broken path      |
| `doom.spec.ts` Escape isolation        | Escape does not reach the desktop       | passes whether or not Escape reaches the *game*               |

A test that cannot distinguish the working system from the broken one is not
coverage. Each fix below ships with a replacement that was mutation-tested — the
fix reverted, the test confirmed red — and the mutation is recorded in the
commit.

## Findings

### 1. DOOM ignored every key — HIGH, user-reported

`keymap.ts` shipped DOS set-1 scancodes (`Escape: 1`, `ArrowUp: 328`,
`ControlLeft: 29`). js-dos 8.4.1 wants its own `KBD_KEYS` enum, which is GLFW's
numbering (`256`, `265`, `341`). js-dos **drops an unrecognised code without
erroring**, so the emulator booted, downloaded, produced audio and painted
frames while ignoring the player entirely. What a visitor saw was DOOM's attract
demo looping forever: a video.

Found by sweeping codes 0–127 into the live `sendKeyEvent` and watching the DOOM
menu open — proof that input worked and only the numbers were wrong. The
replacement table came from js-dos's own UI layer (`js-dos.js` 8.4.1, read for
reference only; that file is never shipped, it hardcodes four remote origins).

`scancode_for` is renamed `key_code_for`. The values were never scancodes, and
the old name is what made the mistake look right.

Verified end to end afterwards: Esc opens the menu, Enter picks New Game,
episode and skill select respond to the arrows, E1M1 starts, Ctrl fires (ammo
50 → 49), the arrows move and turn.

### 2. Solitaire could not be played by dragging — HIGH

A card is an `<img>`, and an `<img>` is natively draggable. Pressing one and
moving started the browser's own HTML5 drag, which fires `pointercancel` at
(0, 0) and tore down the pointer sequence before the drop was hit-tested. The
card lifted, followed the cursor, then snapped back. The only working way to
move a card was double-click-to-foundation — which is the one interaction the
suite covered.

Confirmed by instrumenting `end_drag`, which logged
`END pointercancel active=true 0 0` on a drag `can_move` accepts.

### 3. Minesweeper's board did not fit its own window — HIGH

`FRAME_W` (20) and `FRAME_H` (62) were flat guesses. On Beginner the grid ran
48px below the window frame, the content grew a scrollbar, and the scrollbar
clipped 10px off the right-hand column; the too-narrow window also truncated the
titlebar to "Minoswee…". Replaced with the sum of the real chrome, term by term,
each read off the component's own classes. Beginner 164×206 → 176×270.

### 4. Maximized DOOM drew its status bar behind the taskbar — MEDIUM

A canvas is a replaced element carrying an intrinsic aspect ratio, and a flex
item defaults to `min-height: auto`, so the canvas box would not shrink below
the height that ratio implies. At 1280px wide DOSBox's 320×200 asks for 800px
against 714px of room. `min-h-0` fixes it — established by elimination with the
emulator running, not assumed.

`object-contain` is a second, independent correction: the window holds 4:3 but
its titlebar and toolbar eat into that, so DOOM was drawn slightly tall even
unmaximized.

**The first version of this test did not start the emulator and therefore passed
against the broken layout** — an untouched canvas is 300×150, implying 640px at
1280px wide, which fits. It is recorded here rather than quietly replaced,
because it is the same species of test as the four in the table above.

### 5. Deep Solitaire piles hid the card you need — MEDIUM

Cards fanned at a fixed 20px inside a 300px pile box, which holds 11; the felt
clips at 13. A Klondike pile legitimately reaches 19 — up to six face-down under
a full King-to-Ace run. Because a pile fans downward it is the **top** card that
falls off the bottom, and the top card is the one you drag, so the game would
become unplayable exactly when it was nearly won. `fan_offset` now compresses
once it must, as XP does.

Extracted to `lib/games/solitaire/fan.ts` so the geometry is unit-testable; the
deep-pile case is hard to reach through the UI, which is why it shipped.

## Checked and correct

- **Minesweeper** — first-click safety, flood reveal, flag counter, timer (runs
  while minimized, as XP does), all three difficulties, loss state, no maximize
  button.
- **Solitaire** — deal, draw-1 cycling, double-click to foundation, flipping the
  uncovered card, reduced-motion.
- **Chess** — selection ring and legal-move dots, engine reply (1.e4 e6),
  history numbering, check detection, New Game mid-search at Hard (board resets,
  no stale move, no unhandled rejection), two-player mode makes **zero**
  Stockfish requests.
- **DOOM** — click-to-start gate, minimize pauses the emulator and restore
  resumes it (measured on audio buffers), Escape stays out of the desktop.
- **All four** — open together, taskbar tiles, cascade, no console errors.

## Noted, not changed

- Chess does not scale its board when maximized; it centres at a fixed 44px
  square size. Deliberate, matches the other games.
- Chess auto-promotes to a queen rather than asking. A simplification, not a
  defect.
- Window geometry persists per program, so a game maximized once reopens
  maximized. That is the window manager's saved-rect behaviour from Phase 1, not
  Phase 4.
