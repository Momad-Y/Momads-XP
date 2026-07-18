# Phase 2 — Portfolio Content Apps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** My Computer portfolio content (generated VFS + detail viewer), About Me, My CV (pdfjs), and Contact Me (Resend) — all driven by `profile.json`, with the hand-stamped `SEED_VERSION` retired by a build-time generator and a re-seed merge that preserves visitors' files.

**Architecture:** Four independently mergeable PR slices into `dev`. Slice 1 builds the VFS generator (`scripts/generate-vfs.ts` + pure helpers in `src/lib/vfs_gen/`), the re-seed merge, and the `portfolio_viewer` program that opens seeded entry files. Slices 2–4 each add one program (`pdf_viewer`, `about_me`, `contact_me` + `/api/email`) and flip that app's generator URL from placeholder to real. Every program follows the inherited contract: a `work_space.svelte` launch branch + `<svelte:options accessors>` component wrapping `Window`.

**Tech Stack:** SvelteKit 2 / Svelte 5 (strict TS), Tailwind 3, Vitest 4, Playwright, `tsx` (dev, runs the generator), `pdfjs-dist` (slice 2), Resend HTTP API via plain `fetch` (slice 4 — no SDK, spec D5). No other new dependencies.

**Contract:** `docs/superpowers/specs/2026-07-18-phase-2-content-apps-design.md` (post red-team). Spec references: `docs/SPECIFICATION.md` §3.1, §6.7, §6.8, §7, §9-Phase-2, §11.

## Global Constraints

Every task's requirements implicitly include this section.

