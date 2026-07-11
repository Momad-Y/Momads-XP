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
| Coverage gate | **Ratchet: new/changed code only** | 80%+ enforced on code written/substantially modified from Phase 0 onward. Inherited code is protected by smoke E2E instead and gains unit coverage as later phases touch it. (Rejected: global 80% now — a test-writing pass over 13.5k inherited lines would dwarf the phase; E2E-only — loses the gate on our own new code.) |
| Work ordering | **Prune → adapter swap → TS conversion → tooling/CI → deploy** | Converting after pruning means ~40% less code to convert; CI lands once there is a tree worth gating. |
| Branch flow | Single `feature/phase-0-base-adoption` off `dev`, logical commits, one PR into `dev`; cutover `dev` → `main` at phase exit | First PR also proves the CI + deploy-preview pipeline end to end. |
| Rebranding | **None in Phase 0** | Shell keeps "Microsoft Windows XP Professional" title/branding until Phase 1 (per SPECIFICATION.md phase split). |

## 1. Import & merge with existing repo

Copy from `.claude/research/win32.run.cf` (fresh clone at implementation time to get latest):
`src/`, `static/`, `package.json`, `package-lock.json`, `svelte.config.js`, `vite.config.js`,
`postcss.config.cjs`, `tailwind.config.cjs`, upstream `.gitignore` entries (merged into ours), and `gen/`
(generated asset/import manifests — keep only if still consumed after the prune; there is no upstream
tsconfig/jsconfig — our strict `tsconfig.json` is net-new in step 4).

Keep ours: `README.md` (add an attribution section), `LICENSE`, `docs/`, `design/`, `public/` (until migration below), `.claude/`.

Add: `LICENSE-win32.run` — upstream's MIT copyright + permission notice verbatim (MIT requires it).

## 2. Prune manifest (before first commit)

Every removal includes its `static/json/hard_drive.json` entries, `starting.svelte` preload paths
(~172 image paths + 6 `/html/*` iframe preloads), and start-menu/desktop registrations.

| Remove | Detail |
| --- | --- |
| `static/html/*` except `jspaint/` | koodo (28MB), notepad (26MB ace build), msword (8.4MB), foxit_reader (16MB), minesweeper embed (licenseless, CDN jQuery), visualizers |
| CrazyGames | ~20 game entries in `hard_drive.json`; `static/files/*` demo media |
| Programs | `microsoft_word`, `koodo`, `flash_player`, `winrar`, `java`, `photon`, `xp_tour`, `app_installer`, `webapp` (.svelte files) + `src/routes/api/webapp_info/` (only consumer is app_installer) |
| Boot/installation | `src/routes/installation/` (Win95/DOS flows) + `boot_manager.svelte` (BIOS/boot-device menu); rewrite `src/routes/+page.svelte` (currently a hardcoded dynamic-import switch over boot_manager + every installation route) to mount the XP loading screen (`starting.svelte`) directly |
| Orphaned libs | `static/js/ace.js`, `static/js/mammoth.browser.min.js`, `static/js/libarchive.js` (5MB), vendored `src/lib/libarchive.js/`, `src/lib/docx/` |
| Dead npm deps | `@faker-js/faker`, `docx`, `axios@0.27`, `build-url`, `@tailwindcss/line-clamp`, plus anything orphaned by the prunes (verify with a depcheck pass) |

Gate: `npm run dev` boots loading → desktop; windows open/close/drag/resize; `npm run build` passes. Then first commit.

**Expected broken after prune (by design, rebuilt later):** Notepad, Minesweeper, PDF viewing, Python REPL.
**Must still work:** loading screen → desktop, taskbar, start menu, My Computer/Explorer, image viewer, Paint (jspaint), Media Player Classic.

## 3. Netlify + VFS seed versioning

- Swap `@sveltejs/adapter-cloudflare` → `@sveltejs/adapter-netlify`; drop the Cloudflare-specific
  `routes.include/exclude` block from `svelte.config.js`
- `netlify.toml`: build command, publish dir, Node 22 pinned (same version pinned in CI)
- No serverless functions ship in Phase 0 (`/api/email`, `/api/chat` are Phases 2/5)
- VFS `SEED_VERSION` (SPECIFICATION.md §6.7): stamp = content hash of the pruned `hard_drive.json`
  (hand-computed/stamped this phase; the `profile.json` → seed generator arrives in Phase 2).
  Boot logic: stored version ≠ seed version → re-seed IndexedDB
- Netlify MCP: create site, link `Momad-Y/Momads-XP`, production branch `main`, deploy previews on

## 4. Strict TypeScript conversion (after prune)

- `tsconfig.json` with `strict: true`; ESLint flat config with `@typescript-eslint/no-explicit-any: error` — no `any` anywhere
- All remaining `src/**/*.js` → `.ts`; every `.svelte` gets `lang="ts"`
- Real interfaces for upstream data shapes (window state, VFS nodes, program registry) —
  no `any`-laundering through bare `unknown` casts
- `svelte-check` passes clean and joins CI
- `compilerOptions.compatibility.componentApi: 4`: evaluate dropping — migrate call sites if the
  cascade is small; otherwise keep the flag and record it in the phase handoff

## 5. Tooling, CI/CD, tests

- ESLint + Prettier + husky + lint-staged
- Vitest (unit) + Playwright (E2E)
- Coverage ratchet: 80%+ on new/changed code vs `dev` (CI-enforced); inherited code exempt for now
- Smoke E2E protecting inherited surfaces: loading screen appears → desktop renders → a window
  opens/drags/closes → taskbar + start menu function
- Unit tests for Phase 0's own new code: seed-version check logic, any conversion-extracted utils
- `.github/workflows/ci.yml`: npm ci → svelte-check + tsc → ESLint/Prettier → Vitest → Playwright → build (per SPECIFICATION.md §5)
- Branch protection on `dev` and `main` once the workflow exists
- Final: PR `feature/phase-0-base-adoption` → `dev` (proves CI + deploy preview), then cutover PR `dev` → `main` (first production deploy)

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
