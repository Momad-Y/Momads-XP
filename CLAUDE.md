# Momad's XP — repo rules for Claude sessions

Source of truth: `docs/SPECIFICATION.md` (features, architecture, phases, §11 six-gate workflow). Phase handoffs: `docs/phase-{0,1,2}-guide.md` — read the latest one at session start.

## Hard rules

- **npm 10 locks.** CI's `npm ci` runs npm 10 (Node 22); locks written by npm 11+ fail it. After ANY `package.json`/lockfile change (including `npm audit fix`), regenerate: `npx -y npm@10 install`.
- **Never hand-edit generated files:** `static/json/hard_drive.json`, `src/lib/generated/*`. Edit `src/lib/data/profile.json` (content) or `scripts/vfs-base.json` (inherited shell items), then `npm run generate:vfs`. CI has a freshness gate.
- **Strict TS:** 0 svelte-check errors; ESLint `no-explicit-any` + `no-unsafe-type-assertion` are errors over `src/`. Do not grow the inherited warning count (131 as of Phase 2; burned to zero in Phase 6).
- **No hardcoded personal content in components** — everything reads `profile` from `src/lib/profile.ts`.
- **`$lib/server/*` is server-only** (SvelteKit build-time guard). Client-shared constants go in plain `src/lib/` (e.g. `email_limits.ts`).
- **E2E asserts exact UI strings** — copy changes update `e2e/*.spec.ts` in the same commit.
- **API routes** (`src/routes/api/*`) must export `const prerender = false` or adapter-netlify emits no function.

## Workflow

- Branches: `feature/*` off `dev` → CI-gated PR into `dev` → cutover PR `dev`→`main` (production = `main` only).
- Gates before every push: `npm run check` && `npm run lint` && `npm run format:check` && `npx vitest run --coverage` && `npm run build` && `npx playwright test`.
- Phases run the §11 six-gate loop (spec → red-team → plan → red-team → implement → fresh-context review + parity + phase guide). Red-team subagents get fresh context and a find-problems framing.
- `gh pr merge` can lag after checks pass: verify with `gh pr view N --json state`, retry after ~15s; use `gh pr update-branch` when BEHIND.

## Known traps (details in `docs/phase-*-guide.md` §Notes)

- Playwright vs `vite preview`: server routes don't run — mock `/api/*` in E2E; verify real functions on Netlify deploy previews.
- vitest can't resolve `$env/dynamic/private` — `vi.mock` it before importing a `+server.ts`.
- Explorer shows a one-time "File Transfer" dialog on first folder entry — E2E must dismiss it.
- Long Svelte `style:` values must be mustached (`style:background={'...'}`) or prettier/svelte2tsx break.
- pdfjs-dist v6: `getDocument({ url })`, `render({ canvas, viewport })`, `destroy()` on the loading task.
- Resend sandbox (no verified domain): delivers only to the account's own email, compared case-sensitively — recipient is lowercased in `/api/email`.