- **Strict TS:** zero `any`, zero unsafe assertions (`no-explicit-any` / `no-unsafe-type-assertion` are ESLint errors over `src/`); `npm run check` must report **0 errors**.
- **Gates before every push/PR:** `npm run check` && `npm run lint` && `npm run format:check` && `npx vitest run --coverage` && `npm run build` && `npx playwright test`. Minimum per commit: `npm run check` + `npm run lint`.
- **npm-10 locks:** if you touch `package.json`, regenerate the lock with `npx -y npm@10 install` (CI's `npm ci` runs npm 10 under Node 22; an npm-11 lock fails CI).
- **Seed regeneration replaces hand-stamping:** NEVER edit `static/json/hard_drive.json`, `src/lib/generated/seed_version.ts`, or `src/lib/generated/vfs_ids.ts` by hand — run `npm run generate:vfs`. CI enforces freshness (`git diff --exit-code` after regeneration).
- **Determinism:** the generator must be byte-stable — frozen epoch `1676799354180` for all generated timestamps, deterministic ids, no `Date.now()`/randomness anywhere in `scripts/` or `src/lib/vfs_gen/`.
- **Prettier:** husky + lint-staged cover `*.{ts,js,svelte}`; run `npx prettier --write` on any JSON/MD you edit by script. `static/` is prettier-ignored; generated files under `src/lib/generated/` are formatted by the generator itself.
- **Conventional commits** (`feat:`, `fix:`, `test:`, `chore:`, `docs:`, `ci:`).
- **Branching:** slice branches `feature/phase-2-slice-{n}-<name>` cut from current `dev`; PR into `dev`; merge order 1 → 2 → 3 → 4 (2–4 flip generator constants introduced in 1; 4 touches `start_menu.svelte` like 3). After `gh pr merge`, verify with `gh pr view N --json state` and retry after ~15s (known GitHub mergeability lag).
- **E2E string coupling:** UI copy changes must update `e2e/*.spec.ts` in the same commit. E2E runs against `vite preview` (static) — **server routes do not run there**; `/api/email` is always mocked with `page.route()` in E2E.
- **No hardcoded personal content in components** — everything reads `profile` from `src/lib/profile.ts`.
- **Copy strings are quoted verbatim in tasks; do not invent additional copy.**
- File paths are repo-relative from `/home/momad/Projects/Momads-XP`.

**Shared inherited contracts used throughout (do not re-derive):**

- Program launch: `queueProgram.set({ path, fs_item?, exe_item?, name?, icon? })` (`src/lib/store.ts:9`); `work_space.svelte`'s `launch()` needs a literal-path `else if` branch per program.
- Program component contract (copy `placeholder.svelte`'s shape): `<svelte:options accessors={true} />`; exports `id`, `window`, `get_self`, `options: WindowOptions`; wraps content in `<Window {options} bind:this={window} on_click_close={destroy}>`; `destroy()` filters `runningPrograms` and `unmount()`s self.
- `VfsItem` / `HardDrive` / `WindowOptions` types: `src/lib/types.ts`; `full_vfs_item()` throws on partial items.
- XP dialogs: mount `src/lib/components/xp/Dialog.svelte` on `#desktop` exactly as `src/lib/no_association.ts` does.
- Seeding flow: `starting.svelte:173-199` (`load_hard_drive()` — cached drive + `shouldReseed`, axios fetch, offline fallback to cache).

---

# Part 1 — Slice 1: VFS generator + re-seed merge + portfolio viewer

Branch: `git checkout dev && git pull && git checkout -b feature/phase-2-slice-1-vfs-generator`

### Task 1: Draft `projects` data in `profile.json` (owner-review flagged)

**Files:**
- Modify: `src/lib/data/profile.json` (the `"projects": []` array only)
- Test: existing `src/lib/profile.test.ts` (shape already enforced by `profile.ts` `Project` interface — no new test file)

**Interfaces:**
- Consumes: `Project` interface from `src/lib/profile.ts:65` (`name`, `description`, `tech: string[]`, `url`, `images: ProfileImage[]`).
- Produces: 4–6 populated `projects` entries later tasks read via `profile.projects`.

- [ ] **Step 1: Gather source material (do not invent)**

```bash
gh repo list Momad-Y --limit 30 --json name,description,url,primaryLanguage
```

Draft 4–6 entries ONLY from: (a) repos above with real descriptions, (b) work named in `docs/Profile.pdf` (RoboCup @Home AI stack, Smart White Cane (AISC)), (c) this site itself. Rules: descriptions are 1–2 factual sentences from the repo README/description or resume bullets — no marketing superlatives; `tech` lists only technologies actually named in the source; `url` is the repo/site URL or `""`; `images: []`.

Mandatory entry (verbatim except the url check):

```json
{
    "name": "Momad's XP",
    "description": "This website — a faithful Windows XP recreation in the browser, serving as an interactive portfolio. Built with SvelteKit and strict TypeScript on top of a pruned win32.run base.",
    "tech": ["SvelteKit", "Svelte 5", "TypeScript", "Tailwind", "IndexedDB"],
    "url": "https://github.com/Momad-Y/Momads-XP",
    "images": []
}
```

- [ ] **Step 2: Validate shape and format**

```bash
npm run check && npx vitest run src/lib/profile.test.ts && npx prettier --write src/lib/data/profile.json
```

Expected: 0 errors, profile tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/profile.json
git commit -m "feat: draft projects entries in profile.json (owner review at handoff)"
```

> **Handoff flag (spec D10):** these entries are a DRAFT — the phase guide and the gate-6 handoff must tell Momad to review/edit them.

### Task 2: `portfolio_ref` type + pure portfolio-detail resolver

**Files:**
- Modify: `src/lib/types.ts` (add `PortfolioSection`, `PortfolioRef`, `VfsItem.portfolio_ref`)
- Create: `src/lib/portfolio.ts`
- Test: `src/lib/portfolio.test.ts`

**Interfaces:**
- Consumes: `profile` from `src/lib/profile.ts`.
- Produces:
    - `type PortfolioSection = 'experience' | 'projects' | 'education' | 'skills' | 'awards' | 'certifications'`
    - `interface PortfolioRef { section: PortfolioSection; key: number | string }` (string key = skills category name)
    - `VfsItem.portfolio_ref?: PortfolioRef`
    - `interface PortfolioDetail { heading: string; subheading?: string; meta_lines: string[]; bullets: string[]; chips: string[]; link?: { label: string; url: string }; images: ProfileImage[] }`
    - `resolve_portfolio_ref(ref: PortfolioRef): PortfolioDetail | null` (null on out-of-range/unknown key — never throws)

- [ ] **Step 1: Write the failing test** — `src/lib/portfolio.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { resolve_portfolio_ref } from './portfolio';
import { profile } from './profile';

describe('resolve_portfolio_ref', () => {
    it('maps an experience entry to a full detail', () => {
        const d = resolve_portfolio_ref({ section: 'experience', key: 0 });
        expect(d?.heading).toBe(profile.experience[0]?.role);
        expect(d?.subheading).toBe(profile.experience[0]?.company);
        expect(d?.meta_lines).toEqual([
            profile.experience[0]?.period,
            profile.experience[0]?.location,
        ]);
        expect(d?.bullets).toEqual(profile.experience[0]?.description);
    });

    it('maps a project with tech chips and link', () => {
        const p = profile.projects[0];
        const d = resolve_portfolio_ref({ section: 'projects', key: 0 });
        expect(d?.heading).toBe(p?.name);
        expect(d?.bullets).toEqual([p?.description]);
        expect(d?.chips).toEqual(p?.tech);
        expect(d?.link?.url).toBe(p?.url);
    });

    it('maps a skills category via string key', () => {
        const d = resolve_portfolio_ref({ section: 'skills', key: 'NLP & LLMs' });
        expect(d?.heading).toBe('NLP & LLMs');
        expect(d?.bullets).toEqual(profile.skills['NLP & LLMs']);
    });

    it('maps education with honors as a meta line', () => {
        const d = resolve_portfolio_ref({ section: 'education', key: 0 });
        expect(d?.heading).toBe(profile.education[0]?.degree);
        expect(d?.subheading).toBe(profile.education[0]?.institution);
        expect(d?.meta_lines).toContain(profile.education[0]?.honors);
    });

    it('tolerates an award with empty year', () => {
        const idx = profile.awards.findIndex((a) => a.year === '');
        const d = resolve_portfolio_ref({ section: 'awards', key: idx });
        expect(d).not.toBeNull();
        expect(d?.meta_lines).toEqual([]);
    });

    it('returns null on out-of-range or unknown keys', () => {
        expect(resolve_portfolio_ref({ section: 'experience', key: 999 })).toBeNull();
        expect(resolve_portfolio_ref({ section: 'skills', key: 'Nope' })).toBeNull();
        expect(resolve_portfolio_ref({ section: 'skills', key: 3 })).toBeNull();
    });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/portfolio.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — in `src/lib/types.ts` add (next to `VfsItem`):

```typescript
export type PortfolioSection =
    | 'experience'
    | 'projects'
    | 'education'
    | 'skills'
    | 'awards'
    | 'certifications';

/** Generator-stamped pointer from a seeded VFS entry file into profile.json. */
export interface PortfolioRef {
    section: PortfolioSection;
    /** Array index, except `skills` where it is the category name. */
    key: number | string;
}
```

and add to `VfsItem`: `portfolio_ref?: PortfolioRef;`

Create `src/lib/portfolio.ts`:

```typescript
/**
 * Resolves a generator-stamped PortfolioRef into a normalized, render-ready
 * detail (spec D1: section-aware — every schema field is mapped; optional
 * fields collapse to empty).
 */
import { profile } from './profile';
import type { ProfileImage } from './profile';
import type { PortfolioRef } from './types';

export interface PortfolioDetail {
    heading: string;
    subheading?: string;
    meta_lines: string[];
    bullets: string[];
    chips: string[];
    link?: { label: string; url: string };
    images: ProfileImage[];
}

const non_empty = (lines: (string | undefined)[]): string[] =>
    lines.filter((l): l is string => l != null && l !== '');

export function resolve_portfolio_ref(ref: PortfolioRef): PortfolioDetail | null {
    switch (ref.section) {
        case 'experience': {
            if (typeof ref.key !== 'number') return null;
            const e = profile.experience[ref.key];
            if (e == null) return null;
            return {
                heading: e.role,
                subheading: e.company,
                meta_lines: non_empty([e.period, e.location]),
                bullets: e.description,
                chips: [],
                images: e.images,
            };
        }
        case 'projects': {
            if (typeof ref.key !== 'number') return null;
            const p = profile.projects[ref.key];
            if (p == null) return null;
            return {
                heading: p.name,
                meta_lines: [],
                bullets: [p.description],
                chips: p.tech,
                link: p.url === '' ? undefined : { label: 'Visit project', url: p.url },
                images: p.images,
            };
        }
        case 'education': {
            if (typeof ref.key !== 'number') return null;
            const e = profile.education[ref.key];
            if (e == null) return null;
            return {
                heading: e.degree,
                subheading: e.institution,
                meta_lines: non_empty([e.period, e.honors]),
                bullets: [],
                chips: [],
                images: e.images,
            };
        }
        case 'skills': {
            if (typeof ref.key !== 'string') return null;
            const skills = profile.skills[ref.key];
            if (skills == null) return null;
            return {
                heading: ref.key,
                meta_lines: [],
                bullets: skills,
                chips: [],
                images: [],
            };
        }
        case 'awards': {
            if (typeof ref.key !== 'number') return null;
            const a = profile.awards[ref.key];
            if (a == null) return null;
            return {
                heading: a.title,
                meta_lines: non_empty([a.year]),
                bullets: [],
                chips: [],
                images: a.images,
            };
        }
        case 'certifications': {
            if (typeof ref.key !== 'number') return null;
            const c = profile.certifications[ref.key];
            if (c == null) return null;
            return {
                heading: c.title,
                meta_lines: [],
                bullets: [],
                chips: [],
                images: c.images,
            };
        }
    }
}
```

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/portfolio.test.ts` → PASS; `npm run check` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/portfolio.ts src/lib/portfolio.test.ts
git commit -m "feat: PortfolioRef type + section-aware detail resolver"
```

### Task 3: Pure VFS tree builder (`src/lib/vfs_gen/`)

**Files:**
- Create: `src/lib/vfs_gen/ids.ts`
- Create: `src/lib/vfs_gen/build.ts`
- Test: `src/lib/vfs_gen/build.test.ts`

**Interfaces:**
- Consumes: `Profile` type + `profile` data; `PortfolioRef` from Task 2.
- Produces (used by the generator script in Task 5 and `system.ts` wiring in Task 6):
    - `slug(text: string): string` — PascalCase alnum, e.g. `slug('Robotics Club — AASTMT')` → `'RoboticsClubAASTMT'`
    - `entry_id(section: PortfolioSection, key_text: string): string` — `'p2' + Pascal(section) + slug(key_text)`, collision-checked by the builder
    - `SEED_EPOCH = 1676799354180`
    - `build_portfolio(profile: Profile): PortfolioBuild` where `PortfolioBuild = { items: Record<string, VfsItem>; folder_ids: string[]; entry_ids: string[]; projects_folder_id: string; resume_file_id: string }`
    - Folder ids are fixed strings: `p2FolderExperience`, `p2FolderProjects`, `p2FolderEducation`, `p2FolderSkills`, `p2FolderCertifications`, `p2FolderAwards` (this §3.1 order); resume file id `p2FileResumePdf`.

- [ ] **Step 1: Write the failing test** — `src/lib/vfs_gen/build.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { profile } from '../profile';
import { SEED_EPOCH, build_portfolio, slug } from './build';

describe('slug', () => {
    it('strips non-alphanumerics and PascalCases words', () => {
        expect(slug('Robotics Club — AASTMT')).toBe('RoboticsClubAASTMT');
        expect(slug('NLP & LLMs')).toBe('NLPLLMs');
    });
});

describe('build_portfolio', () => {
    const built = build_portfolio(profile);

    it('emits the six §3.1 folders in order, parented to nothing yet', () => {
        expect(built.folder_ids).toEqual([
            'p2FolderExperience',
            'p2FolderProjects',
            'p2FolderEducation',
            'p2FolderSkills',
            'p2FolderCertifications',
            'p2FolderAwards',
        ]);
        for (const id of built.folder_ids) {
            expect(built.items[id]?.type).toBe('folder');
            expect(built.items[id]?.starting_point).toBe(true);
        }
    });

    it('creates one entry file per profile item with a stamped ref and icon', () => {
        const exp_folder = built.items['p2FolderExperience'];
        expect(exp_folder?.children).toHaveLength(profile.experience.length);
        const first = built.items[exp_folder?.children[0] ?? ''];
        expect(first?.ext).toBe('.txt');
        expect(first?.portfolio_ref).toEqual({ section: 'experience', key: 0 });
        expect(first?.icon).toBeTruthy();
        expect(first?.name).toBe(
            `${profile.experience[0]?.company} — ${profile.experience[0]?.role}.txt`,
        );
    });

    it('keys skills entries by category name', () => {
        const skills_folder = built.items['p2FolderSkills'];
        const refs = (skills_folder?.children ?? []).map(
            (id) => built.items[id]?.portfolio_ref,
        );
        expect(refs.map((r) => r?.key)).toEqual(Object.keys(profile.skills));
    });

    it('is deterministic: same input, byte-identical output', () => {
        expect(JSON.stringify(build_portfolio(profile))).toBe(
            JSON.stringify(built),
        );
        for (const item of Object.values(built.items)) {
            expect(item.date_created).toBe(SEED_EPOCH);
            expect(item.date_modified).toBe(SEED_EPOCH);
        }
    });

    it('seeds the resume pdf as a remote file', () => {
        const pdf = built.items[built.resume_file_id];
        expect(pdf?.ext).toBe('.pdf');
        expect(pdf?.storage_type).toBe('remote');
        expect(pdf?.url).toBe(profile.meta.resumePdf);
    });

    it('throws on id collisions', () => {
        const doubled = {
            ...profile,
            awards: [...profile.awards, ...profile.awards],
        };
        expect(() => build_portfolio(doubled)).toThrow(/collision/);
    });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/vfs_gen` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/lib/vfs_gen/ids.ts`:

```typescript
/** Deterministic id + slug helpers for the VFS generator (spec D2). */
import type { PortfolioSection } from '../types';

export function slug(text: string): string {
    return text
        .split(/[^a-zA-Z0-9]+/)
        .filter((w) => w.length > 0)
        .map((w) => (w === w.toUpperCase() ? w : w[0]?.toUpperCase() + w.slice(1)))
        .join('');
}

const pascal_section: Record<PortfolioSection, string> = {
    experience: 'Exp',
    projects: 'Proj',
    education: 'Edu',
    skills: 'Skill',
    awards: 'Award',
    certifications: 'Cert',
};

export function entry_id(section: PortfolioSection, key_text: string): string {
    return `p2${pascal_section[section]}${slug(key_text)}`;
}
```

`src/lib/vfs_gen/build.ts` — builds the six folders + entry files + resume pdf as complete `VfsItem`s (parents set to the folder ids; the folders' `parent` is set by the generator script to the C: drive id). Every generated item: `date_created`/`date_modified` = `SEED_EPOCH`, `sort_option: 0`, `sort_order: 0`, `size: 1` for entry files. Entry files: `type:'file'`, `ext:'.txt'`, `storage_type:'fake'` is WRONG here — use **no `storage_type`, no `url`** (they have no content; opening goes through the `.txt` doctype → `portfolio_viewer`, which reads `portfolio_ref` — see Task 4), `executable` absent. Entry `icon`: reuse the exact `.txt` icon path from `icons['.txt']` in `src/lib/system.ts` (look it up; stamp per item — the viewer grid reads per-item `icon`). Folder icons: `'/images/xp/icons/FolderClosed.png'`. Naming per section (name = `basename + ext` convention):

| section | basename | ref key |
| --- | --- | --- |
| experience | `${company} — ${role}` | index |
| projects | `${name}` | index |
| education | `${institution}` | index |
| skills | `${category}` | category name |
| certifications | `${title}` | index |
| awards | `${title}` | index |

```typescript
/** Pure portfolio→VFS tree builder. No I/O, no Date.now(), no randomness. */
import type { Profile } from '../profile';
import type { PortfolioRef, PortfolioSection, VfsItem } from '../types';
import { entry_id, slug } from './ids';

export { slug };

export const SEED_EPOCH = 1676799354180;

export interface PortfolioBuild {
    items: Record<string, VfsItem>;
    folder_ids: string[];
    entry_ids: string[];
    projects_folder_id: string;
    resume_file_id: string;
}

const FOLDERS: { id: string; name: string; section: PortfolioSection }[] = [
    { id: 'p2FolderExperience', name: 'Experience', section: 'experience' },
    { id: 'p2FolderProjects', name: 'Projects', section: 'projects' },
    { id: 'p2FolderEducation', name: 'Education', section: 'education' },
    { id: 'p2FolderSkills', name: 'Skills', section: 'skills' },
    {
        id: 'p2FolderCertifications',
        name: 'Certifications',
        section: 'certifications',
    },
    { id: 'p2FolderAwards', name: 'Awards', section: 'awards' },
];

// TXT_ICON: copy the literal from icons['.txt'] in src/lib/system.ts
const TXT_ICON = '<look up icons[".txt"] in src/lib/system.ts and inline it>';

function base_item(id: string, parent: string): Omit<VfsItem, 'type' | 'name' | 'basename' | 'ext'> {
    return {
        id,
        parent,
        children: [],
        date_created: SEED_EPOCH,
        date_modified: SEED_EPOCH,
        sort_option: 0,
        sort_order: 0,
    };
}

function entry_file(
    section: PortfolioSection,
    basename: string,
    key: PortfolioRef['key'],
    folder_id: string,
): VfsItem {
    return {
        ...base_item(entry_id(section, basename), folder_id),
        type: 'file',
        basename,
        name: `${basename}.txt`,
        ext: '.txt',
        size: 1,
        icon: TXT_ICON,
        portfolio_ref: { section, key },
    };
}

export function build_portfolio(profile: Profile): PortfolioBuild {
    const items: Record<string, VfsItem> = {};
    const entry_ids: string[] = [];

    const add = (item: VfsItem): void => {
        if (items[item.id] != null) {
            throw new Error(`vfs_gen id collision: ${item.id}`);
        }
        items[item.id] = item;
    };

    const per_section: Record<PortfolioSection, VfsItem[]> = {
        experience: profile.experience.map((e, i) =>
            entry_file('experience', `${e.company} — ${e.role}`, i, 'p2FolderExperience'),
        ),
        projects: profile.projects.map((p, i) =>
            entry_file('projects', p.name, i, 'p2FolderProjects'),
        ),
        education: profile.education.map((e, i) =>
            entry_file('education', e.institution, i, 'p2FolderEducation'),
        ),
        skills: Object.keys(profile.skills).map((category) =>
            entry_file('skills', category, category, 'p2FolderSkills'),
        ),
        certifications: profile.certifications.map((c, i) =>
            entry_file('certifications', c.title, i, 'p2FolderCertifications'),
        ),
        awards: profile.awards.map((a, i) =>
            entry_file('awards', a.title, i, 'p2FolderAwards'),
        ),
    };

    for (const folder of FOLDERS) {
        const children = per_section[folder.section];
        add({
            ...base_item(folder.id, ''), // parent stamped by the generator script (C: drive id)
            type: 'folder',
            basename: folder.name,
            name: folder.name,
            ext: '',
            icon: '/images/xp/icons/FolderClosed.png',
            starting_point: true,
            children: children.map((c) => c.id),
        });
        for (const child of children) {
            add(child);
            entry_ids.push(child.id);
        }
    }

    const resume_file_id = 'p2FileResumePdf';
    add({
        ...base_item(resume_file_id, ''), // parent stamped by the generator script
        type: 'file',
        basename: 'Mohamed_Abdelnasser_Resume',
        name: 'Mohamed_Abdelnasser_Resume.pdf',
        ext: '.pdf',
        storage_type: 'remote',
        url: profile.meta.resumePdf,
        size: 61,
    });

    return {
        items,
        folder_ids: FOLDERS.map((f) => f.id),
        entry_ids,
        projects_folder_id: 'p2FolderProjects',
        resume_file_id,
    };
}
```

(Replace the `TXT_ICON` placeholder string with the real literal from `system.ts` before committing — the test asserts `icon` is truthy, and Task 5's freshness gate locks the final value.)

- [ ] **Step 4: Run tests** — `npx vitest run src/lib/vfs_gen` → PASS; `npm run check` → 0 errors.

- [ ] **Step 5: Commit**

```bash
git add src/lib/vfs_gen/
git commit -m "feat: pure deterministic portfolio->VFS tree builder"
```

### Task 4: Re-seed merge (`merge_on_reseed`) + boot wiring

**Files:**
- Modify: `src/lib/seed.ts`
- Modify: `src/routes/xp/starting.svelte:173-199` (`load_hard_drive`)
- Test: `src/lib/seed.test.ts` (extend; keep the existing SEED_VERSION hash test until Task 5 replaces its source)

**Interfaces:**
- Consumes: `HardDrive`, `VfsItem` from `src/lib/types.ts`.
- Produces: `merge_on_reseed(cached: HardDrive, seed: HardDrive): HardDrive` — pure, never throws for well-formed maps; callers wrap in try/catch and fall back to the plain seed.

- [ ] **Step 1: Write the failing tests** — append to `src/lib/seed.test.ts` a `describe('merge_on_reseed')` block implementing the spec D3 matrix. Helpers build minimal items:

```typescript
import { merge_on_reseed } from './seed';
import type { HardDrive, VfsItem } from './types';

const item = (over: Partial<VfsItem> & { id: string }): VfsItem => ({
    type: 'file',
    name: over.id,
    basename: over.id,
    ext: '',
    children: [],
    date_created: 0,
    date_modified: 0,
    sort_option: 0,
    sort_order: 0,
    ...over,
});

const drive = (...items: VfsItem[]): HardDrive =>
    Object.fromEntries(items.map((i) => [i.id, i]));

describe('merge_on_reseed', () => {
    const seed = drive(
        item({ id: 'desktop', type: 'folder', children: ['seeded_exe'] }),
        item({ id: 'seeded_exe', parent: 'desktop', storage_type: 'fake' }),
    );

    it('carries a local desktop file and relinks it into children', () => {
        const cached = drive(
            item({ id: 'desktop', type: 'folder', children: ['seeded_exe', 'draw'] }),
            item({ id: 'seeded_exe', parent: 'desktop', storage_type: 'fake' }),
            item({ id: 'draw', parent: 'desktop', storage_type: 'local' }),
        );
        const merged = merge_on_reseed(cached, seed);
        expect(merged['draw']).toBeDefined();
        expect(merged['desktop']?.children).toEqual(['seeded_exe', 'draw']);
    });

    it('carries a nested user-folder tree whole (transitive parents)', () => {
        const cached = drive(
            item({ id: 'desktop', type: 'folder', children: ['dir'] }),
            item({ id: 'dir', type: 'folder', parent: 'desktop', storage_type: 'local', children: ['inner'] }),
            item({ id: 'inner', parent: 'dir', storage_type: 'local' }),
        );
        const merged = merge_on_reseed(cached, seed);
        expect(merged['dir']?.children).toEqual(['inner']);
        expect(merged['inner']).toBeDefined();
        expect(merged['desktop']?.children).toContain('dir');
    });

    it('drops orphaned locals (parent chain broken everywhere)', () => {
        const cached = drive(item({ id: 'lost', parent: 'gone', storage_type: 'local' }));
        expect(merge_on_reseed(cached, seed)['lost']).toBeUndefined();
    });

    it('does NOT carry stale fake/remote items (retires old placeholders)', () => {
        const cached = drive(
            item({ id: 'desktop', type: 'folder', children: ['old_exe'] }),
            item({ id: 'old_exe', parent: 'desktop', storage_type: 'fake' }),
        );
        const merged = merge_on_reseed(cached, seed);
        expect(merged['old_exe']).toBeUndefined();
        expect(merged['desktop']?.children).toEqual(['seeded_exe']);
    });

    it('seed always wins for ids it contains (no clobbering regenerated children)', () => {
        const cached = drive(
            item({ id: 'desktop', type: 'folder', children: [] }), // user "emptied" it
            item({ id: 'seeded_exe', parent: 'desktop', storage_type: 'local' }), // mutated copy
        );
        const merged = merge_on_reseed(cached, seed);
        expect(merged['seeded_exe']?.storage_type).toBe('fake');
        expect(merged['desktop']?.children).toEqual(['seeded_exe']);
    });

    it('a carried folder only keeps carried children', () => {
        const cached = drive(
            item({ id: 'desktop', type: 'folder', children: ['dir'] }),
            item({ id: 'dir', type: 'folder', parent: 'desktop', storage_type: 'local', children: ['copy'] }),
            item({ id: 'copy', parent: 'dir', storage_type: 'remote' }),
        );
        expect(merge_on_reseed(cached, seed)['dir']?.children).toEqual([]);
    });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/seed.test.ts` → FAIL (`merge_on_reseed` not exported).

- [ ] **Step 3: Implement** — append to `src/lib/seed.ts`:

```typescript
import type { HardDrive } from './types';

/**
 * Re-seed merge (spec D3): the new seed owns every id it contains; the
 * visitor's `storage_type:'local'` items are carried when their parent
 * resolves in seed ∪ carried (transitively), then relinked into their seed
 * parent's `children` (folders render from `parent.children`, not `.parent`).
 * Non-`local` cached extras (copies, stale placeholder exes) are dropped.
 */
export function merge_on_reseed(cached: HardDrive, seed: HardDrive): HardDrive {
    const candidates = Object.values(cached).filter(
        (i) => i.storage_type === 'local' && seed[i.id] == null,
    );
    const carried = new Set<string>();
    let grew = true;
    while (grew) {
        grew = false;
        for (const c of candidates) {
            if (carried.has(c.id)) continue;
            const p = c.parent;
            if (p != null && (seed[p] != null || carried.has(p))) {
                carried.add(c.id);
                grew = true;
            }
        }
    }

    const result: HardDrive = { ...seed };
    for (const id of carried) {
        const c = cached[id];
        if (c == null) continue;
        result[id] = {
            ...c,
            children: c.children.filter((child) => carried.has(child)),
        };
    }
    for (const id of carried) {
        const c = cached[id];
        const p = c?.parent;
        if (c == null || p == null || seed[p] == null) continue;
        const parent = result[p];
        if (parent != null && !parent.children.includes(id)) {
            result[p] = { ...parent, children: [...parent.children, id] };
        }
    }
    return result;
}
```

- [ ] **Step 4: Wire the boot path** — in `starting.svelte`'s `load_hard_drive()`, replace the assignment inside the successful re-seed fetch (currently `hard_drive = (await axios.get...).data` then `set(...)`) so a cached drive is merged:

```typescript
const fetched = (await axios.get<StoredHardDrive>('/json/hard_drive.json')).data;
if (cached == null) {
    hard_drive = fetched;
} else {
    try {
        hard_drive = merge_on_reseed(cached, fetched);
    } catch (error) {
        console.error('re-seed merge failed; using plain seed', error);
        hard_drive = fetched;
    }
}
await set('hard_drive', hard_drive);
await set('hard_drive_seed_version', SEED_VERSION);
```

(`StoredHardDrive` stays whatever type it is today; import `merge_on_reseed` from `../../lib/seed`.)

- [ ] **Step 5: Run gates** — `npx vitest run` → all PASS; `npm run check` → 0 errors; `npm run lint`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/seed.ts src/lib/seed.test.ts src/routes/xp/starting.svelte
git commit -m "feat: re-seed merge preserves visitors' local files (spec D3)"
```

### Task 5: Generator script + generated modules + npm/CI wiring

**Files:**
- Create: `scripts/vfs-base.json` (one-time frozen input: current seed minus the three Phase-1 placeholder `.exe` items)
- Create: `scripts/generate-vfs.ts`
- Create (generated): `src/lib/generated/seed_version.ts`, `src/lib/generated/vfs_ids.ts`, regenerated `static/json/hard_drive.json`
- Modify: `src/lib/seed.ts` (SEED_VERSION now re-exported from generated module), `package.json` (script + `tsx` dev dep), `.github/workflows/ci.yml` (freshness step), `src/lib/seed.test.ts` (hash test reads generated version — logic unchanged)
- Delete: `gen/curate_seed_phase1.mjs` (superseded)

**Interfaces:**
- Consumes: `build_portfolio` (Task 3).
- Produces:
    - `npm run generate:vfs` (`tsx scripts/generate-vfs.ts`)
    - `src/lib/generated/vfs_ids.ts` exporting `PORTFOLIO_FOLDER_IDS: string[]`, `PORTFOLIO_ENTRY_IDS: string[]`, `PROJECTS_FOLDER_ID: string`, `RESUME_FILE_ID: string`
    - `src/lib/generated/seed_version.ts` exporting `SEED_VERSION: string` (sha256 hex, first 32, of the serialized seed)
    - Generator config const `PROGRAM_URLS` — slice 1 values: `about_me: './programs/placeholder.svelte'`, `my_cv: './programs/placeholder.svelte'`, `contact_me: './programs/placeholder.svelte'` (flipped by slices 2–4).

- [ ] **Step 1: Freeze the base input**

```bash
node -e "
const fs = require('fs');
const hd = JSON.parse(fs.readFileSync('static/json/hard_drive.json','utf8'));
const drop = ['p1AboutMeDesktopExe0001','p1MyCvDesktopExe0000001','p1ContactMeDesktopExe01'];
for (const id of drop) { if (!hd[id]) throw new Error('missing '+id); delete hd[id]; }
hd['nt1QdU9Sws26H26UNQZcQU'].children = hd['nt1QdU9Sws26H26UNQZcQU'].children.filter(c => !drop.includes(c));
fs.writeFileSync('scripts/vfs-base.json', JSON.stringify(hd));
console.log('base items:', Object.keys(hd).length);
"
```

Expected: `base items: 21`. The base is FROZEN — future content changes go through `profile.json`, structural shell changes edit this base deliberately.

- [ ] **Step 2: Install tsx (npm-10 lock!)**

```bash
npx -y npm@10 install --save-dev tsx
```

- [ ] **Step 3: Write `scripts/generate-vfs.ts`** — reads the base **as raw JSON** (field-preserving: the base carries fields like `hidden` outside the `VfsItem` type — never round-trip it through typed constructors), appends the portfolio build + desktop exes, stamps parents/children, validates, writes all three outputs, formats the generated TS with prettier:

```typescript
/**
 * profile.json → VFS seed generator (SPECIFICATION.md §6.7, Phase 2 spec D2).
 * Deterministic: frozen epoch, slug-derived ids, byte-stable output.
 * Run via `npm run generate:vfs`; CI fails if outputs drift from committed.
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { profile } from '../src/lib/profile';
import { SEED_EPOCH, build_portfolio } from '../src/lib/vfs_gen/build';
import type { VfsItem } from '../src/lib/types';

const C_DRIVE = 'cTbkbrM4qjwF3UfmCoFkEK';
const DESKTOP = 'nt1QdU9Sws26H26UNQZcQU';
const MY_COMPUTER_EXE = 'sWTYkZhdpSYCmXP7z6459v';
const IE_EXE = '2jpDfV5KSoYMArQnHgux5S';

/** Flipped per slice as real programs land (spec D13). */
const PROGRAM_URLS = {
    about_me: './programs/placeholder.svelte',
    my_cv: './programs/placeholder.svelte',
    contact_me: './programs/placeholder.svelte',
};

const desktop_exe = (id: string, basename: string, url: string, icon: string): VfsItem => ({
    id,
    type: 'file',
    basename,
    name: `${basename}.exe`,
    storage_type: 'fake',
    url,
    ext: '.exe',
    parent: DESKTOP,
    size: 1024,
    executable: true,
    icon,
    children: [],
    date_created: SEED_EPOCH,
    date_modified: SEED_EPOCH,
    sort_option: 0,
    sort_order: 0,
});

// ---- assemble ----------------------------------------------------------
const base = JSON.parse(
    readFileSync('scripts/vfs-base.json', 'utf8'),
) as Record<string, VfsItem & Record<string, unknown>>;
const built = build_portfolio(profile);

const exes = [
    desktop_exe('p1AboutMeDesktopExe0001', 'About Me', PROGRAM_URLS.about_me, '/assets/icons/about-me.png'),
    desktop_exe('p1MyCvDesktopExe0000001', 'My CV', PROGRAM_URLS.my_cv, '/assets/icons/my-cv.png'),
    desktop_exe('p1ContactMeDesktopExe01', 'Contact Me', PROGRAM_URLS.contact_me, '/assets/icons/contact-me.png'),
];

const seed: Record<string, VfsItem & Record<string, unknown>> = { ...base };
const add = (item: VfsItem): void => {
    if (seed[item.id] != null) throw new Error(`id collision: ${item.id}`);
    seed[item.id] = item;
};
for (const item of Object.values(built.items)) {
    add(
        item.parent === ''
            ? { ...item, parent: C_DRIVE }
            : item,
    );
}
for (const exe of exes) add(exe);

// C: gains the portfolio folders + resume; Desktop order per §3.5
seed[C_DRIVE] = {
    ...seed[C_DRIVE],
    children: [
        ...seed[C_DRIVE].children,
        ...built.folder_ids,
        built.resume_file_id,
    ],
} as VfsItem & Record<string, unknown>;
seed[DESKTOP] = {
    ...seed[DESKTOP],
    children: [
        MY_COMPUTER_EXE,
        'p1AboutMeDesktopExe0001',
        'p1MyCvDesktopExe0000001',
        IE_EXE,
        'p1ContactMeDesktopExe01',
    ],
} as VfsItem & Record<string, unknown>;

// ---- validate ----------------------------------------------------------
for (const [id, item] of Object.entries(seed)) {
    for (const child of item.children ?? []) {
        if (seed[child] == null) throw new Error(`dangling child ${child} in ${id}`);
    }
    if (item.parent != null && item.parent !== '' && seed[item.parent] == null) {
        throw new Error(`dangling parent ${item.parent} in ${id}`);
    }
}

// ---- write -------------------------------------------------------------
const serialized = JSON.stringify(seed);
const version = createHash('sha256').update(serialized).digest('hex').slice(0, 32);
writeFileSync('static/json/hard_drive.json', serialized);

mkdirSync('src/lib/generated', { recursive: true });
writeFileSync(
    'src/lib/generated/seed_version.ts',
    `// GENERATED by scripts/generate-vfs.ts — do not edit.\nexport const SEED_VERSION = '${version}';\n`,
);
writeFileSync(
    'src/lib/generated/vfs_ids.ts',
    `// GENERATED by scripts/generate-vfs.ts — do not edit.\n` +
        `export const PORTFOLIO_FOLDER_IDS: string[] = ${JSON.stringify(built.folder_ids)};\n` +
        `export const PORTFOLIO_ENTRY_IDS: string[] = ${JSON.stringify(built.entry_ids)};\n` +
        `export const PROJECTS_FOLDER_ID = '${built.projects_folder_id}';\n` +
        `export const RESUME_FILE_ID = '${built.resume_file_id}';\n`,
);
execSync('npx prettier --write src/lib/generated/seed_version.ts src/lib/generated/vfs_ids.ts', {
    stdio: 'inherit',
});
console.log(`generated: ${Object.keys(seed).length} items, SEED_VERSION ${version}`);
```

> Strict-TS note: the two `as VfsItem & Record<string, unknown>` assertions above are in `scripts/` (outside the `src/`-scoped `no-unsafe-type-assertion` rule); if eslint still flags them, restructure with a typed spread helper instead of suppressing.

- [ ] **Step 4: Wire seed.ts + package.json + run it**

`src/lib/seed.ts`: delete the hardcoded `SEED_VERSION` line and re-export: `export { SEED_VERSION } from './generated/seed_version';` (keep `shouldReseed` and `merge_on_reseed`; update the header comment — hand-stamping is retired). `src/lib/seed.test.ts`: the existing hash test now imports `SEED_VERSION` the same way (no logic change — it verifies committed seed vs committed version).

`package.json` scripts: add `"generate:vfs": "tsx scripts/generate-vfs.ts"`.

```bash
npm run generate:vfs
npx vitest run src/lib/seed.test.ts
```

Expected: generator prints item count + version; hash test PASSES against the regenerated seed. Run twice and `git status` — second run must produce **no changes** (determinism).

- [ ] **Step 5: CI freshness step** — in `.github/workflows/ci.yml`, after "Format check" add:

```yaml
            - name: VFS seed freshness (generated == committed)
              run: |
                  npm run generate:vfs
                  git diff --exit-code static/json/hard_drive.json src/lib/generated
```

- [ ] **Step 6: Remove the superseded curation script**

```bash
git rm gen/curate_seed_phase1.mjs
```

- [ ] **Step 7: Full local gates** — `npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build` → all green. (E2E after Task 6 — the root view changes.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: profile->VFS generator with auto SEED_VERSION + CI freshness gate"
```

### Task 6: Explorer wiring (`system.ts`) + portfolio_viewer program

**Files:**
- Modify: `src/lib/system.ts` (root list, protected items, `.txt` doctype)
- Create: `src/routes/xp/programs/portfolio_viewer.svelte`
- Modify: `src/routes/xp/work_space.svelte` (launch branch)
- Test: `e2e/my_computer.spec.ts` (new)

**Interfaces:**
- Consumes: `PORTFOLIO_FOLDER_IDS`, `PORTFOLIO_ENTRY_IDS` (Task 5); `resolve_portfolio_ref` (Task 2).
- Produces: `./programs/portfolio_viewer.svelte` launchable via the `.txt` doctype; receives standard props + `fs_item` (full item with `portfolio_ref`).

- [ ] **Step 1: system.ts wiring**

```typescript
import { PORTFOLIO_ENTRY_IDS, PORTFOLIO_FOLDER_IDS } from './generated/vfs_ids';
```

- `my_computer` list: insert `...PORTFOLIO_FOLDER_IDS` **before** `my_music_id` (spec D9: portfolio folders render first in "Files Stored on This Computer"; drives are filtered into their own section so their position is cosmetic).
- `protected_items`: already spreads `my_computer` (covers the folders); add `...PORTFOLIO_ENTRY_IDS` (spec F8 — entries are the product).
- `doctypes`: add

```typescript
'.txt': [
    {
        path: './programs/portfolio_viewer.svelte',
        icon: <the icons['.txt'] literal>,
        name: 'Portfolio Viewer',
    },
],
```

- [ ] **Step 2: portfolio_viewer.svelte** — copy `placeholder.svelte`'s scaffold (accessors, exports, destroy). Core:

```svelte
<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import { unmount } from 'svelte';
    import { runningPrograms } from '../../../lib/store';
    import { resolve_portfolio_ref } from '../../../lib/portfolio';
    import { required } from '../../../lib/types';
    import type {
        ProgramInstance,
        VfsItem,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    export let id: string;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;
    export let fs_item: VfsItem | undefined = undefined;
    export let exec_path: string | undefined = undefined;

    const detail =
        fs_item?.portfolio_ref == null
            ? null
            : resolve_portfolio_ref(fs_item.portfolio_ref);

    let expanded_image: string | null = null;

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'portfolio_viewer instance'));
    }

    export let options: WindowOptions = {
        title: fs_item?.basename ?? 'Portfolio',
        icon: fs_item?.icon,
        id,
        exec_path,
        width: 500,
        height: 420,
        min_width: 380,
        min_height: 300,
    };
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div
        slot="content"
        class="absolute inset-0 overflow-y-auto bg-white font-Tahoma text-slate-900 p-4"
    >
        {#if detail == null}
            <p class="text-[11px]">This file cannot be displayed.</p>
        {:else}
            <h1 class="text-[17px] font-bold text-[#00309f]">{detail.heading}</h1>
            {#if detail.subheading}
                <h2 class="text-[13px] font-bold">{detail.subheading}</h2>
            {/if}
            {#each detail.meta_lines as line (line)}
                <p class="text-[11px] text-slate-500">{line}</p>
            {/each}
            {#if detail.chips.length > 0}
                <div class="mt-2 flex flex-row flex-wrap gap-1">
                    {#each detail.chips as chip (chip)}
                        <span
                            class="text-[10px] border border-[#7a96df] bg-[#eef2fb] rounded px-1.5 py-0.5"
                            >{chip}</span
                        >
                    {/each}
                </div>
            {/if}
            {#if detail.bullets.length > 0}
                <ul class="mt-3 list-disc pl-5 space-y-1.5">
                    {#each detail.bullets as bullet (bullet)}
                        <li class="text-[11px] leading-snug">{bullet}</li>
                    {/each}
                </ul>
            {/if}
            {#if detail.link}
                <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external project URL -->
                <a
                    href={detail.link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="mt-3 inline-block text-[11px] text-[#0b3dbb] underline"
                    >{detail.link.label}</a
                >
            {/if}
            {#if detail.images.length > 0}
                <div class="mt-4 flex flex-row flex-wrap gap-2">
                    {#each detail.images as img (img.src)}
                        <button
                            type="button"
                            on:click={() =>
                                (expanded_image =
                                    expanded_image === img.src ? null : img.src)}
                        >
                            <img
                                src={img.src}
                                alt={img.alt}
                                class="h-16 border border-slate-400 object-cover"
                            />
                        </button>
                    {/each}
                </div>
                {#if expanded_image}
                    <img
                        src={expanded_image}
                        alt=""
                        class="mt-2 max-w-full border border-slate-400"
                    />
                {/if}
            {/if}
        {/if}
    </div>
</Window>
```

- [ ] **Step 3: work_space branch** — add before the placeholder branch (guard first: entries without a ref fall back to the no-association dialog rather than mounting a dead window):

```typescript
} else if (path == './programs/portfolio_viewer.svelte') {
    const full = full_vfs_item(fs_item);
    if (full?.portfolio_ref == null) {
        show_no_association_dialog(full?.name ?? 'Unknown file');
    } else {
        const Program = (await import('./programs/portfolio_viewer.svelte'))
            .default;
        const program: ProgramInstance = mount(Program, {
            target: node_ref,
            props: {
                id: short.generate(),
                fs_item: full,
                exec_path: path,
                get_self: () => program,
            },
        });
        runningPrograms.update((values) => [...values, program]);
    }
}
```

(import `show_no_association_dialog` from `../../lib/no_association`.)

- [ ] **Step 4: E2E** — `e2e/my_computer.spec.ts` (three heterogeneous sections per spec D12; strings sourced from `profile.json` at test-authoring time — keep literals in sync):

```typescript
import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

async function openMyComputer(page: import('@playwright/test').Page) {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My Computer' }).dblclick();
    await expect(page.locator('#work-space .window').first()).toBeVisible();
}

test('Explorer root lists the six portfolio folders', async ({ page }) => {
    await openMyComputer(page);
    const win = page.locator('#work-space .window').first();
    for (const name of [
        'Experience',
        'Projects',
        'Education',
        'Skills',
        'Certifications',
        'Awards',
    ]) {
        await expect(win.getByText(name, { exact: true })).toBeVisible();
    }
});

test('an experience entry opens a detail window with bullets', async ({ page }) => {
    await openMyComputer(page);
    const win = page.locator('#work-space .window').first();
    await win.getByText('Experience', { exact: true }).dblclick();
    await page.waitForTimeout(450);
    await win.getByText('Printerpix — AI Engineer.txt').dblclick();
    const detail = page.locator('#work-space .window').nth(1);
    await expect(detail.getByText('AI Engineer', { exact: true })).toBeVisible();
    await expect(detail.getByText(/9 international markets/)).toBeVisible();
});

test('a project entry shows tech chips and link', async ({ page }) => {
    await openMyComputer(page);
    const win = page.locator('#work-space .window').first();
    await win.getByText('Projects', { exact: true }).dblclick();
    await page.waitForTimeout(450);
    await win.getByText("Momad's XP.txt").dblclick();
    const detail = page.locator('#work-space .window').nth(1);
    await expect(detail.getByText('SvelteKit', { exact: true })).toBeVisible();
    await expect(detail.getByText('Visit project')).toBeVisible();
});

test('an education entry shows honors', async ({ page }) => {
    await openMyComputer(page);
    const win = page.locator('#work-space .window').first();
    await win.getByText('Education', { exact: true }).dblclick();
    await page.waitForTimeout(450);
    await win
        .getByText(/Arab Academy for Science.*\.txt/)
        .first()
        .dblclick();
    const detail = page.locator('#work-space .window').nth(1);
    await expect(detail.getByText('Excellent with Honors')).toBeVisible();
});
```

- [ ] **Step 5: Full gates incl. E2E** — `npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build && npx playwright test` → all green. Fix any drift (e.g. exact `.txt` display names) in the same commit.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: portfolio folders at Explorer root + entry detail viewer"
```

### Task 7: Slice-1 PR

- [ ] **Step 1:** Push + PR

```bash
git push -u origin feature/phase-2-slice-1-vfs-generator
gh pr create --base dev --title "Phase 2 slice 1: VFS generator, re-seed merge, portfolio viewer" --body "$(cat <<'EOF'
## Summary
- profile.json -> VFS generator (deterministic; auto SEED_VERSION; CI freshness gate)
- re-seed merge preserves visitors' local files (spec D3 contract + test matrix)
- portfolio folders at Explorer root; .txt entries open the new portfolio_viewer
- projects drafted in profile.json (**owner review at handoff**)

Spec: docs/superpowers/specs/2026-07-18-phase-2-content-apps-design.md (slices per plan Part 1)

## Test plan
- [ ] CI green (check/lint/format/unit+diff-cover/freshness/build/E2E)
- [ ] New E2E: my_computer.spec.ts (root folders + 3 heterogeneous detail views)
EOF
)"
```

- [ ] **Step 2:** Monitor CI → merge (with the `gh pr view --json state` retry pattern) → `git checkout dev && git pull`.

---

# Part 2 — Slice 2: PDF viewer (My CV)

Branch: `git checkout dev && git pull && git checkout -b feature/phase-2-slice-2-pdf-viewer`

### Task 8: `pdf_viewer.svelte` + pdfjs-dist

**Files:**
- Modify: `package.json` (add `pdfjs-dist` — check current major on npm first; runtime dep; npm-10 lock)
- Create: `src/routes/xp/programs/pdf_viewer.svelte`
- Modify: `src/routes/xp/work_space.svelte` (branch), `src/lib/system.ts` (`.pdf` doctype)
- Modify: `scripts/generate-vfs.ts` (`PROGRAM_URLS.my_cv = './programs/pdf_viewer.svelte'`) + `npm run generate:vfs`
- Modify: `src/routes/xp/start_menu.svelte` (My CV entry: placeholder → `{ path: './programs/pdf_viewer.svelte' }`)
- Test: `e2e/pdf_viewer.spec.ts`

**Interfaces:**
- Consumes: `profile.meta.resumePdf`; standard program contract.
- Produces: `./programs/pdf_viewer.svelte` — opens `fs_item.url` when launched via the `.pdf` doctype, else falls back to `profile.meta.resumePdf` (spec D6 dual entry).

- [ ] **Step 1: Install** — `npm view pdfjs-dist version` (note the major), then `npx -y npm@10 install pdfjs-dist`.

- [ ] **Step 2: Implement `pdf_viewer.svelte`** (standard scaffold + this core; `ssr=false` so top-level browser APIs are safe):

```svelte
<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import RButton from '../../../lib/components/xp/RButton.svelte';
    import { onMount, unmount } from 'svelte';
    import { runningPrograms } from '../../../lib/store';
    import { profile } from '../../../lib/profile';
    import { required } from '../../../lib/types';
    import * as pdfjs from 'pdfjs-dist';
    import pdf_worker_url from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
    import type {
        ProgramInstance,
        VfsItem,
        WindowController,
        WindowOptions,
    } from '../../../lib/types';

    pdfjs.GlobalWorkerOptions.workerSrc = pdf_worker_url;

    export let id: string;
    export let window: WindowController | undefined = undefined;
    export let get_self: () => ProgramInstance | null = () => null;
    export let fs_item: VfsItem | undefined = undefined;
    export let exec_path: string | undefined = undefined;

    const pdf_url =
        fs_item?.storage_type === 'remote' && fs_item.url != null
            ? fs_item.url
            : profile.meta.resumePdf;

    let pages_node: HTMLDivElement | undefined;
    let zoom = 1;
    let page_count = 0;
    let load_error = false;

    async function render() {
        const node = pages_node;
        if (node == null) return;
        try {
            const doc = await pdfjs.getDocument(pdf_url).promise;
            page_count = doc.numPages;
            node.replaceChildren();
            for (let i = 1; i <= doc.numPages; i++) {
                const page = await doc.getPage(i);
                const base = page.getViewport({ scale: 1 });
                const scale = ((node.clientWidth - 24) / base.width) * zoom;
                const viewport = page.getViewport({ scale });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                canvas.className = 'mx-auto mb-3 shadow-md bg-white';
                node.appendChild(canvas);
                const ctx = required(canvas.getContext('2d'), '2d context');
                await page.render({ canvasContext: ctx, viewport }).promise;
            }
        } catch (error) {
            console.error('pdf render failed', error);
            load_error = true;
        }
    }

    onMount(() => void render());

    function set_zoom(next: number) {
        zoom = Math.min(3, Math.max(0.5, next));
        void render();
    }

    function download() {
        const a = document.createElement('a');
        a.href = pdf_url;
        a.download = '';
        a.click();
    }

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'pdf_viewer instance'));
    }

    export let options: WindowOptions = {
        title: fs_item?.name ?? 'My CV',
        icon: '/assets/icons/my-cv.png',
        id,
        exec_path,
        width: 640,
        height: 720,
        min_width: 420,
        min_height: 360,
    };
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div slot="content" class="absolute inset-0 flex flex-col bg-[#808080]">
        <div
            class="shrink-0 flex flex-row items-center gap-1 bg-[#ece9d8] border-b border-[#aca899] px-1 py-0.5"
        >
            <RButton title="Download" icon="/images/xp/icons/Save.png" on_click={download} />
            <div class="w-px h-5 bg-[#aca899] mx-1"></div>
            <RButton title="−" on_click={() => set_zoom(zoom - 0.25)} />
            <RButton title="+" on_click={() => set_zoom(zoom + 0.25)} />
            <span class="ml-2 text-[11px] font-Tahoma"
                >{page_count > 0 ? `${page_count} page${page_count > 1 ? 's' : ''}` : ''}</span
            >
        </div>
        {#if load_error}
            <div class="grow flex items-center justify-center">
                <p class="text-[11px] text-white font-Tahoma">
                    The document could not be displayed. Use Download to view it.
                </p>
            </div>
        {:else}
            <div bind:this={pages_node} class="grow overflow-auto p-3"></div>
        {/if}
    </div>
</Window>
```

(If `RButton`'s prop names differ, match its actual interface — check `src/lib/components/xp/RButton.svelte` and the toolbar usage in `my_computer.svelte:311-352`. If `/images/xp/icons/Save.png` doesn't exist, pick an existing save/disk icon from `static/images/xp/icons/`.)

- [ ] **Step 3: work_space branch** (same pattern as portfolio_viewer, no guard needed — `fs_item` may be undefined for the `.exe` launch, so pass it through raw, NOT via `full_vfs_item`):

```typescript
} else if (path == './programs/pdf_viewer.svelte') {
    const Program = (await import('./programs/pdf_viewer.svelte')).default;
    const program: ProgramInstance = mount(Program, {
        target: node_ref,
        props: {
            id: short.generate(),
            fs_item: full_vfs_item(fs_item),
            exec_path: path,
            get_self: () => program,
        },
    });
    runningPrograms.update((values) => [...values, program]);
}
```

Why `full_vfs_item` is safe here for both entry points: it returns `undefined` for `undefined` input and only throws on *partial* items. The desktop `.exe` launch (`viewer.svelte:242-247`) passes `exe_item` only — `fs_item` stays `undefined` → viewer falls back to `profile.meta.resumePdf`. The `.pdf` doctype launch passes the full seeded item → viewer renders its `url`.

- [ ] **Step 4: doctype + generator flip + regenerate**

- `system.ts` `doctypes`: `'.pdf': [{ path: './programs/pdf_viewer.svelte', icon: '/assets/icons/my-cv.png', name: 'PDF Viewer' }]`
- `scripts/generate-vfs.ts`: `PROGRAM_URLS.my_cv = './programs/pdf_viewer.svelte'`
- `start_menu.svelte`: replace the My CV `placeholder_entry(...)` with a real launch `{ path: './programs/pdf_viewer.svelte', name: 'My CV', icon: '/assets/icons/my-cv.png' }` matching the surrounding `StartMenuItem` shape.
- `npm run generate:vfs`

- [ ] **Step 5: E2E** — `e2e/pdf_viewer.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

test('My CV opens the PDF viewer and renders a page', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'My CV' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win).toBeVisible();
    await expect(win.locator('canvas').first()).toBeVisible({ timeout: 15000 });
    await expect(win.getByText(/page/)).toBeVisible();
});
```

Also update the stale placeholder assertion: `e2e/shell.spec.ts` uses About Me + Contact Me placeholders (still valid this slice — touch nothing).

- [ ] **Step 6: Verify the worker asset (spec M7)** — after `npm run build`: `grep -r "pdf.worker" build/ --include="*.html" -l || ls build/_app/immutable/assets/ | grep -i worker` — confirm the worker file is emitted into the static output and the E2E run (which serves `build/` via preview) renders a canvas. The passing E2E IS the verification.

- [ ] **Step 7: Full gates → PR** (`Phase 2 slice 2: pdfjs CV viewer`) → monitor CI → merge → back to `dev`.

---

# Part 3 — Slice 3: About Me

Branch: `git checkout dev && git pull && git checkout -b feature/phase-2-slice-3-about-me`

### Task 9: `about_me.svelte`

**Files:**
- Create: `src/routes/xp/programs/about_me.svelte`
- Modify: `src/routes/xp/work_space.svelte` (branch — standard pattern, passes raw `fs_item` through `full_vfs_item` like pdf_viewer)
- Modify: `src/lib/system.ts`? No. `scripts/generate-vfs.ts`: `PROGRAM_URLS.about_me = './programs/about_me.svelte'` + regenerate
- Modify: `src/routes/xp/start_menu.svelte` (About Me placeholder → real)
- Modify: `e2e/shell.spec.ts` (the About-Me-placeholder test now targets Contact Me for its placeholder assertions; cascade test unchanged — both windows still open)
- Test: `e2e/about_me.spec.ts`

**Interfaces:**
- Consumes: `profile` (meta/about/social/skills/languages); `PROJECTS_FOLDER_ID` from `src/lib/generated/vfs_ids.ts`; `queueProgram`.
- Produces: `./programs/about_me.svelte`.

**Layout contract (from `design/inspiration/about-me.png`, our content — parity loop refines styling):**
- Window ~700×540, resizable; title "About Me", icon `/assets/icons/about-me.png`.
- Menu bar row: `File  View  Help` (decorative text, disabled styling like `my_computer.svelte`'s menu stubs).
- Toolbar: Back/Forward (decorative, disabled look) · **My Projects** (opens Explorer at the Projects folder) · **My Resume** (opens pdf_viewer). Buttons via `RButton` with icons from existing assets.
- Address bar: `Address` label + boxed value `About Me` (styling copied from `my_computer.svelte:353-378`).
- Body: left sidebar (~180px, XP blue gradient panels copied from `my_computer/sidebar.svelte`'s section markup): **Social Links** (each `profile.social` platform as an external `noopener noreferrer` anchor), **Skills** (each `profile.skills` category name; category click is decorative), **Languages** (each `profile.languages` as "Language — Level"). Main pane (blue `#6b7fd6`-family like the reference): avatar `profile.meta.avatar` (rounded, ~96px) floated beside `<h1>About Me</h1>`, then each `profile.about.bio` paragraph at `text-[13px] leading-relaxed text-slate-50`.
- **My Projects click:** `queueProgram.set({ path: './programs/my_computer.svelte', fs_item: { id: PROJECTS_FOLDER_ID } })` (the Explorer seeds its history from `fs_item.id` — `my_computer.svelte:35-36`).
- **My Resume click:** `queueProgram.set({ path: './programs/pdf_viewer.svelte' })`.

