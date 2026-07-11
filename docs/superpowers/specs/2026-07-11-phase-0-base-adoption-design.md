# Phase 0 — Base Repo Adoption: Design

> Design doc for Phase 0 of Momad's XP (see `docs/SPECIFICATION.md` §9 Phase 0, §5, §6.7, §11).
> Status: approved by owner (2026-07-11). Next: red-team this spec, then implementation plan.

## Goal

Adopt [win32.run.cf](https://github.com/ducbao414/win32.run.cf) (MIT, SvelteKit 2 + Svelte 5 + Vite 6)
as the project's foundation: prune it to a lean XP shell, convert it to strict TypeScript,
stand up tooling + CI/CD, and deploy the skeleton to Netlify.

## Locked decisions

| Decision | Verdict | Rationale |
| --- | --- | --- |
| Clone strategy | **Prune before first commit** | Copy base → execute prune manifest locally → verify build → first commit is already the lean (~45MB) tree. Git history never carries the ~130MB of removed embeds; upstream repo + this manifest are the removed-code record. (Rejected: vendor-snapshot-then-prune — permanent history bloat; subtree/upstream remote — TS conversion + rebrand make future upstream merges unmergeable.) |
| Netlify setup | **Via Netlify MCP from this session** | Create site, link GitHub repo, production branch = `main`, deploy previews on PRs. Owner is authenticated. |
| Coverage gate | **Ratchet: new/changed code only** | Phase 0: 80%+ enforced via **glob-scoped Vitest thresholds on new modules only** (seed-version logic, extracted utils) — the TS-conversion diff renames every inherited file, so a naive diff-based gate would demand 80% on the whole codebase in the first PR, which is exactly what this decision rejects. From Phase 1: diff-based patch coverage vs the post-Phase-0 `dev` baseline, enforced with **diff-cover** (lcov × git diff) or Codecov patch status in CI. Inherited code is protected by smoke E2E and gains unit coverage as later phases touch it. |
| Work ordering | **Prune → adapter swap → tooling + smoke E2E → TS conversion → seed-version logic (TDD) → CI/CD + deploy** | Converting after pruning means ~40% less code to convert; tooling (Playwright/Vitest/ESLint) must exist **before** the conversion so the smoke E2E can run before/after it, and before the seed-version logic so that is written TDD in typed code. |
| Branch flow | Single `feature/phase-0-base-adoption` off `dev`, logical commits, one PR into `dev`; cutover `dev` → `main` at phase exit | First PR also proves the CI + deploy-preview pipeline end to end. |
| Rebranding | **None in Phase 0** | Shell keeps "Microsoft Windows XP Professional" title/branding until Phase 1 (per SPECIFICATION.md phase split). |

## 1. Import & merge with existing repo

Copy from `.claude/research/win32.run.cf` (fresh clone at implementation time to get latest):
`src/`, `static/`, `package.json`, `package-lock.json`, `svelte.config.js`, `vite.config.js`,
`postcss.config.cjs`, `tailwind.config.cjs`, upstream `.gitignore` entries (merged into ours), and `gen/`
— note `gen/assets.js` / `gen/imports.js` are **generator scripts** (dev tooling, not consumed by `src/`):
`gen/assets.js` is what produced the ~172-path preload array in `starting.svelte`, so we keep them,
add their missing `node-dir` dep as a devDependency (or rewrite on `fs.readdir`), and **use them to
regenerate the preload list after the prune** instead of hand-editing. There is no upstream
tsconfig/jsconfig — our strict `tsconfig.json` is net-new in step 4.

Keep ours: `README.md` (add an attribution section), `LICENSE`, `docs/`, `design/`, `public/` (until migration below), `.claude/`.

Add: `LICENSE-win32.run` — upstream's MIT copyright + permission notice verbatim (MIT requires it).

## 2. Prune manifest (before first commit)

Every removal includes **four cleanup surfaces**: (1) `static/json/hard_drive.json` entries,
(2) `starting.svelte` preload paths (~172 image paths + 6 `/html/*` iframe preloads — regenerate via `gen/assets.js`),
(3) start-menu/desktop registrations, and (4) the **central program wiring** the base hardcodes:

- `src/routes/xp/work_space.svelte:32-260` — the `launch()` switch with literal dynamic imports of every
  program (Vite resolves these statically; a deleted `.svelte` file with a surviving import branch **fails the build**)
- `src/lib/system.js:115-170` — the `doctypes` extension→program registry (e.g. `.pdf` → foxit, `.png` → photon);
  every pruned program's descriptors go, and affected extensions are re-pointed (images → kept `image_viewer`) or dropped
- `src/lib/fs.js:266` — the `./programs/webapp.svelte` executable fallback, dangling after the webapp prune

| Remove | Detail |
| --- | --- |
| `static/html/*` except `jspaint/` | koodo (28MB), notepad (26MB ace build), msword (8.4MB), foxit_reader (16MB), minesweeper embed (licenseless, CDN jQuery), visualizers |
| CrazyGames | ~20 game entries in `hard_drive.json`; `static/files/*` demo media |
| Programs | `microsoft_word`, `koodo`, `flash_player`, `winrar`, `java`, `photon`, `xp_tour`, `app_installer`, `webapp` (.svelte files) + `src/routes/api/webapp_info/` (only consumer is app_installer) |
| Boot/installation | `src/routes/installation/` (Win95/DOS flows) + `boot_manager.svelte` (BIOS/boot-device menu); rewrite `src/routes/+page.svelte` (currently a hardcoded dynamic-import switch over boot_manager + every installation route) to mount the XP loading screen (`starting.svelte`) directly, **preserving the `load_page` event contract** (`starting.svelte` dispatches `./xp/desktop.svelte`; `desktop.svelte` dispatches shutdown/blackout). Also edit **kept** `starting.svelte:48-49` — it branches into the pruned installation flow via `utils.is_installing_windows()`; remove the branch and the now-dead `is_installing_windows`/`set_installing_windows` utils |
| Orphaned libs | `static/js/ace.js`, `static/js/mammoth.browser.min.js`, `static/js/libarchive.js` (5MB), vendored `src/lib/libarchive.js/`, `src/lib/docx/` |
| Dead npm deps | `@faker-js/faker`, `docx`, plus anything orphaned by the prunes (verify with a depcheck pass). **NOT dead — keep in Phase 0:** `axios` (imported by kept `starting.svelte:5,59` — it fetches the VFS seed — and `desktop.svelte:5`) and `build-url` (kept `internet_explorer.svelte:8`); swapping them for `fetch`/inline code is a behavior edit deferred to when those files are next touched. `@tailwindcss/line-clamp`: remove only together with its `tailwind.config.cjs:45` registration, and only if the lockfile resolves Tailwind ≥3.3 (line-clamp in core); otherwise keep |

Also here: migrate the remaining `public/assets/` production files (avatar, xp-logo, about-me / contact-me /
my-cv / chess / doom icons) into `static/assets/` and delete `public/` (parent spec §9 requires it this phase).

Gate: `npm run dev` boots loading → desktop; windows open/close/drag/resize; `npm run build` passes. Then first commit.

**Expected broken after prune (by design, rebuilt later):** Notepad, Minesweeper, PDF viewing, Python REPL.
**Must still work:** loading screen → desktop, taskbar, start menu, My Computer/Explorer, image viewer, Paint (jspaint), Media Player Classic.

## 3. Adapter swap + Netlify site

- Swap `@sveltejs/adapter-cloudflare` → `@sveltejs/adapter-netlify`; drop the Cloudflare-specific
  `routes.include/exclude` block from `svelte.config.js`; **preserve `ssr = false` / `prerender = true`**
  in `+layout` (adapter-netlify emits a fully-prerendered static site from it — verified fine)
- `netlify.toml`: build command, publish dir, Node 22 pinned (same version pinned in CI; Netlify build image supports it)
- No serverless functions ship in Phase 0 (`/api/email`, `/api/chat` are Phases 2/5)
- Netlify MCP: create site, link `Momad-Y/Momads-XP`, production branch `main`, deploy previews on PRs.
  **Expected:** the production site stays failed/empty until the phase-exit cutover puts a buildable app
  on `main` — a red Netlify dashboard mid-phase is not a defect

## 4. Tooling + smoke E2E (before the TS conversion)

- ESLint + Prettier + husky + lint-staged; Vitest (unit); Playwright (E2E)
- Smoke E2E protecting inherited surfaces, written **now** so it brackets the conversion:
  loading screen appears → desktop renders → a window opens/drags/closes → taskbar + start menu function
- Coverage (per locked decision): glob-scoped Vitest 80% thresholds on Phase 0's new modules only;
  the diff-based ratchet (diff-cover / Codecov patch) starts Phase 1 against the post-Phase-0 `dev` baseline

## 5. Strict TypeScript conversion

- `tsconfig.json` with `strict: true`; ESLint flat config with `@typescript-eslint/no-explicit-any: error`
  plus `@typescript-eslint/no-unsafe-type-assertion` (blocks `as unknown as T` laundering; targeted
  exemptions require an eslint-disable comment with justification)
- All remaining `src/**/*.js` → `.ts`; every `.svelte` gets `lang="ts"`
- Real interfaces for upstream data shapes (window state, VFS nodes, program registry)
- Conversion commits are **type-only by policy** — no logic edits mixed in; the smoke E2E runs before and after
- `svelte-check`: zero errors required; warnings triaged (the base's `<svelte:component>` and legacy
  component API produce Svelte 5 deprecation warnings under the compat flag — documented, not blocking)
- `compilerOptions.compatibility.componentApi: 4`: evaluate dropping — migrate call sites if the
  cascade is small; otherwise keep the flag and record it in the phase handoff

## 6. VFS seed versioning (TDD, in typed code)

- VFS `SEED_VERSION` (SPECIFICATION.md §6.7): stamp = content hash of the pruned `hard_drive.json`
  (hand-computed/stamped this phase; the `profile.json` → seed generator arrives in Phase 2)
- Boot logic in `starting.svelte`'s seed load path: stored version ≠ seed version → re-seed IndexedDB
- Written test-first (Vitest) after the TS conversion, so Phase 0's flagship new code is typed and covered
- Not needed for the earlier prune gate — dev browsers clear site data manually until this lands

## 7. CI/CD + phase exit

- `.github/workflows/ci.yml`: npm ci → svelte-check + `tsc --noEmit` → ESLint/Prettier → Vitest →
  `npm run build` → Playwright E2E against `vite preview` of that build (Playwright's `webServer` reuses
  the build instead of duplicating it; `npx playwright install --with-deps chromium` with caching)
- Branch protection: GitHub can only require checks that have run at least once — so the phase-0 PR
  itself merges unprotected; protection on `dev` and `main` is enabled immediately after its first CI run
- Final: PR `feature/phase-0-base-adoption` → `dev` (proves CI + deploy preview), then cutover PR
  `dev` → `main` (first production deploy)

## Risks

| Risk | Mitigation |
| --- | --- |
| Prune breaks hidden references (preloads, VFS entries, program registry) | Manifest pairs every deletion with its hard_drive.json/preload/menu cleanup; dev-boot gate before first commit; stale IndexedDB in dev browsers → clear site data / rely on SEED_VERSION |
| TS conversion introduces behavior changes | Conversion commits are type-only by policy; smoke E2E runs before/after; no logic edits mixed into conversion commits |
| `componentApi: 4` removal cascades | Time-boxed evaluation; keeping the flag is an accepted outcome |
| Netlify build differs from local (adapter, Node version) | Node pinned identically in netlify.toml + CI; deploy preview on the phase PR is the proving ground |
| Upstream jspaint dir is 37MB | Acceptable for now; optional slimming task if deploy size/time becomes a problem |

## Exit criteria (from SPECIFICATION.md §9 Phase 0)

Lean, MIT-attributed, fully-TypeScript XP shell (~45MB static) on Netlify via the CI/CD pipeline;
boots straight to the XP loading screen → desktop; windows/taskbar/start menu work;
`docs/phase-0-guide.md` written per §11; ends with "Phase 0 is complete."
