# Phase 4 — red team of the spec (gate 2)

Fresh-context subagent, find-problems framing, run against `docs/phase-4-spec.md`
at commit `95b289f`. It read the spec, `CLAUDE.md`, SPECIFICATION.md §3.3–§9,
and the eleven source files the spec claims to plug into.

Per `~/.claude/rules/common/critical-decision-review.md` the default is to
accept. Every finding below was re-verified against the code before being
accepted; one claim is accepted with a correction to its reasoning, and one
attribution is corrected. Nothing was rejected.

## Grades

| Sub-decision | Grade | Disposition |
| --- | --- | --- |
| D1 logic location | Strong | Amended — worker glue was uncovered |
| D2 start menu | Strong | Unchanged |
| D3 no VFS entries | Strong | Amended — credit an unclaimed benefit |
| **D4 Minesweeper sizing** | **Weak** | **Accepted — mechanism was wrong** |
| D5 first-click safety | Strong | Unchanged |
| D6 own Solitaire | Strong | Unchanged |
| D7 pointer events | Strong | Amended — reviewer verified it further |
| D8 card art | Strong | Unchanged (provenance since cleared) |
| D9 js-dos low layer | Strong | Unchanged |
| **D10 DOSBox worker** | **Weak** | **Accepted — no lifecycle story** |
| D11 .jsdos bundle | Acceptable | Amended — needs a byte-pinning test |
| D12 fullscreen | Acceptable | Amended — Escape conflict, with a nuance |
| D13 vendor Stockfish | Acceptable | Amended — dependency consequences |
| D14 weakening | Strong | Unchanged (since proven by execution) |
| D15 piece art | Strong | Unchanged |
| D16 two-player | Strong | Unchanged |
| D17 mobile | Strong | Unchanged |
| D18 netlify headers | Strong | Unchanged |
| **D19 test strategy** | **Weak** | **Accepted — flake mitigation was fake** |
| D20 licence file | Strong | Amended — engine identity correction |

Three Weak, no Wrong. Eleven new sub-decisions (D21–D31) added in
`phase-4-spec.md` Part B.

---

## The finding that mattered most

**`to_window_options()` forces `resizable: true` on every registered app, and
`AppDefinition` has no field to override it.**

Verified: `app_registry.ts:167` sets `resizable: true` unconditionally inside
the object that its own comment (`:136-141`) says "REPLACES the component's own
`options` default wholesale". `AppDefinition` (`:47-76`) declares only `id`,
`path`, `title`, `icon`, `component`, `default_size`, `min_size`, `singleton`,
`taskbar` — no `resizable`, no `aspect_ratio`, no `maximize_btn`.

**Why this is worse than the reviewer even stated.** D4's fidelity argument was
that Minesweeper is non-resizable. Spike 1, run during this gate, concluded
there was "no jQuery UI conflict" — but it reached that conclusion *because*
`Window.svelte:179` short-circuits `setup_gestures()` when `options.resizable`
is false. Through the registry, `resizable` is never false, so
`Window.svelte:336` attaches `jQuery(el).resizable(...)`, which writes
`el.style.width/height` directly and fights the `style:width={options.width}`
binding at `:435-436`. **Spike 1's conclusion is invalidated for the path the
games will actually take.** The spike tested a hand-built `WindowOptions`
object rather than the registry output — exactly the substitution the reviewer
warned about.

The reviewer's framing that D4's fallback (remount on difficulty change) also
fails is correct: a remount still routes through `to_window_options()`.

**Disposition: accepted in full.** New sub-decision **D21** adds the
passthrough. D4's verdict survives; its mechanism is replaced.

---

## Findings accepted with an amendment to the reviewer's reasoning

### D12 — "Escape exiting fullscreen cannot be prevented or intercepted by page JS"

The conflict is real and I had missed it: DOOM's own menu is Escape-driven, and
the spec put DOOM in browser fullscreen without saying what owns Escape.