- [ ] **Step 1: Implement** the component per the contract above (standard scaffold; `exec_path` set so the window rect persists).
- [ ] **Step 2: Flip generator + start menu; regenerate** (`PROGRAM_URLS.about_me`, `start_menu.svelte` About Me entry → `{ path: './programs/about_me.svelte', ... }`, `npm run generate:vfs`).
- [ ] **Step 3: Update `e2e/shell.spec.ts`** — retarget its two placeholder-based tests to Contact Me (the only remaining §3.5 placeholder): the "opens the named placeholder" test dblclicks `Contact Me`; the cascade test opens `Contact Me` then `About Me` (sizes now differ — assert only relative 24px offset if both windows are rect-less on first run; if the About Me default rect breaks the 24px assertion, cascade-test with Contact Me + a second Contact Me instance instead).
- [ ] **Step 4: E2E** — `e2e/about_me.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

test('About Me renders bio, sidebar and toolbar actions', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'About Me' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await expect(win.getByText('Social Links')).toBeVisible();
    await expect(win.getByText('NLP & LLMs')).toBeVisible();
    await expect(win.getByText(/Hi, I'm Mohamed Abdelnasser/)).toBeVisible();

    await win.getByText('My Projects').click();
    const explorer = page.locator('#work-space .window').nth(1);
    await expect(explorer.getByText("Momad's XP.txt")).toBeVisible();
});
```

