# Phase 4 — red team of the implementation (gate 6)

> **An independent pass DID run, on the second attempt.** Everything below the
> horizontal rule is the earlier SELF-review, kept for the record because the
> independent reviewer graded it — and found it badly insufficient. The
> independent findings and their dispositions are in
> `phase-4-redteam-implementation-2.md`.
>
> The headline: the independent reviewer **mutation-tested the tests** and
> proved three of them could not fail, including two written by the
> self-review to close its own findings. Self-review caught real bugs but
> could not see its own blind spots. Read the second document first.

---

**The self-review below ran because no independent reviewer could start.**

Gates 2 and 4 used fresh-context subagents, as §11 requires. Gate 6 could not:
two attempts died on API rate limits — the session limit, then the weekly
limit. So this review was performed by the same context that wrote the code,
which is exactly the confirmation-bias position the six-gate loop exists to
avoid. Treat its conclusions as weaker than gates 2 and 4, and re-run an
independent pass over `git diff 6cf9a34..dev` when limits allow.

To compensate, every question below was answered by **running something**
rather than by reading — the flaw in a self-review is not attention, it is
believing your own account of the code. One of the four findings was a
mis-diagnosis caught only because the check was executed.

## What was examined

`git diff 6cf9a34..dev`, 16 commits, focused on the five files where a defect
would be invisible to the existing tests: the four games' rules plus the DOOM
component's lifecycle.

---

## Finding 1 — `finish()` stalls and leaves a dead button. CONFIRMED, fixed.

`solitaire.svelte` ran an auto-complete loop that only moved **top cards to
foundations**. An Ace buried under its own 2 deadlocks it: the 2 cannot go home
before the Ace, and the loop never moves the 2 aside. It then exits, the game
is unfinished, and `auto_complete_available` is still true — so the button
remains, doing nothing on every further click.

**How it was found:** simulated the loop over 3000 fully-visible positions.
Every one stalled. (That rate is inflated — the simulation forces 52 cards into
the tableau with empty foundations, which real play cannot reach — but the
deadlock itself is reachable and the button's behaviour after it is wrong.)

**Fixed** by moving the loop out of the component into
`klondike.ts::auto_finish` — where D1 said game logic belongs and where it is
now unit-tested, including the deadlock case and a termination proof — and by
hiding the button once an attempt fails to finish.

## Finding 2 — an in-flight `launch()` outlives the window. CONFIRMED, fixed.

`doom.svelte`'s `launch()` assigned `session` **after** an await that spans
downloading ~4MB and booting an emulator. Closing the window during that window
— a realistic action, it takes seconds — runs `onDestroy` while `session` is
still `null`, so nothing is disposed; `start_doom` then resolves and assigns a
live DOSBox worker that nobody holds a reference to. It runs until the tab
closes.

This is precisely the leak D22 was written to prevent, missed at the one point
where the reference does not exist yet.

**Fixed** with a `destroyed` flag set in `onDestroy`; `launch()` disposes and
bails if the component went away while it was waiting.

## Finding 3 — `slice(0, -0)` would empty a pile. CONFIRMED, guarded.

`klondike.ts::without` computes `slice(0, -count)`. In JavaScript `-0 === 0`,
so a count of 0 is `slice(0, 0)` — an empty array, deleting the entire pile
rather than leaving it alone.

**Not reachable today**: the only caller is `move()`, which returns early
unless `can_move` passed, which requires at least one card. Nothing in the
signature says so, and a future caller would hit it silently. Guarded, with a
test through the public path.

## Finding 4 — a MIS-DIAGNOSIS, recorded because it nearly shipped

I concluded that `$: sync_running(window?.minimized === true)` never re-ran,
on the reasoning that `Window.svelte` sets its own `minimized` and the
controller object's identity never changes. A probe appeared to confirm it:
minimizing DOOM for five seconds and restoring showed a different frame.

**Both were wrong.**

- The probe was confounded. It waited 300ms after restoring, and `resume()`
  fires on restore — at ~35fps that is roughly ten frames. It could never have
  shown equality regardless of whether pause worked.
- The reasoning was wrong too. `Window.svelte` declares `accessors={true}`,
  which exposes its props as signals, so reading `window.minimized` from a
  reactive statement **does** track it. Proven by mutation: reverting to
  `window?.minimized` *and* removing the binding still passes the
  minimize/restore E2E.

A second probe was also worthless: screenshots of a minimized window come back
essentially blank (526 bytes against 91,889 while visible), so "frames stopped
changing" measured the window's visibility, not the emulator's state.

**Disposition:** the `bind:minimized` change is kept — it states the dependency
explicitly instead of relying on accessor-signal behaviour that could be broken
from the other side of the boundary — but its comments were rewritten to say
so, rather than claiming a fix for a bug that never existed. Shipping the
original comment would have left a permanent false account of the code.

---

## Checked and found sound

- **Mine placement is uniform.** 60,000 deals on a 3×3 board: 7616 / 7619 /
  7484 / 7390 / **0** / 7407 / 7487 / 7456 / 7541 against an expected 7500,
  with the first-clicked cell at exactly zero. The `Math.min(j, len - 1)` clamp
  in `place_mines` is unreachable — `j` is already bounded — so it is dead but
  harmless.
- **`draw_from_stock` with `draw: 3`** and fewer than three cards left: takes
  what remains, then recycles to 0/24. Correct.
- **`engine.ts` before the handshake:** `stockfish.js` queues commands until
  its runtime is ready, so a `best_move` issued before `uciok` is not lost. No
  promise can hang — `dispose()` settles any in-flight request.
- **`netlify.toml` ordering:** the `/html/python-sandbox.html` block is still
  the last one setting `Content-Security-Policy`; the three new blocks name
  only `Cache-Control`.
- **The deleted placeholder mechanism** has no remaining references
  (`placeholder.svelte`, `placeholder.ts`, `placeholder_entry`, the
  `work_space` branch, `copy.placeholderNotice`).

## Still not independently verified

Everything above. The items a fresh reviewer would most likely add value on,
and which this pass is least able to judge, are: whether the four E2E specs
assert anything that would still pass with the feature removed, and whether the
new `verify-build.mjs` section is watertight — its own history in this phase
(three attempts before it could be made to fail) suggests that class of check
deserves someone else's eyes.
