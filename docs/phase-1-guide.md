# Phase 1 Guide — Core XP Shell

> Handoff per `SPECIFICATION.md` §11. Spec: `docs/superpowers/specs/2026-07-12-phase-1-core-shell-design.md` (v2). Plan: `docs/superpowers/plans/2026-07-12-phase-1-core-shell.md`. Shipped via PRs #5–#9 + closeout.

## 1. Phase summary

**Implemented:** rebranded boot ("Momad's XP / AI Engineer", F11 hint, Portfolio watermark, click/key skip); **new XP login screen** (§2.2 — avatar card, restart, flavor text; XP startup sound on the login click, autoplay-safe); welcome retimed to 1.5s + fade (no audio); `src/lib/data/profile.json` + typed `profile.ts` (real data from Profile.pdf; GitHub `Momad-Y`, LinkedIn `mohamed-y-abdelnasser`, Instagram `7.zsjj`; `projects: []` until Phase 2); desktop curated to §3.5 (My Computer, About Me, My CV, IE, Contact Me + Recycle Bin — unbuilt apps open a parameterized placeholder via the new `exe_item` channel); start menu per §3.4 (avatar header, pinned IE/Contact Me, All Programs with Games flyout ×4 placeholders, Music Player → MPC, right column + FA-Free brand social icons, Turn Off); **window cascade** (24px offsets for rect-less windows); no-association XP dialog for unhandled extensions; **touch drag/resize fixed** (vendored jQuery UI Touch Punch 0.2.3, MIT); **mobile**: `decideMode` branch → full §4.6 portrait portfolio / rotate prompt, mode-locked after boot; FA-Pro → FA-Free (20 sites, 7 files — licensing resolved); panzoom vendored (sha256 `d1dc01e4…78cd5`); **diff-cover CI gate** (80% on changed `.ts` lines vs dev; `.svelte` is E2E-owned by design).

**Deferred:** real About Me/Contact Me/My CV apps (Phase 2), CMD/Python/Paint-custom/Music (Phase 3), games (Phase 4), full sound manager + §4.3 logon-sound question (Phase 6).

## 2–5. Setup / env / config

Unchanged from `phase-0-guide.md` (Node 22, npm-10 locks, same commands). **New:** `SEED_VERSION` = `29365afea2023187083d902c0a225831`; recompute on any seed edit. E2E is now 12 specs (smoke, login, start_menu, shell, mobile). Env vars: none.

## 6. profile.json

`src/lib/data/profile.json` is live and drives login, start menu, boot branding, and mobile. **`meta.phone` was removed** (gate-6 review: shipped in the public bundle with no UI purpose — restore deliberately if a future phase renders it). Edit → `npm run check` catches shape errors via `profile.ts`.

## 7. Deployment

Netlify unchanged (`momad-xp`, production = `main`). Cutover after this closeout merges.

## 8. Functional checklist

- [x] Boot (skippable) → login → startup sound on click → welcome 1.5s → desktop
- [x] Desktop: 5 curated icons + Recycle Bin; placeholders open for About Me / My CV / Contact Me
- [x] Start menu: header, pinned, All Programs + Games flyout, socials open new tabs (noopener), Turn Off works
- [x] Cascade: successive rect-less windows offset 24px; drag/resize/min/max unchanged
- [x] Unhandled extension double-click → XP dialog (no silent no-op)
- [x] Touch: window drag + resize work on touch devices (CDP-verified before/after)
- [x] Mobile 390×844: full portfolio sections; 844×390: rotate prompt; ≥1024 desktop; mode locked post-boot
- [x] Gates: check 0 errors · lint clean · 24/24 unit · 12/12 E2E · build · diff-cover green on all slice PRs

## 9. Visual parity report

Viewport 1280×800 vs `design/inspiration/my-*.png` + win32.run (inherited): login, start menu, desktop, welcome ≥95% (structure, colors, fonts, spacing match; minor gradient/photo differences accepted). Mobile vs §4.6 spec list — complete. Evidence: `design/research/phase1-parity-0{1..4}.png` (local, `design/` untracked). Inherited shell spot-checked — no regressions (12/12 E2E incl. original smoke).

## 10. Notes & gotchas

- Gate-6 review verdict MERGE WITH FIXES → applied: phone PII removed; login Restart now handles Space too. Noted, accepted: diff-cover skips `.svelte` lines (design decision 10); cutover PRs pass diff-cover trivially (code was gated in slice PRs).
- Slice deviations (all sound, recorded in PR bodies): `exe_item` channel instead of overloading `fs_item`; socials as anchors not `window.open`; Shut Down stays in the XP-faithful bottom bar; `@types/node` added (types-only) for the hash-guard test; desktop icon dblclicks in E2E need 450ms spacing (inherited debounce).
- The seed curation script is `gen/curate_seed_phase1.mjs`; hard_drive.json stays compact single-line JSON — verify via script + hash-guard test, not the diff.

**Phase 1 is complete.**