- [ ] **Step 5: Full gates → PR** (`Phase 2 slice 3: About Me`) → CI → merge → `dev`.
- [ ] **Step 6: Visual parity loop (§11):** Playwright MCP at 1280×800 vs `design/inspiration/about-me.png`; iterate spacing/colors; save evidence `design/research/phase2-parity-about-me.png` (design/ is untracked). ≥95% structural parity; our assets/copy exempt.

---

# Part 4 — Slice 4: Contact Me + /api/email

Branch: `git checkout dev && git pull && git checkout -b feature/phase-2-slice-4-contact`

### Task 10: Server helpers (pure, unit-tested)

**Files:**
- Create: `src/lib/server/email/validate.ts`, `src/lib/server/email/rate_limit.ts`, `src/lib/server/email/origin.ts`
- Test: `src/lib/server/email/validate.test.ts`, `rate_limit.test.ts`, `origin.test.ts`

**Interfaces (consumed by Task 11):**

```typescript
// validate.ts
export interface EmailPayload { from_email: string; subject: string; message: string; website: string; opened_at: number }
export type ValidationResult = { ok: true; value: EmailPayload } | { ok: false; code: 'invalid_payload' | 'honeypot' | 'too_fast' };
export const MAX_BODY_BYTES = 32_768;
export function validate_email_payload(raw: unknown, now_ms: number): ValidationResult;

// rate_limit.ts
export interface RateLimiter { allow(ip: string, now_ms: number): boolean }
export function create_rate_limiter(opts?: { per_ip_per_hour?: number; global_per_day?: number }): RateLimiter; // defaults 5 and 50

// origin.ts
export function is_allowed_origin(origin: string | null): boolean;
```

