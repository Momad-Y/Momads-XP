# Phase 1 — Core XP Shell: Design

> Spec for Phase 1 (SPECIFICATION.md §9 Phase 1; process §11). Status: gates run autonomously per §11 autonomy rule.
> Owner inputs collected: Instagram handle `7.zsjj`; resume PDF = `docs/Profile.pdf` (LinkedIn export, swappable later).

## Goal

Rebranded boot flow with a new XP-faithful **login screen**, curated desktop + restructured start menu (placeholders for unbuilt apps), real `profile.json`, and the **mobile portrait experience** — plus the Phase-0 carry-overs (FA-Pro icon replacement, diff-based coverage, loadjs-script SRI decision, notepad-fallback dialog).

## Sub-decisions (for/against per §11)

1. **Login screen placement — new `src/routes/xp/login.svelte` in the `load_page` chain** (starting → **login** → desktop).
   *For:* matches the established page-switch architecture; login is a full screen, not an overlay; trivial to test.
   *Against:* one more hardcoded import branch in `+page.svelte`.
   *Rejected:* overlay inside desktop (login is not a desktop child); SvelteKit route (the shell is a single-route SPA by design).
2. **Startup sound — played on the login-card click** (the required user gesture), before dispatching desktop; the welcome splash stays but must not double-play audio.
   *For:* satisfies §2 (sound at Login → Welcome) and §4.3 (on by default, autoplay-safe).
   *Against:* none material. The base's welcome overlay currently triggers the sound on desktop mount — that trigger MOVES to login (verify no double-play).
3. **Boot rebrand — text/asset swap inside `starting.svelte`** per §2.1 and `design/inspiration/my-loading.png`: XP logo block + "Momad's XP / AI Engineer" branding, bottom-left F11 hint, bottom-right "Portfolio" watermark. Title in `+page.svelte`/`app.html` becomes **"Momad's XP"**.
   *For:* keeps the authentic loading animation; smallest change.
   *Against:* logo remains the MS XP flag (acceptable — nostalgic fair-use posture, §10).
4. **profile.json + typed accessor — `src/lib/data/profile.json` + `src/lib/profile.ts`** exporting a typed, frozen `profile` object (interface `Profile` mirrors SPECIFICATION.md §7; content from `docs/Profile.pdf` + owner answers; `projects: []` until Phase 2).
   *For:* compile-time import = type-checked at build; no runtime validation needed for our own bundled file.
   *Against/rejected:* Zod schema — boundary validation adds a dep for data that never crosses a trust boundary (revisit when profile.json feeds the VFS generator in Phase 2).
5. **Unbuilt apps — one generic `placeholder.svelte` program** (XP message-window: app icon + "under construction — coming in a later phase"), registered in `launch()`, parameterized by name/icon.
   *For:* §9 exit criteria demands placeholders; one component serves About Me / My CV / Contact Me / CMD / Python / Music / Games entries.
   *Against:* none. *Rejected:* per-app stub components (duplication).
6. **Desktop curation — VFS seed edit** (`hard_drive.json` + `SEED_VERSION` bump): desktop = My Computer, About Me, My CV, Internet Explorer, Contact Me (+ Recycle Bin). Paint/MPC/Games leave the desktop but stay in the start menu (Games → placeholder).
   *For:* §3.5 exactly; icons exist in `static/assets/icons`.
   *Against:* returning visitors re-seed (accepted §6.7 semantics).
7. **Start menu — restructure the two hardcoded columns** per §3.4 + `my-start-menu.png`: header (avatar + name from profile.json), pinned IE + Contact Me, All Programs flyout (My Computer, About Me, CMD, Python, Paint, Music Player, Games submenu), right column (My Computer, My CV, About Me, Contact Me | GitHub, LinkedIn, Instagram | Shut Down). Social links open new tabs via `window.open`; data from profile.json.
   *For:* start menu is already data-driven arrays in one component.
   *Against:* Log Off row goes (not in §3.4) — feature-neutral, it returns via Shut Down dialog later.
8. **Mobile — branch in `+page.svelte` before the boot chain**: `matchMedia` decides desktop (≥1024px), portrait mobile (<1024px portrait → new `src/lib/mobile/MobilePortfolio.svelte`, single-column XP-styled, reads profile.json, Download Resume + mailto + social links, "visit on desktop" footer), or rotate-prompt (<1024px landscape). Reacts to orientation changes live.
   *For:* mobile visitors never load the shell's heavy assets (spec §4.6 perf trade-offs).
   *Against:* two render paths to keep consistent — accepted, they share profile.ts.
9. **FA-Pro replacement — swap inlined Pro SVG paths for FA Free equivalents** in SMenu, SelectBox, ContextMenu, RButton, image_viewer (+ any grep hits), each verified in the parity loop.
   *For:* removes the licensing violation before the site is promoted.
   *Against:* minor glyph differences — parity loop owns the visual check.
10. **Coverage ratchet — diff-cover in CI** (`vitest --coverage` → lcov → `diff-cover --compare-branch origin/dev --fail-under 80` on PRs; fetch-depth 0).
    *For:* no external service/token; enforces 80% on changed lines exactly as decided in Phase 0.
    *Rejected:* Codecov (external dependency for the same gate).
11. **Resume — copy `docs/Profile.pdf` → `static/assets/Mohamed_Abdelnasser_Resume.pdf`**; mobile Download button links it; desktop "My CV" opens the placeholder until Phase 2's viewer.

## Verification scope (inherited surfaces, §4)

Window manager (drag/resize/min/max/close/focus/**cascade**), taskbar (§3.6), desktop interactions (§4.2), cursors — verified against win32.run in the §11 parity loop; deviations fixed or logged. Touch-drag note (§4.6) checked on ≥1024px touch emulation. Notepad-fallback: unhandled extensions get an XP "no app associated" dialog instead of a silent no-op.

## Testing

- **E2E (update + new):** smoke suite gains the login step (boot → login screen → click user card → welcome → desktop); new specs: start-menu structure (pinned/right column/social hrefs), placeholder window opens for About Me, mobile portrait layout renders profile content (viewport 390×844), landscape prompt (844×390).
- **Unit:** profile.ts shape (required fields non-empty), breakpoint decision function (pure: width/height/orientation → mode), placeholder props.
- **Coverage:** new modules join `vitest.config.ts` include (profile.ts, breakpoint logic); diff-cover gates the PR.
- **Parity:** two-browser loop per §11 — win32.run for inherited; `design/inspiration/my-{loading,users,start-menu,desktop}.png` for new surfaces; report in `docs/phase-1-guide.md`.

## Exit criteria (SPECIFICATION.md §9 Phase 1)

Boot → login → (startup sound) → welcome → desktop; curated icons open real apps or placeholders; restructured start menu with working social links; taskbar/window behaviors verified; mobile visitors get the simplified portfolio; landscape prompt; CI green incl. diff-cover; `docs/phase-1-guide.md` written; "Phase 1 is complete."
