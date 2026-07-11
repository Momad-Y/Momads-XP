# Phase 0 — Base Repo Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the repo into a lean, strict-TypeScript, Netlify-deployed fork of win32.run.cf that boots straight to the XP loading screen → desktop, with tooling and CI/CD in place.

**Architecture:** Copy the base working tree in, execute the prune manifest across its four cleanup surfaces (files, VFS seed JSON, preload arrays, central program wiring), and only then make the first commit. Then: adapter-netlify swap → tooling + smoke E2E → strict TS conversion (type-only commits, E2E-bracketed) → VFS seed versioning (TDD) → CI + PR → protection → cutover.

**Tech Stack:** SvelteKit 2, Svelte 5 (componentApi 4 compat), Vite 6, Tailwind 3, TypeScript (strict, no `any`), Vitest, Playwright, ESLint flat + Prettier, GitHub Actions, Netlify (adapter-netlify).

**Spec:** `docs/superpowers/specs/2026-07-11-phase-0-base-adoption-design.md` (locked decisions + full prune manifest). Parent: `docs/SPECIFICATION.md` §9 Phase 0.

## Global Constraints

- Strict TS everywhere at phase end: `strict: true`, ESLint `@typescript-eslint/no-explicit-any: error` and `@typescript-eslint/no-unsafe-type-assertion: error`
- TS-conversion commits are **type-only** — zero logic edits; smoke E2E must pass before and after each conversion commit
- No rebranding this phase (title stays "Microsoft Windows XP Professional"); no visual changes at all
- Conventional commits (`feat:`, `chore:`, `test:`, `ci:`, `docs:`); no AI attribution lines
- Node 22 pinned identically in `netlify.toml` and CI
- Dev server: `npm run dev` → http://localhost:3000 (vite.config.js sets port 3000)
- Keep working: loading → desktop, taskbar, start menu, My Computer, image viewer, Paint (jspaint), Media Player Classic. Expected broken (rebuilt in later phases): Notepad, Minesweeper, PDF viewing, Python REPL
- Tasks 1–6 are ONE uncommitted working-tree transformation; the FIRST commit happens at the Task 7 gate. From Task 8 on, every task commits.

---

### Task 1: Branch + import the base tree + licenses

**Files:**
- Create: `feature/phase-0-base-adoption` branch off `dev`
- Create: `LICENSE-win32.run`, everything under `src/`, `static/`, `gen/`, plus `package.json`, `package-lock.json`, `svelte.config.js`, `vite.config.js`, `postcss.config.cjs`, `tailwind.config.cjs`
- Modify: `.gitignore`, `README.md`

**Interfaces:**
- Produces: the full unpruned base working tree at repo root; `npm run dev` boots the base (with BIOS screen — removed in Task 4)

- [ ] **Step 1: Branch and fresh-clone the base**

```bash
cd /home/momad/Projects/Momads-XP
git checkout dev && git pull && git checkout -b feature/phase-0-base-adoption
rm -rf /tmp/win32-base && git clone --depth 1 https://github.com/ducbao414/win32.run.cf.git /tmp/win32-base
```

- [ ] **Step 2: Copy the base tree in (no .git, no README/LICENSE overwrite)**

```bash
cp -r /tmp/win32-base/src /tmp/win32-base/static /tmp/win32-base/gen .
cp /tmp/win32-base/package.json /tmp/win32-base/package-lock.json \
   /tmp/win32-base/svelte.config.js /tmp/win32-base/vite.config.js \
   /tmp/win32-base/postcss.config.cjs /tmp/win32-base/tailwind.config.cjs .
cp /tmp/win32-base/LICENSE LICENSE-win32.run
```

- [ ] **Step 3: Merge upstream .gitignore entries into ours**

Append to `.gitignore` (SvelteKit/build artifacts):

```
# SvelteKit / build
.svelte-kit/
build/
.netlify/
coverage/
test-results/
playwright-report/
```

- [ ] **Step 4: README attribution**

Append to `README.md`:

```markdown
## Credits

Built on [win32.run](https://github.com/ducbao414/win32.run.cf) by Bao Nguyen (MIT — see `LICENSE-win32.run`).
Microsoft and Windows XP trademarks belong to Microsoft Corporation; this is a personal, non-commercial nostalgia portfolio.
```

- [ ] **Step 5: Install and verify the unpruned base runs**

```bash
npm install
npm run dev
```
Expected: http://localhost:3000 shows the BIOS boot menu → "Start Windows Normally" → XP loading → desktop. Stop the server. **No commit** (tree stays dirty until Task 7).

### Task 2: Prune static payload + VFS seed JSON

