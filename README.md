# Momad's XP

A personal portfolio website that recreates the Windows XP operating system in the browser. Fully interactive desktop environment, boot sequence, draggable/resizable windows, taskbar, start menu, and context menus, used as a medium to present my portfolio.

**Live:** https://momad-xp.netlify.app

## Development

```bash
npm install        # see the npm version warning below
npm run dev        # dev server
npm run check      # svelte-check (strict TS — must be 0 errors)
npm run lint       # eslint
npx vitest run     # unit tests
npm run build      # production build
npx playwright test  # E2E suite
```

### ⚠️ Use npm 10 for anything that touches the lockfile

CI installs with **npm 10** (Node 22). Lockfiles written by npm 11+ fail `npm ci` with "Missing: … from lock file". If you run `npm install`, `npm audit fix`, or add a dependency, regenerate the lock with:

```bash
npx -y npm@10 install
```

### Content is generated — don't hand-edit

All portfolio content lives in `src/lib/data/profile.json`. The virtual-filesystem seed (`static/json/hard_drive.json`) and `src/lib/generated/*` are **generated** from it — never edit them by hand. After any `profile.json` change:

```bash
npm run generate:vfs
```

CI fails if the committed seed drifts from a fresh regeneration. Images are `{ "src": "...", "alt": "..." }` objects referencing files in `static/assets/images/`.

### Workflow

Work lands on `feature/*` branches → PR into `dev` (CI-gated) → periodic cutover PR `dev` → `main` (production deploys from `main` only). The full phase workflow (spec → red-team → plan → red-team → implement → review) is documented in `docs/SPECIFICATION.md` §11; per-phase handoffs live in `docs/phase-*-guide.md`.

## Credits

Built on [win32.run](https://github.com/ducbao414/win32.run.cf) by Bao Nguyen (MIT — see `LICENSE-win32.run`).
Microsoft and Windows XP trademarks belong to Microsoft Corporation; this is a personal, non-commercial nostalgia portfolio.