**Rules (spec §6.8 — binding):**
- `validate_email_payload`: `raw` must be a plain object; `from_email` valid email ≤254 chars (regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`); `subject` 1–200 chars after trim; `message` 1–5000 chars after trim; `website` (honeypot) must be `''` else `code:'honeypot'`; `opened_at` must satisfy `now_ms - opened_at >= 3000` else `'too_fast'`; every other failure → `'invalid_payload'`. Returned `value` uses the trimmed strings.
- `create_rate_limiter`: token bucket per IP — 5 tokens, refill 5/hour continuous; plus a global counter capped at 50 per rolling 24h window (spec M6 second layer). Pure state in a closure; `now_ms` injected (testable, no `Date.now()` inside).
- `is_allowed_origin`: allow exactly — `https://momad-xp.netlify.app`, any `https://<branch>--momad-xp.netlify.app` (regex `/^https:\/\/[a-z0-9-]+--momad-xp\.netlify\.app$/`), `http://localhost:<port>` / `http://127.0.0.1:<port>` (local dev + preview). `null`/anything else → false.

- [ ] **Step 1: Write failing tests** covering: happy path (trimmed values returned) · each cap boundary (254/200/5000 exact pass, +1 fail) · honeypot filled · `opened_at` 2999ms (fail) / 3000ms (pass) · non-object raw · missing fields · rate limiter: 5 allowed then 6th denied, refill after an hour advances `now_ms`, per-IP isolation, global cap trips across IPs · origin: all allow/deny cases above.
- [ ] **Step 2: Verify fail → implement → verify pass** (`npx vitest run src/lib/server`).
- [ ] **Step 3: Commit** — `feat: email endpoint validation, rate limiting, origin allowlist`.

### Task 11: `/api/email` endpoint

**Files:**
- Create: `src/routes/api/email/+server.ts`
- Test: `src/routes/api/email/server.test.ts` (import the handler directly; mock global `fetch`)

**Interfaces:**
- Consumes: Task 10 helpers; `profile.meta.email`; `$env/dynamic/private` (`RESEND_API_KEY`, optional `EMAIL_FROM`).
- Produces: `POST /api/email` → `202 {"ok":true}` | `400/403/422/429/500 {"error":"<code>"}`. Codes: `invalid_payload`, `honeypot` (returned as 202 `{"ok":true}` — see below), `too_fast`, `forbidden_origin`, `rate_limited`, `payload_too_large`, `send_failed`, `not_configured`.

```typescript
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { profile } from '../../../lib/profile';
import {
    MAX_BODY_BYTES,
    validate_email_payload,
} from '../../../lib/server/email/validate';
import { create_rate_limiter } from '../../../lib/server/email/rate_limit';
import { is_allowed_origin } from '../../../lib/server/email/origin';
import type { RequestHandler } from './$types';

export const prerender = false;

// Module-scope: survives warm invocations, resets on cold start (§6.8 —
// best-effort by design; accepted).
const limiter = create_rate_limiter();

export const POST: RequestHandler = async (event) => {
    if (!is_allowed_origin(event.request.headers.get('origin'))) {
        return json({ error: 'forbidden_origin' }, { status: 403 });
    }

    const body = await event.request.text();
    if (body.length > MAX_BODY_BYTES) {
        return json({ error: 'payload_too_large' }, { status: 413 });
    }

    let ip = 'unknown';
    try {
        ip = event.getClientAddress();
    } catch {
        // adapter couldn't resolve an address (e.g. unit test) — shared bucket
    }
    const now = Date.now();
    if (!limiter.allow(ip, now)) {
        return json({ error: 'rate_limited' }, { status: 429 });
    }

    let raw: unknown;
    try {
        raw = JSON.parse(body);
    } catch {
        return json({ error: 'invalid_payload' }, { status: 400 });
    }
    const result = validate_email_payload(raw, now);
    if (!result.ok) {
        if (result.code === 'honeypot') {
            // Pretend success to bots; nothing is sent.
            return json({ ok: true }, { status: 202 });
        }
        return json(
            { error: result.code },
            { status: result.code === 'too_fast' ? 422 : 400 },
        );
    }

    const key = env.RESEND_API_KEY;
    if (key == null || key === '') {
        console.error('/api/email: RESEND_API_KEY not configured');
        return json({ error: 'not_configured' }, { status: 500 });
    }

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: env.EMAIL_FROM ?? 'onboarding@resend.dev',
                to: [profile.meta.email],
                reply_to: result.value.from_email,
                subject: `[Momad's XP] ${result.value.subject}`,
                text: `From: ${result.value.from_email}\n\n${result.value.message}`,
            }),
        });
        if (!res.ok) {
            console.error('/api/email: resend responded', res.status);
            return json({ error: 'send_failed' }, { status: 502 });
        }
        return json({ ok: true }, { status: 202 });
    } catch (error) {
        console.error('/api/email: resend fetch failed', error);
        return json({ error: 'send_failed' }, { status: 502 });
    }
};
```

- [ ] **Step 1: Write failing handler tests** (`vi.stubGlobal('fetch', ...)`; build `Request` objects with an allowed Origin header; a minimal `event` stub typed against `RequestHandler`'s parameter via a helper — if constructing the typed event fights the generated `$types`, test through `new Request` + a thin cast-free factory; assert: 403 wrong origin · 413 oversize · 400 bad JSON · 202-without-send on honeypot (fetch NOT called) · 422 too_fast · 429 on 6th call same IP · 500 not_configured when env empty · 202 happy path with correct Resend payload (from/to/reply_to/subject prefix) · 502 when fetch rejects or returns 500).
- [ ] **Step 2: Fail → implement → pass**; `npm run check` (the `./$types` import requires `svelte-kit sync` — runs via `npm run prepare`).
- [ ] **Step 3: Verify the function is emitted:** `npm run build && grep -r "api/email" .netlify build -l | head` → the server bundle contains the route (adapter-netlify emits it because `prerender=false`).
- [ ] **Step 4: Commit** — `feat: /api/email Netlify function with Resend + §6.8 hardening`.

### Task 12: `contact_me.svelte`

**Files:**
- Create: `src/routes/xp/programs/contact_me.svelte`
- Modify: `src/routes/xp/work_space.svelte` (branch, raw `fs_item` passthrough like pdf_viewer), `scripts/generate-vfs.ts` (`PROGRAM_URLS.contact_me`), `src/routes/xp/start_menu.svelte` (Contact Me → real), regenerate
- Modify: `e2e/shell.spec.ts` (LAST placeholder gone — retarget the placeholder test + cascade test to a start-menu placeholder app, e.g. All Programs → Python; keep assertions otherwise identical)
- Test: `e2e/contact_me.spec.ts`

**Layout contract (from `design/inspiration/email.png`, our content):**
- Window ~640×520; title "Contact Me"; icon `/assets/icons/contact-me.png`; menu bar `File Edit View` decorative.
- Toolbar: **Send Message** (submit) · **New Message** (reset fields) · decorative cut/copy/paste icon stubs · **LinkedIn** (anchor to the LinkedIn entry in `profile.social`, `noopener noreferrer`).
- Fields: `To:` read-only `{profile.meta.name} <{profile.meta.email}>` · `From:` visitor email input, placeholder `Your email address` · `Subject:` placeholder `Subject of your message` · body textarea, placeholder `Write your message here`.
- Status bar: `Compose a message to Mohamed`.
- Hidden honeypot: `<input name="website" tabindex="-1" autocomplete="off" class="absolute -left-[9999px]" bind:value={website} />`; `const opened_at = Date.now()` at mount.
- Submit flow: client-side validation mirroring Task 10's caps → inline field styling + XP `Dialog` (mounted on `#desktop` like `no_association.ts`) on error; while pending disable Send; `fetch('/api/email', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ from_email, subject, message, website, opened_at }) })`.
- Result dialogs (verbatim copy): success → title `Contact Me`, message `Message sent successfully.`; 429 → `The mail server is busy. Please try again in a little while.`; anything else → `The message could not be sent. Please try again later.` Success also clears the form.