The absolute claim is slightly overstated. The **Keyboard Lock API**
(`navigator.keyboard.lock(['Escape'])`) does let a fullscreen page capture
Escape, in Chromium. It is not a reason to reject the finding: it is
Chromium-only, unavailable in Firefox and Safari, and building DOOM's only
route to its own menu on a non-standard API that two of three engines ignore
would be worse than the problem. Recorded as an explicitly rejected option in
**D25** rather than as a correction to the finding.

### D13 — "the spec frames chess.js as the phase's only new npm dependency"

**Attribution correction, substance accepted.** That phrasing appears in the
brief I gave the reviewer, not in `phase-4-spec.md`; the spec never claims it.
The underlying finding is nonetheless right and is the more important half:
the spec never lists the CLAUDE.md hard rule (`npx -y npm@10 install` after any
`package.json` change) as an action item anywhere, and D13's instruction to
mirror `vendored_three.test.ts` silently implies pinning a new devDependency,
because that test's own header says `three` "is a pinned devDependency purely
so this comparison has something to compare against". Both are now **D29** and
**D30** — and D30 does *not* simply copy the three.js pattern, for a reason the
reviewer did not raise (see Part B).

---

## Missing sub-decisions — all ten accepted

Each was verified against shipped code before acceptance:

1. **Registry contract gap** → D21. Verified above.
2. **Worker / AudioContext / WASM teardown** → D22. `python.svelte` and
   `music_player.svelte` both ship this pattern; the spec had no `onDestroy`
   story for two heavier resources.
3. **Singleton policy, never stated for any game** → D23. A genuine omission;
   `app_registry.ts:108-111`'s Python reasoning applies almost verbatim to DOOM.
4. **Taskbar `runningPrograms` registration** → folded into D23 and the exit
   criteria. `app_registry.ts:9-12` names omitting it as this repo's
   most-repeated defect at eight instances, so it becomes an explicit check
   rather than an assumed default.
5. **Minimize while running** → D24. Verified: `Window.svelte:206-221` sets a
   transform and `minimized = true`, then `loose_focus()`. It does not unmount
   and does not pause, so a minimized DOOM saturates a core invisibly — which
   directly contradicts D10's own stated rationale.
6. **Keyboard focus and Escape routing** → D25. At least six components bind
   `svelte:window` Escape handlers, and nothing in `Window.svelte` gives content
   DOM focus.
7. **Audio autoplay policy** → D26. `music_player.svelte:310-314` already
   documents that an `AudioContext` must be constructed synchronously inside a
   gesture handler; DOOM's would be created after an async import and a worker
   handshake, so it would start suspended and play silently.
8. **The legacy `$:` write trap, concretely** → D27. This bug has shipped here
   once already (Music Player title). A win-detection `$:` that writes
   `game_over`, plus a second `$:` that reads it to stop the timer, reproduces
   it exactly.
9. **`prefers-reduced-motion`** → D28.
10. **npm-10 lockfile action item** → D29.

## Cross-decision dependencies, accepted as mapped

- D4 ⇄ D9 ⇄ D12 all block on D21. The reviewer is right that D4's own fallback
  does not rescue D9/D12.
- D10 ⇄ D22 ⇄ D23 ⇄ D24 are one "heavy-runtime lifecycle" design that the spec
  had split across zero decisions.
- D13 ⇄ D19 ⇄ D29 ⇄ D30 move together.
- D1 ⇄ D27: D1's testability argument only holds if the reactive-wiring
  convention at the component boundary is also specified.

## D19 — the flake finding, accepted without qualification

`playwright.config.ts:10-18` states in its own comment that the `default`
project, on the identical 2-core CI configuration, "still flaked one run in
three here", that failures "follow overall machine load … not worker count",
and that every one of them "passes in isolation". D19 proposed to mitigate by
shrinking each game test's assertions. That reduces wall-clock but does nothing
about CPU contention, which is the documented cause. The mitigation was, as the
reviewer implies, decorative. Replaced by **D31**.
