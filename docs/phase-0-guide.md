# Phase 0 Guide — Base Repo Adoption

> Handoff per `SPECIFICATION.md` §11. Spec: `docs/superpowers/specs/2026-07-11-phase-0-base-adoption-design.md`. Plan: `docs/superpowers/plans/2026-07-11-phase-0-base-adoption.md`.

## 1. Phase summary

**Goal:** adopt [win32.run.cf](https://github.com/ducbao414/win32.run.cf) (MIT) as the foundation: prune to a lean XP shell, convert to strict TypeScript, stand up tooling + CI/CD, deploy the skeleton to Netlify.

**Implemented:**

- Pruned import (prune-before-first-commit): third-party embeds removed except `static/html/jspaint` (Paint) and `static/html/visualizers` (96KB, used by Media Player Classic); 20 CrazyGames + pyodide webapp VFS entries gone; 12 non-spec programs deleted with all four wiring surfaces cleaned (`work_space.svelte` launch dispatch, `system.ts` doctypes, context menus, start menu); BIOS boot manager + Win95/DOS installation flows removed — the site boots **straight to the XP loading screen**; `app.html`'s BIOS-POST pre-hydration placeholder replaced with plain black
- Wallpapers relocated `static/files/wallpapers/` → `static/images/wallpapers/` with VFS `url`s re-pointed (the VFS wallpaper entries must survive — `system.ts`'s `bliss_wallpaper` is an item ID)
- `hard_drive.json` cleaned by script with parent `children`-array consistency (no dangling IDs)
- Preload manifest regenerated via `gen/assets.js` (rewritten on `fs.readdirSync`, `node-dir` dropped); `load_assets` made local to `starting.svelte` (upstream latent race against an `app.html` inline global)
- `@sveltejs/adapter-netlify` + `netlify.toml` (Node 22)
- **Full strict TypeScript**: every module and component; `strict: true` + `noUncheckedIndexedAccess` + `skipLibCheck`; ESLint `no-explicit-any` and `no-unsafe-type-assertion` as errors over all of `src/`; shared contracts in `src/lib/types.ts`; ambient declarations in `src/app.d.ts`; Svelte 5 `componentApi: 4` compat flag **removed** (zero legacy call sites)
- VFS seed versioning (`src/lib/seed.ts`, TDD, 100% coverage): `SEED_VERSION` = sha256 (first 32 hex chars) of `static/json/hard_drive.json`; boot re-seeds IndexedDB on mismatch
- Tooling: ESLint flat + Prettier + husky/lint-staged; Vitest (glob-scoped 80% thresholds on new modules); Playwright smoke E2E; GitHub Actions CI
- `public/assets` production files migrated to `static/assets/`; `public/` removed
- `LICENSE-win32.run` (upstream MIT notice) + README credits

**Explicitly NOT included (deferred):** rebranding (title is still "Microsoft Windows XP Professional" — Phase 1), login screen (Phase 1), mobile layout (Phase 1), profile.json and the generate-vfs build step (Phases 1–2), Notepad / Minesweeper / PDF viewing / Python REPL (pruned as embeds; rebuilt in Phases 2–4), `/api/email` + `/api/chat` (Phases 2/5).

## 2. Required assets

All XP assets (icons, sounds, fonts, wallpapers, cursors) ship in `static/` from the base. Portfolio-specific assets live in `static/assets/` (avatar, xp-logo, about-me/contact-me/my-cv/chess/doom icons). Nothing is a placeholder in this phase.

## 3. Setup & commands

- Node 22 (pinned in `netlify.toml` + CI). npm (package-lock v3 — **regenerate locks with npm 10.x**, see Gotchas)
- `npm install` → `npm run dev` → http://localhost:3000 (straight to XP loading screen → desktop)
- `npm run build` → `npm run preview` → http://localhost:4173
- `npm run check` (svelte-check, 0 errors required) · `npm run lint` · `npm run format:check` · `npm run test:unit` (or `npx vitest run --coverage`) · `npm run test:e2e`

**Success criteria:** boot lands on the desktop with the Bliss wallpaper; My Computer opens/drags/resizes/closes; start menu works; right-click → New → Folder/Text Document works; Display Properties lists 11 wallpapers and switching works; Paint (jspaint), image viewer, and MPC open.

## 4. Environment variables

**None for this phase.** No serverless functions ship in Phase 0; there are no secrets anywhere in the tree.

## 5. Code configuration

- `svelte.config.js`: adapter-netlify, no compat flags
- `tsconfig.json`: strict; extends the generated `.svelte-kit/tsconfig.json` (created by `prepare` → `svelte-kit sync`)
- `eslint.config.js`: typed strict rules over `src/**`; untyped zone for root configs / `e2e/` / `gen/`
- After ANY edit to `static/json/hard_drive.json`: recompute `SEED_VERSION` in `src/lib/seed.ts` (`sha256sum static/json/hard_drive.json | cut -c1-32`) — Phase 2 automates this
- Do not touch `static/html/jspaint` (vendored) or `src/lib/components/xp/*` styling in this phase

## 6. profile.json

Does not exist yet — created in Phase 1. Nothing in Phase 0 reads it.

## 7. Deployment (Netlify)

- Site: **momads-xp** (id `7956f4de-b26d-4cc3-88bc-0a9baab6bcc0`, https://momads-xp.netlify.app), team `momady`
- Build from `netlify.toml` (`npm run build` → `build/`, Node 22)
- **One manual step remains (owner):** link the GitHub repo in the Netlify UI (Site configuration → Build & deploy → Link repository → `Momad-Y/Momads-XP`), production branch `main`, deploy previews on PRs, branch deploys for `dev`. The MCP/API cannot install the Netlify GitHub App — it's a one-time OAuth click-through.
- Production stays empty/failed until the first cutover merge to `main` — expected, not a defect.

## 8. Functional testing checklist

- [x] Boots straight to XP loading screen (no BIOS/boot menu), then desktop
- [x] Wallpaper renders; switching via Display Properties works (11 wallpapers)
- [x] Desktop icons: My Computer, IE, Paint, MPC, Games, Recycle Bin (pruned apps absent)
- [x] My Computer opens, drags, closes; taskbar item appears
- [x] Start menu opens; only kept programs listed; submenu flyouts work
- [x] Right-click desktop → New → Folder / Text Document (no crash; .txt double-click is a no-op by design — no handler until Notepad returns)
- [x] Paint (jspaint) and image viewer and MPC open
- [x] `npm run build` passes; E2E 3/3; check 0 errors; lint clean
- Evidence: `design/research/gate-0*.png`

## 9. Visual parity report

No new UI surfaces in this phase — parity requirement is "don't regress the inherited shell." Verified by side-by-side spot checks against win32.run during the gate (desktop, start menu, My Computer window) and the smoke E2E. One deliberate deviation: no BIOS screen (owner decision, SPECIFICATION.md §2.1).

## 10. Notes & gotchas

- **Lockfile/npm version**: CI validates with npm 10 (Node 22). Locks written by npm 11+ can fail `npm ci` ("Missing: … from lock file"). Regenerate with `npx -y npm@10 install`.
- **IndexedDB persistence**: returning dev browsers re-seed automatically via `SEED_VERSION`; a full re-seed replaces the whole drive (user-created files are lost — accepted for Phase 0, refined in Phase 2).
- **svelte-check warnings**: 131 inherited warnings (a11y, unused exports) are non-gating; errors gate at 0.
- **Known upstream bugs found during conversion (documented, intentionally not fixed in a type-only phase):** disk_properties capacity clamp never fires; MPC drag-and-drop was never wired; system_tray "Tour XP" icon no-ops (program pruned — remove icon in Phase 1 curation); desktop.svelte clears a `setTimeout` with `clearInterval`; work_space store subscriptions collected but not cleaned in `onDestroy`; shutdown.svelte `self` prop never passed.
- **CDN dependencies without SRI** (inherited): jQuery/jQuery-UI, loadjs, panzoom, Google Charts loader. Flagged for hardening in a later phase.
- **Coverage gate**: Phase 0 = glob thresholds on `src/lib/seed.ts` only. **Phase 1 switches to diff-based patch coverage (diff-cover or Codecov patch) against the post-Phase-0 `dev` baseline** — do not forget this when opening Phase 1.
- `gen/assets.js` regenerates the preload arrays in `starting.svelte`; run it after adding/removing static assets.