**Files:**
- Delete: `static/html/{koodo,notepad,msword,foxit_reader,games,example,ffmpeg,photon,...}` — **keep `static/html/jspaint` AND `static/html/visualizers`** (96KB; kept `media_player_classic.svelte:315` iframes `/html/visualizers/{1-12}.html` for audio playback — design deviation recorded: the "prune visualizers" rationale assumed size that isn't there); `static/files/*` EXCEPT the wallpapers (see Step 2)
- Modify: `static/json/hard_drive.json`
- Move: `static/files/wallpapers/*.jpg` → `static/images/wallpapers/`

**Interfaces:**
- Produces: `static/json/hard_drive.json` free of every entry whose `url`/`path` references pruned targets, with all parent `children` arrays consistent, wallpaper entries re-pointed to `/images/wallpapers/*`; consumed by Task 5's preload regen and Task 14's hashing

> ⚠ CRITICAL wallpaper constraint: `system.js`'s `bliss_wallpaper`/`wallpapers_folder` are **VFS item IDs**, not paths. The wallpaper VFS entries must SURVIVE (only their `url` fields change), and `static/files/wallpapers/` is the ONLY copy of the images — deleting entries or images black-screens the desktop (`wallpaper.svelte:13` dereferences `$hardDrive[$wallpaper]`) and crashes Display Properties.

- [ ] **Step 1: Inventory + relocate wallpapers first**

```bash
ls static/html/ && du -sh static/html/* static/files 2>/dev/null
mkdir -p static/images/wallpapers && mv static/files/wallpapers/*.jpg static/images/wallpapers/
```

- [ ] **Step 2: Delete pruned static payload**

```bash
find static/html -mindepth 1 -maxdepth 1 ! -name jspaint ! -name visualizers -exec rm -rf {} +
rm -rf static/files
```

- [ ] **Step 3: Clean `hard_drive.json` with a script (NOT by hand — parent `children` arrays must stay consistent)**

Write a small python script (throwaway, in the scratchpad) that loads the JSON and:
1. Deletes every item whose `webapp.url` contains `crazygames.com` (~20) **plus** the non-CrazyGames webapp entries (e.g. "Python REPL" → pyodide.org)
2. Deletes every item whose `url` or `path` field references a pruned program: `microsoft_word|koodo|flash_player|winrar|java|photon|xp_tour|app_installer|webapp|foxit_reader|notepad|minesweeper`
3. Deletes every file entry whose `url` starts with `/files/` EXCEPT wallpaper entries — for those, rewrite `url` from `/files/wallpapers/X.jpg` → `/images/wallpapers/X.jpg`
4. **Removes every deleted ID from every remaining item's `children` array** (dangling children crash right-click → New and Display Properties: `desktop_folder.svelte:189`, `fs.js` name-collision builder)
5. Re-serializes and reports counts

Verify:

```bash
grep -c "crazygames\|pyodide" static/json/hard_drive.json   # expected: 0
grep -cE "microsoft_word|koodo|flash_player|winrar|java|photon|xp_tour|app_installer|webapp|foxit_reader|notepad|minesweeper" static/json/hard_drive.json  # expected: 0
grep -c "/files/" static/json/hard_drive.json               # expected: 0
python3 - <<'EOF'
import json
d = json.load(open('static/json/hard_drive.json'))
items = d if isinstance(d, dict) else {}
ids = set(items.keys())
dangling = [(k, c) for k, v in items.items() if isinstance(v, dict)
            for c in (v.get('children') or []) if c not in ids]
print('dangling children:', dangling or 'NONE')
EOF
```
Expected: `dangling children: NONE` (adapt the script to the JSON's actual top-level shape).

### Task 3: Prune program components + central wiring

**Files:**
- Delete: `src/routes/xp/programs/{microsoft_word,koodo,flash_player,winrar,java,photon,xp_tour,app_installer,webapp,foxit_reader,notepad,minesweeper}.svelte`, `src/routes/api/` (webapp_info)
- Modify: `src/routes/xp/work_space.svelte`, `src/lib/system.js`, `src/lib/fs.js`, `src/routes/xp/start_menu.svelte`

**Interfaces:**
- Consumes: pruned `hard_drive.json` from Task 2
- Produces: a `launch()` dispatch and `doctypes` registry that only reference kept programs: `my_computer`, `display_properties`, `internet_explorer`, `paint`, `media_player_classic`, `properties`, `disk_properties`, `zip`, `image_viewer`, `copier` (note: `volume_adjust` is launched from `system_tray.svelte:22`, not from `launch()` — it won't appear in the work_space grep and that's correct)

- [ ] **Step 1: Delete the program files + API route**

```bash
cd src/routes/xp/programs
rm microsoft_word.svelte koodo.svelte flash_player.svelte winrar.svelte java.svelte \
   photon.svelte xp_tour.svelte app_installer.svelte webapp.svelte foxit_reader.svelte \
   notepad.svelte minesweeper.svelte
cd - && rm -rf src/routes/api
```

- [ ] **Step 2: Remove dead `launch()` branches in `work_space.svelte`**

`src/routes/xp/work_space.svelte` lines ~32–260: the `launch()` function is an if/else chain where each branch does `const Program = (await import('./programs/X.svelte')).default;`. Delete the entire branch (condition + body) for each pruned program listed in Step 1. Verify:

```bash
grep -n "import('./programs/" src/routes/xp/work_space.svelte
```
Expected: only kept programs remain (list in Interfaces above).

- [ ] **Step 3: Clean the `doctypes` registry in `src/lib/system.js`**

Around lines 115–170: delete the descriptor objects `photon_program`, `foxit_reader_program`, `msword_program`, `koodo_program`, `notepad_program`, `winrar_program`, `flash_player_program`, and every use of them inside the `doctypes` map. Re-point affected extensions:
- images (`.png/.jpg/.bmp/...`): `[image_viewer, photon, paint]` → `[image_viewer, paint_program]` (drop photon, **keep paint**)
- `.html`: `[ie, koodo, notepad]` → `[ie_program]`
- `.pdf`/`.doc(x)`/ebook/archive/`.txt`/script extensions with no surviving handler: **delete the KEY entirely** — do NOT leave `[]` (kept `desktop_folder.svelte:141-143` checks `doctypes[ext] != null` then dereferences `[0].path`; an empty array passes the guard and crashes on double-click)
Keep `image_viewer`, `paint_program`, `mpc_program`, `ie_program`.

- [ ] **Step 3b: Remove pruned script loads from kept `desktop.svelte`**

`desktop.svelte:64` `loadjs([...])` — remove `/js/mammoth.browser.min.js` (msword support) and the `@ruffle-rs/ruffle` CDN entry (flash support). Then delete the orphaned libs (design "Orphaned libs" row):

```bash
rm -f static/js/ace.js static/js/mammoth.browser.min.js
rm -rf static/js/libarchive.js src/lib/libarchive.js src/lib/docx
grep -rn "ace.js\|mammoth\|libarchive\|ruffle" src/  # expected: no output
```

- [ ] **Step 4: Remove the webapp fallback in `src/lib/fs.js`**

Line ~266: `item.url = './programs/webapp.svelte';` — delete the executable-fallback branch (or make it a no-op returning the item unmodified). Check surrounding context for an `if` that special-cases executables and remove coherently.

- [ ] **Step 5: Clean `start_menu.svelte`**

Remove menu entries whose `path` points at pruned programs (lines ~18, 32, 38, 44, 56, 96, 103, 351, 365, 371, 377, 388, 394, 406 in the unmodified file — grep, don't trust line numbers after edits). The Games submenu block (line ~335) was emptied by Task 2's JSON edit only if it reads from the VFS — this one is hardcoded in the component: delete the pruned game items from it (keep the submenu with the surviving Minesweeper entry removed too — the whole hardcoded games list goes; Games rebuild in Phase 4). Verify:

```bash
grep -n "programs/" src/routes/xp/start_menu.svelte | grep -vE "my_computer|internet_explorer|paint|media_player_classic|display_properties|image_viewer"
```
Expected: no output.

- [ ] **Step 6: Boot check**

```bash
npm run dev
```
Expected: still boots to desktop (BIOS still present); start menu opens without console errors; My Computer, Paint, image viewer, MPC launch. Pruned apps absent.

### Task 4: Boot flow — kill BIOS + installation, entry = loading screen

**Files:**
- Delete: `src/routes/installation/`, `src/routes/boot_manager.svelte`, `src/lib/components/95/`, `src/lib/components/dos/` (verify only installation flows consume them first)
- Modify: `src/routes/+page.svelte`, `src/routes/xp/starting.svelte`, `src/lib/utils.js`

**Interfaces:**
- Consumes: `starting.svelte` dispatches `load_page` with `{url: './xp/desktop.svelte'}`; `desktop.svelte` dispatches shutdown/blackout URLs
- Produces: `+page.svelte` that mounts `starting.svelte` first and still resolves every URL that kept components dispatch

- [ ] **Step 1: Map the surviving `load_page` URL contract**

```bash
grep -rn "load_page" src/routes/xp/*.svelte | grep dispatch
```
Record every URL dispatched by KEPT components (expect: `./xp/desktop.svelte`, `./xp/shutdown.svelte`, `./xp/blackout.svelte`, possibly `./+page.svelte` for restart).

- [ ] **Step 2: Check 95/dos component consumers before deleting**

```bash
grep -rln "components/95\|components/dos" src/ | grep -v "src/lib/components/95\|src/lib/components/dos\|src/routes/installation"
```
Expected: no output → safe to delete both component dirs with `installation/`. If output appears, keep whichever dir is referenced and note it.

- [ ] **Step 3: Delete + rewrite**

```bash
rm -rf src/routes/installation src/routes/boot_manager.svelte
# plus src/lib/components/95 and/or dos per Step 2
```

Rewrite `src/routes/+page.svelte` to (adjust the URL list to exactly what Step 1 recorded — verified so far: `./xp/desktop.svelte` from starting:51, `./xp/shutdown.svelte` from desktop:37,43 — restart also routes through shutdown — and `./xp/blackout.svelte` from shutdown:19):

```svelte
<script>
    import { onMount } from 'svelte';

    let page;

    onMount(async () => {
        await load_page('./xp/starting.svelte');
    });

    async function load_page(url) {
        if (url == './xp/starting.svelte') {
            page = (await import('./xp/starting.svelte')).default;
        } else if (url == './xp/desktop.svelte') {
            page = (await import('./xp/desktop.svelte')).default;
        } else if (url == './xp/shutdown.svelte') {
            page = (await import('./xp/shutdown.svelte')).default;
        } else if (url == './xp/blackout.svelte') {
            page = (await import('./xp/blackout.svelte')).default;
        } else if (url == './+page.svelte') {
            page = (await import('./xp/starting.svelte')).default; // restart → boot again
        }
    }
</script>

<svelte:head>
    <title>Microsoft Windows XP Professional</title>
</svelte:head>

<svelte:component this={page} on:load_page={(e) => load_page(e.detail.url)} />
```

(The `<svelte:head>` title is the original's only wrapper markup — carrying it is a hard Phase 0 constraint: no rebranding.)

- [ ] **Step 4: Remove the installation branch in `starting.svelte`**

Lines ~48–52: replace

```js
if(utils.is_installing_windows()){
    dispatcher('load_page', {url: './installation/95/installing.svelte'});
} else {
    dispatcher('load_page', {url: './xp/desktop.svelte'});
}
```

with

```js
dispatcher('load_page', {url: './xp/desktop.svelte'});
```

Then delete `is_installing_windows`/`set_installing_windows` from `src/lib/utils.js` and remove any remaining callers:

```bash
grep -rn "installing_windows" src/   # expected: no output after cleanup
```

- [ ] **Step 5: Boot check**

`npm run dev` → http://localhost:3000 goes **straight to the XP loading screen**, then desktop. Shut Down still works (dispatch contract intact).

### Task 5: Regenerate preloads + prune dead deps

**Files:**
- Modify: `src/routes/xp/starting.svelte` (the `remote_files`/`images`/`audios` preload arrays), `gen/assets.js`, `package.json`

**Interfaces:**
- Consumes: pruned `static/` tree
- Produces: preload arrays that reference only existing files; `package.json` without `@faker-js/faker`/`docx`

- [ ] **Step 1: Make `gen/assets.js` runnable and regenerate**

`gen/assets.js` imports `node-dir` (not in package.json) **and crashes post-prune**: its `dir.files('./static/files/', {sync: true})` walk hits a deleted directory (ENOENT before any output). Fix both: `npm i -D node-dir` (or rewrite with recursive `fs.readdirSync`) and remove/guard the `static/files` walk. Run it, and replace the `images`, `audios`, `fonts`, `empties` arrays in `starting.svelte` with the regenerated output (wallpapers now appear under `/images/wallpapers/`). The `remote_files` array is deleted — remove its spread from the `load_assets([...])` call too. In `preload_iframes()`, keep only jspaint (and visualizers if listed).

- [ ] **Step 2: Verify no dead preloads**

```bash
node -e "
const s = require('fs').readFileSync('src/routes/xp/starting.svelte','utf8');
const urls = [...s.matchAll(/\"(\/(?:images|audio|fonts|empty|files|html)[^\"]+)\"/g)].map(m=>m[1]);
const fs = require('fs');
const missing = urls.filter(u => !fs.existsSync('static'+u));
console.log(missing.length ? missing : 'all preloads exist');
"
```
Expected: `all preloads exist`.

- [ ] **Step 3: Remove genuinely dead deps (design doc: axios and build-url STAY)**

```bash
npm rm @faker-js/faker docx
npx depcheck   # review: expect no unused deps besides known dev tooling
npm run dev    # boots clean
```
`@tailwindcss/line-clamp`: check `node_modules/tailwindcss/package.json` version — if ≥3.3, `npm rm @tailwindcss/line-clamp` and delete its `require` from `tailwind.config.cjs:45`; otherwise leave both.

### Task 6: Migrate public/ → static/assets

**Files:**
- Move: `public/assets/images/{avatar,xp-logo}.png`, `public/assets/icons/{about-me,contact-me,my-cv,chess,doom}.png` → `static/assets/`
- Delete: `public/`

- [ ] **Step 1: Move and delete**

```bash
mkdir -p static/assets/icons static/assets/images
git mv public/assets/images/avatar.png public/assets/images/xp-logo.png static/assets/images/
git mv public/assets/icons/about-me.png public/assets/icons/contact-me.png \
       public/assets/icons/my-cv.png public/assets/icons/chess.png public/assets/icons/doom.png static/assets/icons/
rmdir -p public/assets/icons public/assets/images 2>/dev/null; rm -rf public
```

### Task 7: GATE — verify, then first commit

- [ ] **Step 1: Full gate**

```bash
npm run dev   # manual checklist:
#  - loading → desktop, WALLPAPER RENDERS (not black)
#  - open/drag/resize/close My Computer; start menu opens
#  - right-click desktop → New → Folder AND New → Text Document (no crash; the .txt just has no handler on double-click)
#  - Display Properties opens and lists wallpapers; switching wallpaper works
#  - Paint (jspaint) opens; image viewer opens an image; MPC opens and its visualizer iframe loads
npm run build # must exit 0 (verified: adapter-cloudflare builds locally without CF credentials)
du -sh static  # expect ≈60MB (jspaint alone is 45MB; audio 5.3MB, images ~4MB+wallpapers, js ~1.2MB, visualizers 96KB)
```

- [ ] **Step 2: First commit (the lean tree)**

```bash
git add -A
git commit -m "feat: adopt pruned win32.run.cf base (MIT) as project foundation

Import SvelteKit 2/Svelte 5 XP shell from ducbao414/win32.run.cf.
Prune per Phase 0 manifest: third-party embeds (except jspaint),
CrazyGames entries, non-spec programs + their launch/doctypes/menu
wiring, BIOS boot manager and Win95/DOS installation flows, orphaned
libs and dead deps. Entry now boots straight to the XP loading screen.
Migrate public/assets into static/assets. Add upstream MIT notice."
```

### Task 8: Netlify adapter + netlify.toml

**Files:**
- Modify: `svelte.config.js`, `package.json`
- Create: `netlify.toml`

- [ ] **Step 1: Swap adapter**

```bash
npm rm @sveltejs/adapter-cloudflare && npm i -D @sveltejs/adapter-netlify
```

`svelte.config.js` — replace the import and the adapter block (drop the Cloudflare `routes` option entirely):

```js
import preprocess from 'svelte-preprocess';
import adapter from '@sveltejs/adapter-netlify';

/** @type {import('@sveltejs/kit').Config} */
const config = {
    kit: {
        adapter: adapter()
    },
    compilerOptions: {
        compatibility: {
            componentApi: 4
        }
    },
    preprocess: [
        preprocess({
            postcss: true
        })
    ]
};

export default config;
```

- [ ] **Step 2: Create `netlify.toml`**

```toml
[build]
  command = "npm run build"
  publish = "build"

[build.environment]
  NODE_VERSION = "22"
```

- [ ] **Step 3: Verify + commit**

```bash
npm run build && npm run preview   # loading → desktop on the preview URL
git add -A && git commit -m "feat: swap to adapter-netlify and add netlify.toml (Node 22)"
```
Confirm `src/routes/+layout.js` still has `export const ssr = false; export const prerender = true;`.

### Task 9: Netlify site via MCP

- [ ] **Step 1:** Using the Netlify MCP tools: create site (suggest name `momads-xp`), link repo `Momad-Y/Momads-XP`, production branch `main`, deploy previews enabled for PRs, **branch deploys enabled for `dev`** (Task 15's PR targets `dev` — previews only build for PRs into branches Netlify deploys), build command/publish dir from `netlify.toml`. Record the site ID/URL in the phase notes. **Expected:** production shows a failed/empty state until the cutover — not a defect.

### Task 10: Lint/format tooling

**Files:**
- Create: `eslint.config.js`, `.prettierrc`, `.prettierignore`, `.husky/pre-commit`
- Modify: `package.json` (scripts + lint-staged)

- [ ] **Step 1: Install (typed lint needs the tsconfig NOW, so it moves here from Task 12)**

```bash
npm i -D eslint prettier eslint-plugin-svelte typescript-eslint eslint-config-prettier \
        prettier-plugin-svelte husky lint-staged typescript svelte-check
npx husky init
npx svelte-kit sync   # generates .svelte-kit/tsconfig.json that ours extends
```

Create `tsconfig.json` (moved here from Task 12 — ESLint's `projectService` needs it or every lint run/commit hook errors):

```json
{
    "extends": "./.svelte-kit/tsconfig.json",
    "compilerOptions": {
        "strict": true,
        "noUncheckedIndexedAccess": true,
        "checkJs": false,
        "allowJs": true
    }
}
```

Add to `package.json`: `"prepare": "svelte-kit sync"` (so fresh `npm ci` — including CI — regenerates `.svelte-kit/tsconfig.json` before anything type-aware runs) and `"check": "svelte-check --tsconfig ./tsconfig.json"` (NO `--fail-on-warnings` flag — it's a boolean sade option, passing `false` as a value actually turns it ON / misparses; the default already fails on errors only, which is what the design wants: Svelte 5 deprecation warnings stay non-blocking).

- [ ] **Step 2: `eslint.config.js`** (flat; **typed rules scoped to `src/`** — the generated project only includes `src/**` and `tests/**`, so config files / `e2e/` / `gen/` must not get typed rules or ESLint errors on them)

```js
import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import svelteConfig from './svelte.config.js';

export default ts.config(
    { ignores: ['build/', '.svelte-kit/', 'static/', 'coverage/', 'node_modules/', 'test-results/', 'playwright-report/'] },
    js.configs.recommended,
    ...svelte.configs.recommended,
    prettier,
    // typed, strict rules — src only
    {
        files: ['src/**/*.ts', 'src/**/*.svelte'],
        extends: [...ts.configs.strictTypeChecked],
        languageOptions: {
            parserOptions: {
                projectService: true,
                extraFileExtensions: ['.svelte'],
                svelteConfig
            }
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unsafe-type-assertion': 'error'
        }
    },
    {
        files: ['src/**/*.svelte'],
        languageOptions: { parserOptions: { parser: ts.parser } }
    },
    // untyped zone: root configs, e2e specs, gen scripts
    {
        files: ['*.js', '*.cjs', '*.ts', 'e2e/**', 'gen/**'],
        extends: [ts.configs.disableTypeChecked]
    }
);
```

- [ ] **Step 3: Prettier + hooks**

`.prettierrc`: `{ "useTabs": false, "tabWidth": 4, "singleQuote": true, "plugins": ["prettier-plugin-svelte"] }`
`.prettierignore`: `build/`, `.svelte-kit/`, `static/`, `package-lock.json`, `coverage/`
`.husky/pre-commit`: `npx lint-staged`
`package.json`: `"lint-staged": { "*.{ts,js,svelte}": ["prettier --write", "eslint --fix"] }` and scripts `"lint": "eslint ."`, `"format": "prettier --write ."`, `"format:check": "prettier --check ."`.
Note: do NOT run `prettier --write` repo-wide on inherited files yet — that's a churn commit that would poison the TS-conversion diffs; formatting normalizes per-file as files are converted in Tasks 12–13.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: add eslint (strict TS rules), prettier, husky + lint-staged"
```

### Task 11: Vitest + Playwright + smoke E2E (BEFORE the TS conversion)

**Files:**
- Create: `vitest.config.ts`, `playwright.config.ts`, `e2e/smoke.spec.ts`
- Modify: `package.json` scripts

**Interfaces:**
- Produces: `npm run test:unit`, `npm run test:e2e`; the smoke suite that brackets every conversion commit

- [ ] **Step 1: Install**

```bash
npm i -D vitest @vitest/coverage-v8 @playwright/test
npx playwright install chromium
```

- [ ] **Step 2: `vitest.config.ts`** (glob-scoped coverage per the locked ratchet decision)

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            include: ['src/lib/seed.ts'], // Phase 0 new modules only; grows per phase
            thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 }
        }
    }
});
```

- [ ] **Step 3: `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: 'e2e',
    timeout: 60_000,
    use: { viewport: { width: 1280, height: 800 } },
    webServer: {
        // CI builds earlier in the pipeline — reuse that build instead of duplicating it
        command: process.env.CI ? 'npm run preview' : 'npm run build && npm run preview',
        port: 4173, // vite preview default; vite.config's server.port 3000 applies to dev only (verified)
        reuseExistingServer: !process.env.CI,
        timeout: 180_000
    }
});
```

- [ ] **Step 4: `e2e/smoke.spec.ts`** (selectors from the base: `#start-menu-btn`, `#start-menu`; adjust to reality on first run and note changes)

```ts
import { test, expect } from '@playwright/test';

async function bootToDesktop(page) {
    await page.goto('/');
    await expect(page.locator('#start-menu-btn')).toBeVisible({ timeout: 30_000 });
}

test('boots straight to loading screen then desktop', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#start-menu-btn')).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('text=Start Windows Normally')).toHaveCount(0); // asserted AFTER boot so it can't pass vacuously pre-hydration
});

test('start menu opens and closes', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#start-menu-btn').click();
    await expect(page.locator('#start-menu')).toBeVisible();
    await page.mouse.click(640, 300);
    await expect(page.locator('#start-menu')).toBeHidden();
});

test('My Computer window opens, drags, and closes', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('p', { hasText: 'My Computer' }).first().dblclick();
    const title = page.locator('text=My Computer').last();
    await expect(title).toBeVisible();
    const win = page.locator('[class*="window"], [id*="window"]').first();
    const before = await win.boundingBox();
    await page.mouse.move(before!.x + 100, before!.y + 8);
    await page.mouse.down();
    await page.mouse.move(before!.x + 300, before!.y + 120, { steps: 10 });
    await page.mouse.up();
    const after = await win.boundingBox();
    expect(after!.x).not.toBe(before!.x);
});
```

- [ ] **Step 5: Run, fix selectors to reality, commit**

```bash
npx playwright test        # iterate on selectors until green 3x in a row
git add -A && git commit -m "test: add vitest config and Playwright smoke E2E for inherited shell"
```

### Task 12: Strict TS conversion — config + src/lib

**Files:**
- Create: `tsconfig.json`, `src/lib/types.ts`
- Modify → rename: every `src/lib/*.js` → `.ts`

- [ ] **Step 1: Verify the check pipeline (tsconfig + svelte-check landed in Task 10)**

```bash
npm run check   # runs on the still-JS tree; must exit 0 (errors only; Svelte 5 deprecation warnings expected and non-blocking)
```

- [ ] **Step 2: `src/lib/types.ts` — the shared contracts** (extend as conversion reveals shapes; keep names)

```ts
export interface VfsItem {
    id: string;
    name: string;
    icon?: string;
    path?: string; // './programs/x.svelte' for executables
    parent?: string;
    children?: string[];
    content?: unknown; // refined per filetype during conversion
    size?: number;
}

export interface ProgramDescriptor {
    path: string;
    icon: string;
    name: string;
}

export interface LoadPageEvent {
    url: string;
}
```

- [ ] **Step 3: Convert `src/lib` file-by-file** (order: `utils.js` → `store.js` → `system.js` → `fs.js` → the rest). For each file: `git mv x.js x.ts`, add types, `npm run check` clean for that file, imports updated. **Type-only policy**: no logic edits; if a bug is found, note it in the handoff, don't fix here.

- [ ] **Step 4: Bracket + commit**

```bash
npx playwright test && npm run check
git add -A && git commit -m "feat: convert src/lib to strict TypeScript"
```

### Task 13: Strict TS conversion — Svelte components + componentApi evaluation

**Files:**
- Modify: every `.svelte` in `src/routes/` and `src/lib/components/` gets `<script lang="ts">` + typed props/dispatchers

- [ ] **Step 1: Shell batch** (`+page.svelte`, `xp/*.svelte`): add `lang="ts"`, type `createEventDispatcher<{ load_page: LoadPageEvent }>()`, fix `npm run check` errors. E2E green. Commit `feat: convert XP shell components to TypeScript`.
- [ ] **Step 2: Programs + widgets batch** (`xp/programs/**`, `lib/components/**`): same. E2E green. Commit `feat: convert program and widget components to TypeScript`.
- [ ] **Step 3: componentApi evaluation (time-boxed 1h)**

```bash
grep -rn "new [A-Z][A-Za-z]*(" src/ --include='*.svelte' --include='*.ts' | grep -v "new Date\|new Audio\|new Promise\|new Error\|new URL"   # legacy instantiation sites
```
If only `work_space.svelte`'s `mount()` pattern remains (already Svelte 5 style), remove the `compatibility.componentApi` block from `svelte.config.js`, run `npm run check` + E2E; if anything breaks non-trivially, restore the flag and record in the handoff. Commit either way.

- [ ] **Step 4: ESLint full pass**

```bash
npm run lint    # zero errors; no `any`, no unsafe assertions
npm run format  # now safe: everything TS-converted; one formatting commit
git add -A && git commit -m "chore: repo-wide prettier normalization post-conversion"
```

### Task 14: VFS seed versioning (TDD)

**Files:**
- Create: `src/lib/seed.test.ts`, `src/lib/seed.ts`
- Modify: `src/routes/xp/starting.svelte` (`load_hard_drive()`)

**Interfaces:**
- Produces: `SEED_VERSION: string`, `shouldReseed(stored: string | null | undefined): boolean` consumed by `starting.svelte`

- [ ] **Step 1: Write the failing test — `src/lib/seed.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { SEED_VERSION, shouldReseed } from './seed';

describe('seed versioning', () => {
    it('exposes a non-empty content-hash version', () => {
        expect(SEED_VERSION).toMatch(/^[a-f0-9]{16,64}$/);
    });
    it('reseeds when nothing is stored', () => {
        expect(shouldReseed(undefined)).toBe(true);
        expect(shouldReseed(null)).toBe(true);
    });
    it('reseeds on version mismatch', () => {
        expect(shouldReseed('0000000000000000')).toBe(true);
    });
    it('does not reseed when versions match', () => {
        expect(shouldReseed(SEED_VERSION)).toBe(false);
    });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run` → FAIL (`Cannot find module './seed'`).

- [ ] **Step 3: Implement `src/lib/seed.ts`**

```ts
// SEED_VERSION is the sha256 (hex, first 32 chars) of static/json/hard_drive.json.
// Recompute after ANY seed edit:  sha256sum static/json/hard_drive.json | cut -c1-32
// (Phase 2 replaces this hand stamp with the generate-vfs build step.)
export const SEED_VERSION = '<paste hash here>';

export function shouldReseed(stored: string | null | undefined): boolean {
    return stored !== SEED_VERSION;
}
```

Run `sha256sum static/json/hard_drive.json | cut -c1-32` and paste the real value.

- [ ] **Step 4: Tests pass** — `npx vitest run --coverage` → PASS, coverage ≥80% on `src/lib/seed.ts`.

- [ ] **Step 5: Wire into `starting.svelte`'s `load_hard_drive()`** (behavior commit, separate from conversions)

```ts
import { SEED_VERSION, shouldReseed } from '../../lib/seed';

async function load_hard_drive() {
    let hard_drive = await get('hard_drive');
    const stored_version = await get('hard_drive_seed_version');
    if (hard_drive == null || shouldReseed(stored_version)) {
        hard_drive = (await axios({ method: 'get', url: '/json/hard_drive.json' })).data;
        await set('hard_drive', hard_drive);
        await set('hard_drive_seed_version', SEED_VERSION);
    }
    migrate_files_format(hard_drive);
    hardDrive.set(hard_drive);
}
```

- [ ] **Step 6: E2E + commit**

```bash
npx playwright test
git add -A && git commit -m "feat: add VFS seed versioning with IndexedDB re-seed on hash change"
```

### Task 15: CI workflow + PR to dev

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
    branches: [dev, main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: npm run lint
      - run: npm run format:check
      - run: npx vitest run --coverage
      - run: npm run build
      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ hashFiles('package-lock.json') }}
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test
        env:
          CI: 'true'
```

- [ ] **Step 2: Commit, push, open the PR**

```bash
git add -A && git commit -m "ci: add GitHub Actions pipeline (check, lint, test, build, e2e)"
git push -u origin feature/phase-0-base-adoption
gh pr create --base dev --title "Phase 0: adopt pruned win32.run.cf base with strict TS, tooling, CI" \
  --body "Implements docs/superpowers/plans/2026-07-11-phase-0-base-adoption.md. See design doc for the prune manifest and locked decisions."
```

- [ ] **Step 3: Verify CI green + Netlify deploy preview boots to desktop.** Fix anything red before proceeding.

### Task 16: Gate 6 hook — review, merge, protect, cutover

- [ ] **Step 1:** Run the Phase 0 implementation red-team (code review + security review agents on the PR diff) per SPECIFICATION.md §11 gate 6; fix findings; push.
- [ ] **Step 2: Merge PR into dev.** Then enable branch protection (checks have now run):

```bash
# -F (not -f) for strict: the endpoint type-checks booleans; -f would send the string "true" → 422
gh api -X PUT repos/Momad-Y/Momads-XP/branches/dev/protection \
  -F 'required_status_checks[strict]=true' -f 'required_status_checks[contexts][]=ci' \
  -F 'enforce_admins=false' -F 'required_pull_request_reviews=null' -F 'restrictions=null'
gh api -X PUT repos/Momad-Y/Momads-XP/branches/main/protection \
  -F 'required_status_checks[strict]=true' -f 'required_status_checks[contexts][]=ci' \
  -F 'enforce_admins=false' -F 'required_pull_request_reviews=null' -F 'restrictions=null'
```

- [ ] **Step 3: Cutover** — `gh pr create --base main --head dev --title "Cutover: Phase 0 skeleton"`; CI green → merge → Netlify production deploy → verify the production URL boots loading → desktop.
- [ ] **Step 4:** Write `docs/phase-0-guide.md` per SPECIFICATION.md §11 (assets, setup, env "None for this phase" + why, Netlify notes, functional checklist, visual parity report for inherited surfaces, gotchas incl. componentApi outcome, the kept-visualizers design deviation, and — critical for Phase 1 — the note that **the coverage gate switches to diff-based patch coverage (diff-cover or Codecov patch) against the post-Phase-0 `dev` baseline**). Commit to dev. State: **"Phase 0 is complete."**