- [ ] **Step 1: Implement** per contract (standard scaffold; small pure `validate_contact_form` helper inside `src/lib/contact.ts` + `contact.test.ts` so the mirror rules are unit-tested).
- [ ] **Step 2: Flip generator + start menu; regenerate; update `e2e/shell.spec.ts`** as described.
- [ ] **Step 3: E2E** — `e2e/contact_me.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

test('validation error shows an XP dialog', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'Contact Me' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await win.getByText('Send Message').click();
    await expect(page.getByText(/enter a valid email/i)).toBeVisible();
});

test('successful send shows the success dialog (mocked API)', async ({ page }) => {
    await page.route('**/api/email', (route) =>
        route.fulfill({ status: 202, contentType: 'application/json', body: '{"ok":true}' }),
    );
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'Contact Me' }).dblclick();
    const win = page.locator('#work-space .window').first();
    await win.getByPlaceholder('Your email address').fill('visitor@example.com');
    await win.getByPlaceholder('Subject of your message').fill('Hello');
    await win.getByPlaceholder('Write your message here').fill('Great site!');
    await page.waitForTimeout(3100); // min-fill-time guard
    await win.getByText('Send Message').click();
    await expect(page.getByText('Message sent successfully.')).toBeVisible();
});
```

- [ ] **Step 4: Provision Resend + Netlify env (owner-account operations — use connected MCPs, record in phase guide):** via Resend MCP: `list-domains` — if a verified domain exists, set `EMAIL_FROM` to `momadsxp@<domain>`; else keep the `onboarding@resend.dev` default (valid: recipient = account owner). `create-api-key` (name `momads-xp-contact`, sending-only). Via Netlify MCP: set `RESEND_API_KEY` (and `EMAIL_FROM` if used) on site `momad-xp` for production + deploy-preview contexts. **Never commit the key.**
- [ ] **Step 5: Deploy-preview verification (real function):** after the PR opens, on the Netlify deploy preview URL: happy-path form send → confirm receipt in inbox (or Resend MCP `list-emails`); a curl with wrong Origin → 403; 6 rapid curls → 429. Record results in the PR.
- [ ] **Step 6: Full gates → PR** (`Phase 2 slice 4: Contact Me + hardened /api/email`) → CI → merge → `dev`.
- [ ] **Step 7: Visual parity loop** vs `design/inspiration/email.png` → `design/research/phase2-parity-contact-me.png`.

---

# Part 5 — Slice-independent closeout checks (pre gate-6)

- [ ] `git grep -n "placeholder.svelte" src/ scripts/` — remaining references ONLY for Phase 3/4 apps (CMD, Python, Paint, Music Player, Games) in `start_menu.svelte` + the work_space branch itself.
- [ ] Boot a cached-drive browser (load production once, then local build): confirm re-seed merge kept a user-created folder + file across the Phase-2 seed change (manual DevTools check, IndexedDB `hard_drive`).
- [ ] Mobile spec: add a `profile.projects`-non-empty assertion to `e2e/mobile.spec.ts` (spec D14/M1 — section renders now that data exists).
- [ ] `npm run check` 0 errors · `npm run lint` clean · full unit suite · `npm run build` · full E2E ≥16 specs green.
- [ ] Gate 6 (outside this plan): fresh-context implementation review → fixes → `docs/phase-2-guide.md` (must include: projects-draft owner review flag · Resend key/domain records · merge copy-loss note · quota acceptance note) → visual parity report → cutover PR `dev` → `main`.

## Self-review notes (writing-plans checklist)

- **Spec coverage:** D1(T2/T3/T6) D2(T3/T5) D3(T4) D4/D5(T11) D6(T8) D7(T9) D8(T12) D9(T6) D10(T1) D11(T1) D12(tests throughout) D13(T5/T8/T9/T12) D14(closeout). Exit criteria 1–5 → T6/T8/T9/T12/T5+T4/closeout.
- **Type consistency:** `PortfolioRef`/`PortfolioDetail`/`resolve_portfolio_ref` (T2) consumed verbatim in T6; `PortfolioBuild` fields (T3) consumed in T5; `vfs_ids.ts` exports (T5) consumed in T6/T9; Task-10 signatures consumed verbatim in T11/T12.
- **Known look-ups left to the implementer (deliberate, with exact locations):** `icons['.txt']` literal (system.ts), `RButton` prop names, `StartMenuItem` shape, pdfjs-dist current major — each task says where to look.
