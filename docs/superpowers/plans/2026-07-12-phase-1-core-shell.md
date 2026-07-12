# Phase 1 — Core XP Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebranded boot flow with a new XP-faithful login screen, curated desktop + restructured start menu with named placeholders, real `profile.json`, the mobile portrait experience, and the Phase-0 carry-overs (FA-Free swap, panzoom vendoring, diff-based coverage, notepad-fallback dialog).

**Architecture:** Four independently mergeable PR slices into `dev` (design §"Plan slicing"). The boot chain (`+page.svelte` → `starting` → **`login` (new)** → `desktop` with a retimed `welcome` overlay) gains one component; the desktop shell is curated via a scripted `hard_drive.json` edit + start-menu data rewrite; mobile is a pure-function viewport branch in `+page.svelte` rendering a single static page; carry-overs touch only inherited components, vendored JS, and CI config.

**Tech Stack:** SvelteKit 2 / Svelte 5 (strict TypeScript), Tailwind 3, Vitest 4 (+ v8 coverage), Playwright, GitHub Actions, Netlify. No new npm dependencies in this phase.

**Contract:** `docs/superpowers/specs/2026-07-12-phase-1-core-shell-design.md` (v2). Spec references: `docs/SPECIFICATION.md` §2, §3.4, §3.5, §4.3, §4.6, §7, §9-Phase-1, §11; `docs/phase-0-guide.md`.

## Global Constraints

Every task's requirements implicitly include this section.

- **Strict TS:** `strict: true` + `noUncheckedIndexedAccess`; ESLint `no-explicit-any` and `no-unsafe-type-assertion` are errors over all of `src/`. Zero `any`, zero unsafe assertions in new code.
- **svelte-check:** `npm run check` must report **0 errors** (inherited warnings are non-gating).
- **Prettier/ESLint hooks:** husky + lint-staged format on commit; run `npx prettier --write <files>` before committing if you edited JSON/MD by script.
- **Gates before EVERY commit** (and per-slice before the PR): `npm run check` && `npm run lint` && `npm run format:check` && `npx vitest run --coverage` && `npm run build` && `npx playwright test` — all green.
- **SEED_VERSION:** after ANY edit to `static/json/hard_drive.json`, recompute: `sha256sum static/json/hard_drive.json | cut -c1-32` and stamp it into `src/lib/seed.ts:14`.
- **Conventional commits:** `<type>: <description>` (feat, fix, refactor, docs, test, chore, perf, ci).
- **No rebranding beyond what the design states.** Copy strings are quoted verbatim in the tasks; do not invent additional copy.
- **Branching:** each slice is `feature/phase-1-slice-{n}-<short-name>` cut from the **current `dev`** at slice start; PR into `dev`; each slice CI-green on its own. Merge order 1 → 2 → 3 → 4 (slices 2 and 3 import `src/lib/profile.ts` from slice 1; slice 4 touches `start_menu.svelte` from slice 2).
- **Parity (§11):** slices 1, 2 and 4 end with a mandatory Playwright two-browser parity loop; screenshots saved under `design/research/` are the evidence. ≥95% parity; do not eyeball and move on.
- **Sounds:** the only sound wired in this phase is `xp_startup.mp3` on the login-card click (design decision 2). The §4.3 login-click "XP logon" row is deferred to Phase 6 — do not wire it.
- **File paths in this plan are repo-relative** from `/home/momad/Projects/Momads-XP`.

---

# Part 1 — Slice 1: profile + login + welcome retime + boot rebrand & skip

Branch: `git checkout dev && git pull && git checkout -b feature/phase-1-slice-1-login-boot`

### Task 1: Profile data module (`profile.json` + `profile.ts`) and resume asset

**Files:**
- Create: `src/lib/data/profile.json`
- Create: `src/lib/profile.ts`
- Create: `static/assets/Mohamed_Abdelnasser_Resume.pdf` (copied from `docs/Profile.pdf`)
- Test: `src/lib/profile.test.ts`

**Interfaces:**
- Consumes: nothing (leaf module).
- Produces: `export const profile: Profile` (deep-frozen) from `src/lib/profile.ts`. Later tasks read `profile.meta.name`, `profile.meta.title`, `profile.meta.avatar` (`'/assets/images/avatar.png'`), `profile.meta.resumePdf` (`'/assets/Mohamed_Abdelnasser_Resume.pdf'`), `profile.meta.email`, `profile.meta.tagline`, `profile.about.bio: string[]`, `profile.social: SocialLink[]` (platforms exactly `'GitHub' | 'LinkedIn' | 'Instagram'`), `profile.experience: ExperienceEntry[]`, `profile.education: EducationEntry[]`, `profile.skills: Record<string, string[]>`, `profile.projects: Project[]` (empty), `profile.languages`, `profile.awards`, `profile.certifications`.

- [ ] **Step 1: Copy the resume PDF and verify the avatar exists**

```bash
cp docs/Profile.pdf static/assets/Mohamed_Abdelnasser_Resume.pdf
ls -la static/assets/Mohamed_Abdelnasser_Resume.pdf static/assets/images/avatar.png
```

Expected: both files listed (avatar already exists from Phase 0).

- [ ] **Step 2: Write the failing test**

Create `src/lib/profile.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { profile } from './profile';

describe('profile integrity', () => {
    it('has complete meta with the Phase-1 asset paths', () => {
        expect(profile.meta.name).toBe('Mohamed Abdelnasser');
        expect(profile.meta.shortName).toBe('Momad');
        expect(profile.meta.title).toBe('AI Engineer');
        expect(profile.meta.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
        expect(profile.meta.avatar).toBe('/assets/images/avatar.png');
        expect(profile.meta.resumePdf).toBe(
            '/assets/Mohamed_Abdelnasser_Resume.pdf',
        );
    });

    it('has the three social links with the real URLs', () => {
        const by_platform = Object.fromEntries(
            profile.social.map((s) => [s.platform, s.url]),
        );
        expect(by_platform['GitHub']).toBe('https://github.com/Momad-Y');
        expect(by_platform['LinkedIn']).toBe(
            'https://www.linkedin.com/in/mohamed-y-abdelnasser/',
        );
        expect(by_platform['Instagram']).toBe('https://instagram.com/7.zsjj');
    });

    it('has six experience entries, each with at least one bullet', () => {
        expect(profile.experience).toHaveLength(6);
        for (const entry of profile.experience) {
            expect(entry.company.length).toBeGreaterThan(0);
            expect(entry.role.length).toBeGreaterThan(0);
            expect(entry.period.length).toBeGreaterThan(0);
            expect(entry.description.length).toBeGreaterThan(0);
        }
        expect(profile.experience[0]?.company).toBe('Printerpix');
        expect(profile.experience[0]?.description).toHaveLength(4);
    });

    it('education includes the GPA honors line', () => {
        expect(profile.education).toHaveLength(2);
        expect(profile.education[0]?.honors).toBe(
            'GPA 3.94 — Excellent with Honors',
        );
    });

    it('has five non-empty skill groups', () => {
        const groups = Object.values(profile.skills);
        expect(groups).toHaveLength(5);
        for (const group of groups) {
            expect(group.length).toBeGreaterThan(0);
        }
    });

    it('has two bio paragraphs', () => {
        expect(profile.about.bio).toHaveLength(2);
    });

    it('projects are empty until Phase 2', () => {
        expect(profile.projects).toEqual([]);
    });

    it('is deeply frozen', () => {
        expect(Object.isFrozen(profile)).toBe(true);
        expect(Object.isFrozen(profile.meta)).toBe(true);
        expect(Object.isFrozen(profile.experience)).toBe(true);
        expect(Object.isFrozen(profile.experience[0])).toBe(true);
    });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx vitest run src/lib/profile.test.ts`
Expected: FAIL — `Cannot find module './profile'` (or resolve error).

- [ ] **Step 4: Create `src/lib/data/profile.json`**

Content per §7's sample, updated with the owner inputs (GitHub `Momad-Y`, Instagram `7.zsjj`), the Phase-1 asset paths, the Printerpix 4-bullet description (source: `docs/Profile.pdf`), and `projects: []`. The §7 sample's education/award image references point at files that don't exist yet (`/assets/images/aast-diploma.jpg` etc.) — all `images` arrays are `[]` in Phase 1 (Phase 2 adds the files). Full file:

```json
{
    "meta": {
        "name": "Mohamed Abdelnasser",
        "shortName": "Momad",
        "title": "AI Engineer",
        "tagline": "AI Engineer | Automation Systems | Robotics | RoboCup @Home Champion",
        "location": "Dubai, United Arab Emirates",
        "email": "Mohamed.Y.Abdelnasser@gmail.com",
        "phone": "+971503429805",
        "avatar": "/assets/images/avatar.png",
        "resumePdf": "/assets/Mohamed_Abdelnasser_Resume.pdf"
    },
    "about": {
        "bio": [
            "Hi, I'm Mohamed Abdelnasser, an AI Engineer with a B.Sc. in Artificial Intelligence (Intelligent Systems, Excellent with Honors) from AAST. I build production-ready AI systems, with a strong focus on automation and real-world impact.",
            "I currently work at Printerpix, where I design and deploy AI-powered production systems across 9 international markets. Previously, I worked with Mentorness, Corporatica, and Udacity in research, development, and mentoring roles. I've built AI assistants, NLP pipelines, computer vision systems, and intelligent automations, and I led the AI and robotics stack for RoboCup @Home, earning 1st place nationally and 3rd place internationally."
        ]
    },
    "social": [
        {
            "platform": "GitHub",
            "url": "https://github.com/Momad-Y",
            "icon": "github"
        },
        {
            "platform": "LinkedIn",
            "url": "https://www.linkedin.com/in/mohamed-y-abdelnasser/",
            "icon": "linkedin"
        },
        {
            "platform": "Instagram",
            "url": "https://instagram.com/7.zsjj",
            "icon": "instagram"
        }
    ],
    "experience": [
        {
            "company": "Printerpix",
            "role": "AI Engineer",
            "period": "October 2025 – Present",
            "location": "Dubai, United Arab Emirates",
            "description": [
                "Architected an AI analytics pipeline using Python, BigQuery, and Gemini LLMs, automating marketing reporting and anomaly detection across 9 international markets, reducing manual analysis by ~80%.",
                "Developed ML-powered pricing optimisation using scikit-learn and Monte Carlo simulation (10,000+ scenarios) with 95% CI statistical validation via SciPy.",
                "Designed LangChain multi-chain LLM architecture with Gemini for automated multilingual content generation across 6 languages, with Pydantic validation and multi-platform API integration.",
                "Deployed AI-powered QA system using Gemini Vision, Playwright, and FastAPI, automating cross-platform validation across 7 regional markets."
            ],
            "images": []
        },
        {
            "company": "Udacity",
            "role": "Session Lead",
            "period": "July 2025 – September 2025",
            "location": "Remote",
            "description": [
                "Led the DECI Summer Cohort (Level 1), delivering 3 weekly live online sessions to 30+ students.",
                "Covered Python, HTML, CSS, fundamentals of AI, and data science, along with introductions to networks, cybersecurity, multimedia, and encoding/decoding.",
                "Mentored students through hands-on projects and activities, achieving an 80%+ graduation rate."
            ],
            "images": []
        },
        {
            "company": "Robotics Club — AASTMT",
            "role": "Vice President of Software Development",
            "period": "October 2022 – June 2025",
            "location": "El Alameen, Egypt",
            "description": [
                "Organized RoboCup-inspired line-tracking and CPC-inspired programming competitions.",
                "Conducted sessions teaching Python, C/C++, Competitive Programming, and Arduino to over 300 students.",
                "Attended the 2023 Maker Faire in Cairo representing the Robotics Club."
            ],
            "images": []
        },
        {
            "company": "Corporatica",
            "role": "Natural Language Processing Intern",
            "period": "September 2024 – November 2024",
            "location": "Wyoming, USA (Remote)",
            "description": [
                "Optimized LangChain and LangGraph RAG pipelines, improving retrieval efficiency and reducing response time by ~15%.",
                "Developed a LangChain-based ReAct agent with custom and pre-built tools to fix LLM-generated code errors, decreasing failure rates and hallucinations by 20%.",
                "Contributed to all stages of NLP pipelines—pre/post-processing, LLM integration, monitoring, and evaluation."
            ],
            "images": []
        },
        {
            "company": "RoboCup Federation",
            "role": "AI & Robotics Engineer",
            "period": "December 2023 – August 2024",
            "location": "Alexandria, Egypt & Eindhoven, Netherlands",
            "description": [
                "Led Team 3arfeen Hollanda to 1st place in the 2024 RoboCup @Home Education Competition (Egypt).",
                "Led Team Wingardium Levioso to 3rd place in the RoboCup @Home Education Major Competition (Netherlands)."
            ],
            "images": []
        },
        {
            "company": "Mentorness",
            "role": "Machine Learning Intern",
            "period": "April 2024 – May 2024",
            "location": "Ahmedabad, India (Remote)",
            "description": [
                "Built predictive models for disease diagnosis (Anemia, Diabetes, Thalassemia) and stock market forecasting using Scikit-learn, TensorFlow, and PyTorch.",
                "Developed classifiers (Naive Bayes, Random Forest, Logistic Regression) and sequence models (LSTM, GRU).",
                "Compared multiple models and selected top performers (90%+ accuracy) for deployment."
            ],
            "images": []
        }
    ],
    "education": [
        {
            "institution": "Arab Academy for Science, Technology and Maritime Transport",
            "degree": "Bachelor's degree, Artificial Intelligence (Intelligent Systems)",
            "period": "October 2021 – July 2025",
            "honors": "GPA 3.94 — Excellent with Honors",
            "images": []
        },
        {
            "institution": "Al Ma'arifa International Private School",
            "degree": "High School Diploma",
            "period": "September 2017 – July 2021",
            "images": []
        }
    ],
    "skills": {
        "AI & Machine Learning": [
            "TensorFlow",
            "PyTorch",
            "Scikit-learn",
            "Computer Vision",
            "Predictive Modeling"
        ],
        "NLP & LLMs": [
            "LangChain",
            "LangGraph",
            "RAG Pipelines",
            "ReAct Agents",
            "Prompt Engineering"
        ],
        "Robotics & Automation": [
            "ROS",
            "Arduino",
            "RoboCup @Home",
            "Production Automation"
        ],
        "Data Engineering": [
            "Google BigQuery",
            "Microsoft SQL Server",
            "Supabase",
            "ETL Pipelines"
        ],
        "Software Development": [
            "Python",
            "TypeScript",
            "React",
            "Node.js",
            "REST APIs"
        ]
    },
    "awards": [
        {
            "title": "1st Place – RoboCup @Home Education Competition (Egypt)",
            "year": "2024",
            "images": []
        },
        {
            "title": "3rd Place – RoboCup @Home Education Major Competition (Netherlands)",
            "year": "2024",
            "images": []
        },
        {
            "title": "Honorary Award – Smart White Cane (AISC), White Cane Conference",
            "year": "",
            "images": []
        },
        {
            "title": "Certificate of Excellence – Graduation Honors",
            "year": "2025",
            "images": []
        }
    ],
    "certifications": [
        {
            "title": "Certificate of Achievement – Mentorness Machine Learning Internship",
            "images": []
        },
        {
            "title": "Certificate of Excellence – Graduation Honors",
            "images": []
        },
        {
            "title": "3rd Place – RoboCup @Home Education Major Competition (Netherlands)",
            "images": []
        },
        {
            "title": "Certificate of Participation – RoboCup Junior",
            "images": []
        },
        {
            "title": "IELTS Academic Certificate",
            "images": []
        }
    ],
    "projects": [],
    "languages": [
        { "language": "Arabic", "level": "Native" },
        { "language": "English", "level": "Full Professional" }
    ]
}
```

- [ ] **Step 5: Create `src/lib/profile.ts`**

```typescript
/**
 * Typed, frozen accessor for the portfolio content (SPECIFICATION.md §7).
 * All personal content lives in data/profile.json — components import
 * `profile` from here and NEVER hardcode personal content.
 *
 * No Zod / runtime schema: the JSON is compiled into the bundle, so no trust
 * boundary is crossed (design decision 4; revisit at Phase 2's VFS generator).
 */
import profile_data from './data/profile.json';

export interface ProfileImage {
    src: string;
    alt: string;
}

export interface ProfileMeta {
    name: string;
    shortName: string;
    title: string;
    tagline: string;
    location: string;
    email: string;
    phone: string;
    avatar: string;
    resumePdf: string;
}

export interface ProfileAbout {
    bio: string[];
}

export interface SocialLink {
    platform: string;
    url: string;
    icon: string;
}

export interface ExperienceEntry {
    company: string;
    role: string;
    period: string;
    location: string;
    description: string[];
    images: ProfileImage[];
}

export interface EducationEntry {
    institution: string;
    degree: string;
    period: string;
    honors?: string;
    images: ProfileImage[];
}

export interface Award {
    title: string;
    year: string;
    images: ProfileImage[];
}

export interface Certification {
    title: string;
    images: ProfileImage[];
}

export interface Project {
    name: string;
    description: string;
    tech: string[];
    url: string;
    images: ProfileImage[];
}

export interface LanguageEntry {
    language: string;
    level: string;
}

export interface Profile {
    meta: ProfileMeta;
    about: ProfileAbout;
    social: SocialLink[];
    experience: ExperienceEntry[];
    education: EducationEntry[];
    skills: Record<string, string[]>;
    awards: Award[];
    certifications: Certification[];
    projects: Project[];
    languages: LanguageEntry[];
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function deep_freeze(value: unknown): void {
    if (!is_record(value)) return;
    Object.freeze(value);
    for (const key of Object.keys(value)) {
        deep_freeze(value[key]);
    }
}

export const profile: Profile = profile_data;
deep_freeze(profile);
```

Note: `resolveJsonModule` is on via the generated `.svelte-kit/tsconfig.json`; the typed assignment `const profile: Profile = profile_data` is the shape check — if the JSON drifts from the interface, `npm run check` fails.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/lib/profile.test.ts`
Expected: PASS — 8 tests.

- [ ] **Step 7: Run remaining gates and commit**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build
git add src/lib/data/profile.json src/lib/profile.ts src/lib/profile.test.ts static/assets/Mohamed_Abdelnasser_Resume.pdf
git commit -m "feat: add profile.json data model with typed frozen accessor"
```

---

### Task 2: Welcome screen retime (pure 1.5s timer, no audio)

**Files:**
- Modify: `src/routes/xp/welcome.svelte` (full rewrite; today its only advance path is the startup-audio `ended`/7s fallback at lines 16–36)

**Interfaces:**
- Consumes: nothing.
- Produces: same `done` component event consumed by `desktop.svelte:91` (`<Welcome on:done={() => (show_welcome = false)} />` — unchanged). Root element gains `id="welcome-overlay"` — E2E in Tasks 3/6 and slice-2/3 helpers rely on this exact id.

- [ ] **Step 1: Rewrite `src/routes/xp/welcome.svelte`**

Replace the entire file with:

```svelte
<script lang="ts">
    import { onMount, createEventDispatcher } from 'svelte';

    // eslint-disable-next-line @typescript-eslint/no-deprecated -- legacy component-event dispatcher kept as-is; matches the sibling boot screens
    const dispatcher = createEventDispatcher<{ done: null }>();

    /** §2.3: ~1.5s, auto-advances. */
    const WELCOME_MS = 1500;
    /** §2 transitions table: Welcome → Desktop fade ~600ms. */
    const FADE_MS = 600;

    let fading = false;

    onMount(() => {
        // The startup sound is NOT played here: it belongs to the login-card
        // click (design decision 2). It keeps playing over this splash.
        const fade_timer = setTimeout(() => {
            fading = true;
        }, WELCOME_MS);
        const done_timer = setTimeout(() => {
            dispatcher('done');
        }, WELCOME_MS + FADE_MS);
        return () => {
            clearTimeout(fade_timer);
            clearTimeout(done_timer);
        };
    });
</script>

<div
    id="welcome-overlay"
    class="absolute inset-0 z-50 overflow-hidden flex flex-col bg-[#5a7edc] font-sans transition-opacity duration-[600ms] {fading
        ? 'opacity-0'
        : 'opacity-100'}"
>
    <div
        class="h-[70px] bg-[#00309c] flex flex-row items-center shrink-0"
    ></div>
    <div
        class="h-[2px] bg-[linear-gradient(45deg,#466dcd,#c7ddff,#b0c9f7,#5a7edc)] shrink-0"
    ></div>
    <div
        class="grow bg-[radial-gradient(circle_at_5%_5%,#91b1ef_0,#7698e6_6%,#5a7edc_12%)] relative overflow-hidden"
    >
        <span
            class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[42px] text-slate-50 italic font-bold"
            >Welcome</span
        >
    </div>

    <div
        class="h-[2px] bg-[linear-gradient(45deg,#003399,#f99736,#c2814d,#00309c)] shrink-0"
    ></div>
    <div
        class="h-[70px] w-full bg-[linear-gradient(90deg,#3833ac,#00309c)] shrink-0 relative"
    ></div>
</div>
```

- [ ] **Step 2: Verify by hand**

Run: `npm run dev` → http://localhost:3000. Boot lands on the desktop (login doesn't exist yet); the Welcome splash shows ~1.5s, fades out over ~600ms, no audio, desktop interactive afterwards.

- [ ] **Step 3: Run gates and commit**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build && npx playwright test
git add src/routes/xp/welcome.svelte
git commit -m "feat: retime welcome splash to spec (1.5s timer + fade, no audio)"
```

---

### Task 3: Login screen + boot-chain wiring + smoke-test update (ONE commit)

> CI atomicity (design, Testing): the moment `starting.svelte` targets the login screen, `bootToDesktop` in the E2E suite must click through it — **all changes in this task land in the same commit.**

**Files:**
- Create: `src/routes/xp/login.svelte`
- Create: `e2e/helpers.ts`
- Create: `e2e/login.spec.ts`
- Modify: `src/routes/+page.svelte:4-33` (import branch + `PageComponent` union) and `:37` (title)
- Modify: `src/routes/xp/starting.svelte:213` (dispatch retarget)
- Modify: `src/app.html:5` (title)
- Modify: `e2e/smoke.spec.ts:3-9` (bootToDesktop moves to helpers and gains the login click + welcome wait)

**Interfaces:**
- Consumes: `profile.meta.{avatar,name,title}` from Task 1; `LoadPageEvent` from `src/lib/types.ts:224`.
- Produces: `login.svelte` dispatches `load_page` with `{ url: './xp/desktop.svelte' }`; DOM ids `#login-user-card` (the clickable card) and `#welcome-overlay` (from Task 2) are the E2E contract; `bootToDesktop(page)` exported from `e2e/helpers.ts` is used by every later spec.

- [ ] **Step 1: Create `src/routes/xp/login.svelte`**

Content per §2.2 + `design/inspiration/my-users.png`: three-column middle (left branding, center instruction, right user card), top/bottom XP bands (reuse the welcome screen's exact band colors), bottom-left restart, bottom-right flavor text.

```svelte
<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    import { profile } from '../../lib/profile';
    import type { LoadPageEvent } from '../../lib/types';

    // eslint-disable-next-line @typescript-eslint/no-deprecated -- legacy component-event dispatcher kept as-is; matches the sibling boot screens
    const dispatcher = createEventDispatcher<{ load_page: LoadPageEvent }>();

    let logging_in = false;

    function log_in() {
        if (logging_in) return;
        logging_in = true;
        // §4.3: this click is the user gesture that unlocks audio, so the XP
        // startup sound genuinely plays. It intentionally keeps playing over
        // the welcome splash and into the desktop, like real XP.
        const startup = new Audio('/audio/xp_startup.mp3');
        startup.play().catch(() => {
            // autoplay rejected — boot silently; sound manager arrives Phase 6
        });
        dispatcher('load_page', { url: './xp/desktop.svelte' });
    }

    function restart() {
        window.location.reload();
    }
</script>

<div
    class="absolute inset-0 z-50 overflow-hidden flex flex-col bg-[#5a7edc] font-sans animate-fadein"
>
    <div
        class="h-[70px] bg-[#00309c] flex flex-row items-center shrink-0"
    ></div>
    <div
        class="h-[2px] bg-[linear-gradient(45deg,#466dcd,#c7ddff,#b0c9f7,#5a7edc)] shrink-0"
    ></div>

    <div
        class="grow bg-[radial-gradient(circle_at_5%_5%,#91b1ef_0,#7698e6_6%,#5a7edc_12%)] relative overflow-hidden flex flex-row items-center"
    >
        <!-- left: branding -->
        <div class="w-1/3 flex flex-col items-center justify-center px-6">
            <img
                src="/assets/images/xp-logo.png"
                alt=""
                class="w-24 mb-4 drop-shadow-lg"
            />
            <p
                class="text-slate-50 text-3xl font-bold"
                style="text-shadow: 2px 2px 3px rgba(0,0,0,0.4);"
            >
                Momad's XP
            </p>
            <p class="text-slate-200 text-lg italic">{profile.meta.title}</p>
        </div>

        <!-- divider -->
        <div
            class="w-px self-stretch my-10 bg-[linear-gradient(to_bottom,transparent,rgba(255,255,255,0.6),transparent)] shrink-0"
        ></div>

        <!-- center: instruction -->
        <div class="w-1/3 flex items-center justify-center px-6">
            <p
                class="text-slate-50 text-lg text-center"
                style="text-shadow: 1px 1px 2px rgba(0,0,0,0.4);"
            >
                To begin, click on Mohamed to log in
            </p>
        </div>

        <!-- right: user card -->
        <div class="w-1/3 flex items-center justify-center px-6">
            <div
                id="login-user-card"
                role="button"
                tabindex="0"
                class="flex flex-row items-center gap-4 p-3 rounded-md cursor-pointer hover:bg-white/20 focus:bg-white/20 outline-none"
                on:click={log_in}
                on:keydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') log_in();
                }}
            >
                <img
                    src={profile.meta.avatar}
                    alt={profile.meta.name}
                    class="w-16 h-16 rounded border-2 border-white/80 object-cover shadow-lg"
                />
                <div class="flex flex-col">
                    <span class="text-slate-50 text-xl font-semibold"
                        >{profile.meta.name}</span
                    >
                    <span class="text-slate-200 text-sm"
                        >{profile.meta.title}</span
                    >
                </div>
            </div>
        </div>
    </div>

    <div
        class="h-[2px] bg-[linear-gradient(45deg,#003399,#f99736,#c2814d,#00309c)] shrink-0"
    ></div>
    <div
        class="h-[70px] w-full bg-[linear-gradient(90deg,#3833ac,#00309c)] shrink-0 relative flex flex-row items-center justify-between px-6"
    >
        <div
            role="button"
            tabindex="0"
            class="flex flex-row items-center gap-2 cursor-pointer rounded p-1 hover:bg-white/10 outline-none"
            on:click={restart}
            on:keydown={(e) => {
                if (e.key === 'Enter') restart();
            }}
        >
            <div
                class="w-7 h-7 bg-[url(/images/xp/icons/Restart.png)] bg-contain bg-no-repeat"
            ></div>
            <span class="text-slate-50 text-sm">Restart Momad's XP</span>
        </div>
        <p class="text-slate-300 text-xs max-w-[340px] text-right">
            After you log on, the system is yours to explore. Every detail has
            been designed with a purpose.
        </p>
    </div>
</div>
```

- [ ] **Step 2: Wire the boot chain**

`src/routes/+page.svelte` — four edits:

1. Add the import type (after line 8, inside the existing eslint-disable block):

```typescript
    import type Login from './xp/login.svelte';
```

2. Extend the union (lines 10-11):

```typescript
    type PageComponent =
        | typeof Starting
        | typeof Login
        | typeof Desktop
        | typeof Shutdown
        | typeof Blackout;
```

3. Add the branch inside `load_page` (after the `'./xp/starting.svelte'` branch at line 22-23):

```typescript
        } else if (url == './xp/login.svelte') {
            page = (await import('./xp/login.svelte')).default;
```

4. Change line 37: `<title>Momad's XP</title>`

`src/routes/xp/starting.svelte:213` — retarget the dispatch:

```typescript
        dispatcher('load_page', { url: './xp/login.svelte' });
```

`src/app.html:5` — change the title (the svelte:head one wins post-hydration; this covers pre-hydration):

```html
        <title>Momad's XP</title>
```

- [ ] **Step 3: Extract and update the E2E boot helper — same commit**

Create `e2e/helpers.ts`:

```typescript
import { expect, type Page } from '@playwright/test';

/**
 * Boot → login-card click → welcome splash → interactive desktop.
 *
 * The welcome splash overlays the whole desktop (z-50) for ~2.1s: visibility
 * checks on the taskbar pass while clicks would still land on the overlay,
 * so this explicitly waits for the overlay to unmount.
 */
export async function bootToDesktop(page: Page): Promise<void> {
    await page.goto('/');
    // boot takes >=3s (aesthetic sleep) + asset preloading, then shows login
    await page.locator('#login-user-card').click({ timeout: 30_000 });
    await expect(page.locator('#start-menu-btn')).toBeVisible({
        timeout: 30_000,
    });
    await expect(page.locator('#welcome-overlay')).toHaveCount(0, {
        timeout: 10_000,
    });
}
```

Update `e2e/smoke.spec.ts` — delete the local `bootToDesktop` (lines 3-9) and the now-unused `type Page` import; import the helper instead:

```typescript
import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';
```

(The three existing tests keep their bodies unchanged.)

- [ ] **Step 4: Write the login E2E spec — same commit**

Create `e2e/login.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test('login screen renders branding, instruction, and user card', async ({
    page,
}) => {
    await page.goto('/');
    const card = page.locator('#login-user-card');
    await expect(card).toBeVisible({ timeout: 30_000 });
    await expect(
        page.getByText('To begin, click on Mohamed to log in'),
    ).toBeVisible();
    await expect(page.getByText("Restart Momad's XP")).toBeVisible();
    await expect(card.getByText('Mohamed Abdelnasser')).toBeVisible();
    await expect(card.getByText('AI Engineer')).toBeVisible();
});

test('clicking the user card reaches the desktop through welcome', async ({
    page,
}) => {
    await page.goto('/');
    await page.locator('#login-user-card').click({ timeout: 30_000 });
    await expect(page.locator('#welcome-overlay')).toBeVisible({
        timeout: 15_000,
    });
    await expect(page.locator('#start-menu-btn')).toBeVisible({
        timeout: 30_000,
    });
    await expect(page.locator('#welcome-overlay')).toHaveCount(0, {
        timeout: 10_000,
    });
});
```

- [ ] **Step 5: Run the full E2E suite**

Run: `npx playwright test`
Expected: 5 passed (3 smoke + 2 login).

- [ ] **Step 6: Run remaining gates and commit (single atomic commit)**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build
git add src/routes/xp/login.svelte src/routes/+page.svelte src/routes/xp/starting.svelte src/app.html e2e/helpers.ts e2e/smoke.spec.ts e2e/login.spec.ts
git commit -m "feat: add XP login screen to the boot chain (starting -> login -> desktop)"
```

---

### Task 4: Boot screen rebrand + click/keypress skip + preload regen

**Files:**
- Modify: `src/routes/xp/starting.svelte:193-214` (skip flow), `:359-384` (markup), `:30-191` (preload arrays)

**Interfaces:**
- Consumes: `login.svelte` dispatch target from Task 3.
- Produces: nothing new for later tasks.

- [ ] **Step 1: Implement the skip flow**

In `src/routes/xp/starting.svelte`, replace the `onMount` body (lines 193-214) and add the two helpers:

```typescript
    let core_ready = false; // hardDrive + wallpaper seeded — the desktop cannot mount without them
    let booted = false;

    onMount(async () => {
        await load_hard_drive();
        await load_wallpaper();
        core_ready = true;

        load_assets([...audios, ...images, ...fonts, ...empties], () => {
            assets_loaded = true;
        });

        // wait at least 3s (aesthetic), then up to 7s more for assets
        await utils.sleep(3000);
        let waited = 3000;
        while (!assets_loaded && waited < 10000) {
            await utils.sleep(500);
            waited += 500;
        }

        finish_boot();
    });

    /**
     * §2.1: click anywhere or press any key to skip. Asset fetches already
     * fired and keep loading in the background; the VFS seed is the one hard
     * dependency, so skipping is ignored until it has landed.
     */
    function skip_boot() {
        if (!core_ready) return;
        finish_boot();
    }

    function finish_boot() {
        if (booted) return;
        booted = true;
        preload_iframes();
        preload_context_menus();
        dispatcher('load_page', { url: './xp/login.svelte' });
    }
```

Delete the old trailing lines of the previous `onMount` (`preload_iframes(); preload_context_menus(); console.log('after preload_context_menu'); dispatcher(...)`) — they moved into `finish_boot`.

At the end of the markup (after the closing outer `</div>`, before `<style>`), add:

```svelte
<svelte:window on:click={skip_boot} on:keydown={skip_boot} />
```

- [ ] **Step 2: Rebrand the markup**

Replace lines 359-384 (the two `<div>` blocks) with:

```svelte
<div class="absolute inset-0 bg-black overflow-hidden text-slate-100">
    <div
        class="absolute top-[50%] -translate-y-[50%] left-[50%] -translate-x-[50%] animate-fadein flex flex-col items-center"
    >
        <img src="/assets/images/xp-logo.png" alt="" width="140px" />
        <p
            class="mt-4 text-4xl font-bold font-sans text-slate-50"
            style="text-shadow: 2px 2px 3px rgba(0,0,0,0.6);"
        >
            Momad's XP
        </p>
        <p class="text-lg font-sans text-slate-300 italic">AI Engineer</p>
        <div class="xp-loader">
            <div></div>
            <div></div>
            <div></div>
        </div>
    </div>

    <div
        class="absolute left-4 right-4 bottom-6 animate-fadein flex flex-row items-end justify-between gap-2"
    >
        <p class="text-sm sm:text-base font-sans shrink-0">
            For the best experience, Enter Full Screen (F11)
        </p>
        <p class="text-sm sm:text-base font-sans shrink-0">Portfolio</p>
    </div>
</div>
```

Also reduce the `.xp-loader` top margin so the bar sits under the text block — in the `<style>` block change `margin-top: 150px;` to `margin-top: 60px;` (parity loop in Task 5 fine-tunes against `my-loading.png`).

- [ ] **Step 3: Regenerate the preload arrays (phase-0-guide §10 discipline)**

```bash
node gen/assets.js > /tmp/claude-assets-regen.txt
cat /tmp/claude-assets-regen.txt
```

Replace the `images`, `audios`, `fonts`, `empties` const arrays in `starting.svelte:30-191` with the printed ones (the regen drops `xp_loading_logo.jpg` / `xp_loading_mslogo.jpg`, which are no longer referenced). Then **manually append** the two portfolio assets the script cannot see (it only walks `static/images|fonts|audio|empty`, not `static/assets/`) to the `images` array:

```typescript
        '/assets/images/xp-logo.png',
        '/assets/images/avatar.png',
```

- [ ] **Step 4: Verify by hand**

`npm run dev` → boot shows "Momad's XP / AI Engineer" + F11 hint + Portfolio watermark; a click (or any key) during boot jumps straight to login; letting it run also reaches login; page/tab title is "Momad's XP".

- [ ] **Step 5: Run gates and commit**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build && npx playwright test
git add src/routes/xp/starting.svelte
git commit -m "feat: rebrand boot screen to Momad's XP with click/keypress skip"
```

---

### Task 5: Slice-1 parity loop (§11) + PR

**Files:**
- Create: `design/research/gate1-slice1-boot.png`, `gate1-slice1-login.png`, `gate1-slice1-welcome.png` (+ `-ref` variants as needed)

- [ ] **Step 1: Start the app**

```bash
npm run dev
```

(background; app at http://localhost:3000)

- [ ] **Step 2: Two-browser parity walk (Playwright MCP)**

Using the Playwright MCP browser tools at viewport 1280×800 (`browser_resize`):
1. Tab A → `http://localhost:3000`; Tab B (`browser_tabs`) → the reference: `file:///home/momad/Projects/Momads-XP/design/inspiration/my-loading.png`, then `my-users.png`, then `my-welcome.png` at the same stage.
2. Screenshot Tab A at each stage with `browser_take_screenshot` → save as `design/research/gate1-slice1-{boot,login,welcome}.png`. For the 1.5s welcome, click the login card and screenshot immediately.
3. Compare pixel-level against the mockups: layout, gradients (`#00309c` bands, `#5a7edc` field), font sizes/weights, logo scale, element positions.
4. Fix differences in `starting.svelte` / `login.svelte` / `welcome.svelte`, reload, re-screenshot. Iterate until ≥95% parity (acceptable diffs: font rendering subtleties, sub-pixel AA, content differences the design states, e.g. mockup copy "To begin, click your user name" vs the design's mandated "To begin, click on Mohamed to log in").
5. Also compare the welcome screen against https://win32.run (inherited chrome must not regress).

Do not ask for confirmation mid-loop; screenshots are the evidence.

- [ ] **Step 3: Final gates, push, PR**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build && npx playwright test
git add design/research/
git commit -m "docs: add slice-1 visual parity evidence"
git push -u origin feature/phase-1-slice-1-login-boot
gh pr create --base dev --title "Phase 1 slice 1: profile.json, login screen, welcome retime, boot rebrand + skip" --body "$(cat <<'EOF'
## Summary
- `src/lib/data/profile.json` + typed frozen `src/lib/profile.ts` (§7, real data; projects [] until Phase 2)
- New XP login screen in the load_page chain (§2.2); startup sound moved to the login-card click (§4.3)
- Welcome splash retimed to a pure 1.5s timer + 600ms fade (§2.3)
- Boot screen rebranded ("Momad's XP / AI Engineer", F11 hint, Portfolio watermark) + §2.1 click/keypress skip
- E2E: bootToDesktop now clicks through login and waits out the welcome overlay (same commit as the login insert); new login spec
- Resume PDF copied to static/assets; preload manifest regenerated

## Test plan
- [ ] CI green (check / lint / format / vitest+coverage / build / playwright)
- [ ] Manual: boot → skip via click → login → card click plays startup sound → welcome 1.5s → desktop
- [ ] Parity evidence in design/research/gate1-slice1-*.png

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Part 2 — Slice 2: placeholder program, seed curation, start menu, cascade, fallback dialog

Branch (after slice 1 merged — this slice imports `src/lib/profile.ts`):
`git checkout dev && git pull && git checkout -b feature/phase-1-slice-2-shell-curation`

### Task 6: Placeholder program + launch mechanism

**Files:**
- Create: `src/lib/placeholder.ts`
- Create: `src/routes/xp/programs/placeholder.svelte`
- Modify: `src/lib/types.ts:75-83` (`ProgramLaunchRequest`)
- Modify: `src/routes/xp/work_space.svelte:32-209` (`launch()` gains a branch + destructure)
- Modify: `src/routes/xp/desktop_folder.svelte:213-217` (executable dispatch)
- Modify: `src/routes/xp/programs/my_computer/viewer.svelte:241-245` (executable dispatch)
- Test: `src/lib/placeholder.test.ts`

**Interfaces:**
- Consumes: `Window.svelte`, `Button.svelte`, `runningPrograms` store, `VfsItem`/`ProgramInstance`/`WindowOptions` from `src/lib/types.ts`.
- Produces: `placeholder_display(item: Partial<VfsItem> | undefined): { name: string; icon: string }` from `src/lib/placeholder.ts`; `ProgramLaunchRequest.exe_item?: Partial<VfsItem>` (new field); launchable path `'./programs/placeholder.svelte'` — Task 7's seed items and Task 9's start-menu entries point at it. Start-menu launches pass a literal `fs_item: { name, icon }`; VFS launches pass the exe's own item as `exe_item`.

> **Why `exe_item` and not `fs_item` (refinement of design decision 5):** the design says the executable dispatch "gains `fs_item`". But `work_space.launch()` already gives `fs_item` a meaning for some targets — e.g. the my_computer branch opens `fs_item` **as the folder to display**. Passing the `.exe`'s own VFS item as `fs_item` would make the desktop "My Computer" icon try to open the `.exe` file as a folder. A separate `exe_item` field carries the executable's identity without hijacking the argument channel; the placeholder reads `exe_item ?? fs_item` so start-menu literals keep working.

- [ ] **Step 1: Write the failing test**

Create `src/lib/placeholder.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { placeholder_display } from './placeholder';

describe('placeholder_display', () => {
    it('uses basename + icon for VFS .exe items', () => {
        expect(
            placeholder_display({
                basename: 'About Me',
                name: 'About Me.exe',
                icon: '/assets/icons/about-me.png',
            }),
        ).toEqual({ name: 'About Me', icon: '/assets/icons/about-me.png' });
    });

    it('falls back to name for start-menu literals', () => {
        expect(
            placeholder_display({
                name: 'Command Prompt',
                icon: '/images/xp/icons/CommandPrompt.png',
            }),
        ).toEqual({
            name: 'Command Prompt',
            icon: '/images/xp/icons/CommandPrompt.png',
        });
    });

    it('has safe defaults when nothing is passed', () => {
        expect(placeholder_display(undefined)).toEqual({
            name: 'This program',
            icon: '/images/xp/icons/ApplicationWindow.png',
        });
    });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/placeholder.test.ts`
Expected: FAIL — cannot resolve `./placeholder`.

- [ ] **Step 3: Create `src/lib/placeholder.ts`**

```typescript
import type { VfsItem } from './types';

export interface PlaceholderDisplay {
    name: string;
    icon: string;
}

const DEFAULT_ICON = '/images/xp/icons/ApplicationWindow.png';

/**
 * Derive the placeholder window's title + icon from whatever launch payload
 * arrived: a full VFS `.exe` item (desktop / Explorer double-click — prefer
 * `basename`, since `name` carries the `.exe` suffix), a start-menu literal
 * (`{ name, icon }`), or nothing.
 */
export function placeholder_display(
    item: Partial<VfsItem> | undefined,
): PlaceholderDisplay {
    return {
        name: item?.basename ?? item?.name ?? 'This program',
        icon: item?.icon ?? DEFAULT_ICON,
    };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/placeholder.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Create `src/routes/xp/programs/placeholder.svelte`**

```svelte
<svelte:options accessors={true} />

<script lang="ts">
    import Window from '../../../lib/components/xp/Window.svelte';
    import Button from '../../../lib/components/xp/Button.svelte';
    import { unmount } from 'svelte';
    import { runningPrograms } from '../../../lib/store';
    import { placeholder_display } from '../../../lib/placeholder';
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
    export let fs_item: Partial<VfsItem> | undefined = undefined;

    const display = placeholder_display(fs_item);

    export function destroy() {
        runningPrograms.update((programs) =>
            programs.filter((p) => p != get_self()),
        );
        void unmount(required(get_self(), 'placeholder instance'));
    }

    // exec_path is deliberately NOT set: placeholders never persist a window
    // rect, so every instance goes through the cascade (design decision 12)
    // and multiple instances stay allowed (design decision 5).
    export let options: WindowOptions = {
        title: display.name,
        icon: display.icon,
        id: id,
        width: 380,
        height: 180,
        min_width: 380,
        min_height: 180,
        resizable: false,
        maximize_btn: false,
    };
</script>

<Window {options} bind:this={window} on_click_close={destroy}>
    <div
        slot="content"
        class="absolute inset-0 bg-xp-yellow flex flex-col p-3"
    >
        <div class="grow flex flex-row items-center">
            <div
                class="w-10 h-10 mr-4 shrink-0 bg-contain bg-no-repeat bg-center"
                style:background-image="url({display.icon})"
            ></div>
            <p class="text-[11px] text-slate-800">
                {display.name} is under construction — coming in a later phase.
            </p>
        </div>
        <div class="flex flex-row justify-center pb-1">
            <Button title="OK" focus={true} on_click={destroy}></Button>
        </div>
    </div>
</Window>
```

- [ ] **Step 6: Add `exe_item` to the launch contract**

`src/lib/types.ts` — inside `ProgramLaunchRequest` (after the `fs_item` field, line 79):

```typescript
    /**
     * The launched executable's own VFS item (name/icon source for the
     * placeholder). Distinct from `fs_item`, which is the *argument* some
     * programs open (e.g. the folder my_computer displays).
     */
    exe_item?: Partial<VfsItem>;
```

- [ ] **Step 7: Wire the dispatches**

`src/routes/xp/desktop_folder.svelte:213-217` — the executable branch of `open()` becomes:

```typescript
            if (fs_item.executable) {
                queueProgram.set({
                    path: fs_item.url,
                    webapp: fs_item.webapp,
                    exe_item: fs_item,
                });
            } else if (handlers != null) {
```

`src/routes/xp/programs/my_computer/viewer.svelte:241-245` — same change:

```typescript
            if (fs_item.executable) {
                queueProgram.set({
                    path: fs_item.url,
                    webapp: fs_item.webapp,
                    exe_item: fs_item,
                });
            } else if (handlers != null) {
```

`src/routes/xp/work_space.svelte` — two edits:

1. Line 33, widen the destructure:

```typescript
        const { fs_item, exe_item, copying_obj, target_folder_id, path } =
            program;
```

2. Add a branch after the `image_viewer` branch (after line 193, before the `copier` branch):

```typescript
        } else if (path == './programs/placeholder.svelte') {
            const Program = (await import('./programs/placeholder.svelte'))
                .default;
            const program: ProgramInstance = mount(Program, {
                target: node_ref,
                props: {
                    id: short.generate(),
                    fs_item: exe_item ?? fs_item,
                    get_self: () => program,
                },
            });
            //add to program tray
            runningPrograms.update((values) => {
                return [...values, program];
            });
```

- [ ] **Step 8: Run gates and commit**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build && npx playwright test
git add src/lib/placeholder.ts src/lib/placeholder.test.ts src/routes/xp/programs/placeholder.svelte src/lib/types.ts src/routes/xp/work_space.svelte src/routes/xp/desktop_folder.svelte src/routes/xp/programs/my_computer/viewer.svelte
git commit -m "feat: add under-construction placeholder program and exe_item launch channel"
```

---

### Task 7: Desktop seed curation (scripted) + SEED_VERSION recompute + hash guard test

**Files:**
- Create: `gen/curate_seed_phase1.mjs` (committed for evidence; `gen/` is the untyped lint zone)
- Modify: `static/json/hard_drive.json` (via the script only — never by hand)
- Modify: `src/lib/seed.ts:14` (`SEED_VERSION`)
- Modify: `src/lib/seed.test.ts` (new hash-guard test)
- Move: `design/asset-pool/icons/minesweeper.png` and `solitaire.png` → `static/assets/icons/`

**Interfaces:**
- Consumes: placeholder path `'./programs/placeholder.svelte'` from Task 6.
- Produces: desktop children = My Computer, About Me, My CV, Internet Explorer, Contact Me (§3.5 order; + Recycle Bin, which is rendered separately and not a VFS child); new VFS ids `p1AboutMeDesktopExe0001`, `p1MyCvDesktopExe0000001`, `p1ContactMeDesktopExe01`; icons `/assets/icons/{about-me,my-cv,contact-me,minesweeper,solitaire,chess,doom}.png` all under `static/assets/icons/` for Task 9.

- [ ] **Step 1: Write the failing hash-guard test**

Append to `src/lib/seed.test.ts` (inside the existing `describe`), and add the two node imports at the top of the file:

```typescript
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
```

```typescript
    it('SEED_VERSION matches the current hard_drive.json content hash', () => {
        const digest = createHash('sha256')
            .update(readFileSync('static/json/hard_drive.json'))
            .digest('hex')
            .slice(0, 32);
        expect(SEED_VERSION).toBe(digest);
    });
```

Run: `npx vitest run src/lib/seed.test.ts`
Expected: PASS (the stamp currently matches — this test exists to fail the moment the next step edits the seed, and to guard every future seed edit until Phase 2 automates the stamp).

- [ ] **Step 2: Move the game icons into the served tree**

```bash
git mv design/asset-pool/icons/minesweeper.png static/assets/icons/minesweeper.png
git mv design/asset-pool/icons/solitaire.png static/assets/icons/solitaire.png
```

- [ ] **Step 3: Write the curation script**

Create `gen/curate_seed_phase1.mjs`:

```javascript
// One-shot Phase 1 desktop curation (design decision 6, SPECIFICATION.md §3.5).
// Desktop children become: My Computer, About Me, My CV, Internet Explorer,
// Contact Me. Paint / Media Player Classic move to start-menu-only; the empty
// Games desktop folder VFS entry is deleted. Parent/children consistency is
// verified before writing (Phase 0 discipline).
import fs from 'fs';

const SEED_PATH = 'static/json/hard_drive.json';
const DESKTOP_ID = 'nt1QdU9Sws26H26UNQZcQU';
const KEEP_MY_COMPUTER = 'sWTYkZhdpSYCmXP7z6459v';
const KEEP_IE = '2jpDfV5KSoYMArQnHgux5S';
const REMOVE = [
    '8zbKRcb6rGUW9QUoMdtUHY', // Paint.exe — start-menu-only per §3.5
    'mPStWjybAjUKtMyKhgtAag', // Media Player Classic.exe — start-menu-only
    'rugcCBKHiSYK5RFdud7m3p', // Games folder — empty; games become start-menu placeholders
];
const SEED_TIMESTAMP = 1676799354180; // the seed's canonical timestamp — stable diffs

const make_exe = (id, basename, icon) => ({
    id,
    type: 'file',
    basename,
    name: `${basename}.exe`,
    storage_type: 'fake',
    url: './programs/placeholder.svelte',
    ext: '.exe',
    parent: DESKTOP_ID,
    size: 1024,
    executable: true,
    icon,
    children: [],
    date_created: SEED_TIMESTAMP,
    date_modified: SEED_TIMESTAMP,
    sort_option: 0,
    sort_order: 0,
});

const NEW_ITEMS = [
    make_exe('p1AboutMeDesktopExe0001', 'About Me', '/assets/icons/about-me.png'),
    make_exe('p1MyCvDesktopExe0000001', 'My CV', '/assets/icons/my-cv.png'),
    make_exe('p1ContactMeDesktopExe01', 'Contact Me', '/assets/icons/contact-me.png'),
];

const hd = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));

for (const id of REMOVE) {
    if (!hd[id]) throw new Error(`expected item missing: ${id}`);
    delete hd[id];
}
for (const item of NEW_ITEMS) {
    if (hd[item.id]) throw new Error(`id collision: ${item.id}`);
    hd[item.id] = item;
}

// §3.5 order (top-to-bottom on the desktop's left edge)
hd[DESKTOP_ID].children = [
    KEEP_MY_COMPUTER,
    'p1AboutMeDesktopExe0001',
    'p1MyCvDesktopExe0000001',
    KEEP_IE,
    'p1ContactMeDesktopExe01',
];

// consistency: no dangling children, no dangling parents
for (const [id, item] of Object.entries(hd)) {
    for (const child of item.children ?? []) {
        if (!hd[child]) throw new Error(`dangling child ${child} in ${id}`);
    }
    if (item.parent && !hd[item.parent]) {
        throw new Error(`dangling parent ${item.parent} in ${id}`);
    }
}

fs.writeFileSync(SEED_PATH, JSON.stringify(hd, null, 4) + '\n');
console.log(`curated: ${Object.keys(hd).length} items on disk`);
```

- [ ] **Step 4: Run it and verify the hash test now FAILS**

(`static/` is prettier-ignored, so the script's `JSON.stringify(hd, null, 4)` output is the canonical formatting — no prettier pass needed.)

```bash
node gen/curate_seed_phase1.mjs
npx vitest run src/lib/seed.test.ts
```

Expected: script prints `curated: 24 items on disk` (24 = 24 − 3 removed + 3 added); vitest FAILS only the new hash test (RED — proves the guard works).

- [ ] **Step 5: Recompute and stamp SEED_VERSION**

```bash
sha256sum static/json/hard_drive.json | cut -c1-32
```

Paste the output into `src/lib/seed.ts:14` as the new `SEED_VERSION` value.

Run: `npx vitest run src/lib/seed.test.ts`
Expected: PASS — 5 tests (GREEN).

- [ ] **Step 6: Verify by hand**

`npm run dev` → hard-reload; IndexedDB re-seeds (version mismatch). Desktop shows exactly: My Computer, About Me, My CV, Internet Explorer, Contact Me + Recycle Bin (bottom-right). Double-clicking About Me opens the "About Me is under construction" placeholder. Paint/MPC/Games are gone from the desktop.

- [ ] **Step 7: Run gates and commit**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build && npx playwright test
git add gen/curate_seed_phase1.mjs static/json/hard_drive.json src/lib/seed.ts src/lib/seed.test.ts static/assets/icons/minesweeper.png static/assets/icons/solitaire.png
git commit -m "feat: curate desktop seed to the 5 spec icons with placeholder targets"
```

---

### Task 8: Notepad-fallback dialog (unhandled extensions)

**Files:**
- Create: `src/lib/no_association.ts`
- Modify: `src/routes/xp/desktop_folder.svelte:226-231` (else branch of `open()`)
- Modify: `src/routes/xp/programs/my_computer/viewer.svelte:254-258` (else branch of `open()`)

**Interfaces:**
- Consumes: `Dialog.svelte` (`title`, `message`, `icon`, `buttons: DialogButton[]`, `get_self`), `MountedComponent`/`required` from types.
- Produces: `show_no_association_dialog(filename: string): void` — mounts an XP dialog into `#desktop`.

- [ ] **Step 1: Create `src/lib/no_association.ts`**

```typescript
import { mount, unmount } from 'svelte';
import Dialog from './components/xp/Dialog.svelte';
import { required } from './types';
import type { MountedComponent } from './types';

/**
 * §9 Phase 1 exit criteria / Phase-0 red-team carry-over: double-clicking a
 * file with no associated program used to queue the pruned notepad.svelte
 * (a silent no-op). Show the XP "no association" dialog instead.
 */
export function show_no_association_dialog(filename: string): void {
    const target = required(
        document.querySelector('#desktop'),
        'desktop element',
    );
    const dialog: MountedComponent = mount(Dialog, {
        target,
        props: {
            title: filename,
            message:
                'Windows cannot open this file — no program is associated with it.',
            icon: '/images/xp/icons/Information.png',
            get_self: () => dialog,
            buttons: [
                {
                    name: 'OK',
                    focus: true,
                    action: () => {
                        void unmount(dialog);
                    },
                },
            ],
        },
    });
}
```

- [ ] **Step 2: Replace both dead notepad dispatches**

`src/routes/xp/desktop_folder.svelte` — add the import next to the other lib imports (after line 26):

```typescript
    import { show_no_association_dialog } from '../../lib/no_association';
```

Replace lines 226-231 (the `else` branch queueing `./programs/notepad.svelte`):

```typescript
            } else {
                show_no_association_dialog(fs_item.name);
            }
```

`src/routes/xp/programs/my_computer/viewer.svelte` — add the import next to the other lib imports:

```typescript
    import { show_no_association_dialog } from '../../../lib/no_association';
```

Replace lines 254-258 (the `else` branch queueing `./programs/notepad.svelte`):

```typescript
            } else {
                show_no_association_dialog(fs_item.name);
            }
```

- [ ] **Step 3: Verify by hand**

`npm run dev` → right-click desktop → New → Text Document → press Enter to commit the name → double-click it → the XP dialog appears with the message and an OK button; OK dismisses it. Repeat inside a My Computer window (C: drive → same flow).

- [ ] **Step 4: Run gates and commit**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build && npx playwright test
git add src/lib/no_association.ts src/routes/xp/desktop_folder.svelte src/routes/xp/programs/my_computer/viewer.svelte
git commit -m "feat: show XP no-association dialog for unhandled file extensions"
```

---

### Task 9: Start menu restructure (§3.4)

**Files:**
- Modify: `src/routes/xp/start_menu.svelte` — data arrays (`:24-324`), `StartMenuItem` (`:11-22`), `launch` (`:349-369`), header (`:398-401`), right column render (`:813-843`), bottom bar (`:846-872`), desktop flyout container (`:643-645` gains an id)

**Interfaces:**
- Consumes: `profile.meta.{avatar,name}` + `profile.social` (Task 1/slice 1); placeholder launch contract from Task 6; icons from Task 7.
- Produces: DOM contract for Task 11's E2E — `#start-menu` (existing), `#all-programs-flyout` (new id on the desktop flyout), social `<a>` elements with exact `href`s, Games L2 flyout entries Minesweeper/Solitaire/Chess/DOOM.

- [ ] **Step 1: Restructure the menu data**

In `src/routes/xp/start_menu.svelte`:

1. Add to the imports (top of script):

```typescript
    import { profile } from '../../lib/profile';
```

2. Extend `StartMenuItem` (line 11-22) with an external-link field:

```typescript
        /** External URL — renders as <a target="_blank" rel="noopener noreferrer"> instead of an app launch. */
        href?: string;
```

3. Replace the three data arrays (`col_1` lines 24-42, `col_2` lines 44-87, `programs` lines 89-324) entirely with:

```typescript
    /** Named placeholder launch (design decision 5): the literal fs_item
     *  carries name + icon for placeholder.svelte's window chrome. */
    const placeholder_entry = (name: string, icon: string): StartMenuItem => ({
        name,
        icon,
        path: './programs/placeholder.svelte',
        fs_item: { name, icon },
    });

    function social_url(platform: string): string {
        return required(
            profile.social.find((s) => s.platform === platform),
            `social link ${platform}`,
        ).url;
    }

    // ── Left column: pinned (§3.4) ──
    const col_1: (StartMenuItem | null)[] = [
        {
            name: 'Internet Explorer',
            icon: '/images/xp/icons/InternetExplorer6.png',
            path: './programs/internet_explorer.svelte',
            font: 'bold',
        },
        {
            name: 'Contact Me',
            icon: '/assets/icons/contact-me.png',
            path: './programs/placeholder.svelte',
            fs_item: { name: 'Contact Me', icon: '/assets/icons/contact-me.png' },
            font: 'bold',
        },
    ];

    // ── All Programs flyout (§3.4) ──
    const programs: (StartMenuItem | null)[] = [
        {
            name: 'My Computer',
            icon: '/images/xp/icons/MyComputer.png',
            path: './programs/my_computer.svelte',
        },
        placeholder_entry('About Me', '/assets/icons/about-me.png'),
        placeholder_entry(
            'Command Prompt',
            '/images/xp/icons/CommandPrompt.png',
        ),
        placeholder_entry('Python', '/images/xp/icons/ApplicationWindow.png'),
        {
            name: 'Paint',
            icon: '/images/xp/icons/Paint.png',
            path: './programs/paint.svelte',
        },
        {
            // §3.4 label; launches the real inherited MPC — the custom player
            // arrives in Phase 3 (design decision 7)
            name: 'Music Player',
            icon: '/images/xp/icons/MPC.png',
            path: './programs/media_player_classic.svelte',
        },
        {
            name: 'Games',
            icon: '/images/xp/icons/StartMenuPrograms.png',
            top: '-40px',
            items: [
                placeholder_entry(
                    'Minesweeper',
                    '/assets/icons/minesweeper.png',
                ),
                placeholder_entry('Solitaire', '/assets/icons/solitaire.png'),
                placeholder_entry('Chess', '/assets/icons/chess.png'),
                placeholder_entry('DOOM', '/assets/icons/doom.png'),
            ],
        },
    ];

    // ── Right column (§3.4): apps | socials — Shut Down lives in the bottom
    // bar (the existing flow, design decision 7; the Log Off row is removed) ──
    const col_2: (StartMenuItem | null)[] = [
        {
            name: 'My Computer',
            icon: '/images/xp/icons/MyComputer.png',
            path: './programs/my_computer.svelte',
            font: 'bold',
        },
        {
            name: 'My CV',
            icon: '/assets/icons/my-cv.png',
            path: './programs/placeholder.svelte',
            fs_item: { name: 'My CV', icon: '/assets/icons/my-cv.png' },
            font: 'bold',
        },
        {
            name: 'About Me',
            icon: '/assets/icons/about-me.png',
            path: './programs/placeholder.svelte',
            fs_item: { name: 'About Me', icon: '/assets/icons/about-me.png' },
            font: 'bold',
        },
        {
            name: 'Contact Me',
            icon: '/assets/icons/contact-me.png',
            path: './programs/placeholder.svelte',
            fs_item: { name: 'Contact Me', icon: '/assets/icons/contact-me.png' },
            font: 'bold',
        },
        null,
        // Socials open new tabs (design decision 7 — stated deviation from the
        // base's open-in-IE `link` semantics). Interim generic icon until the
        // slice-4 FA-brands components (plan Part 4, Task 19).
        {
            name: 'GitHub',
            icon: '/images/xp/icons/InternetShortcut.png',
            href: social_url('GitHub'),
        },
        {
            name: 'LinkedIn',
            icon: '/images/xp/icons/InternetShortcut.png',
            href: social_url('LinkedIn'),
        },
        {
            name: 'Instagram',
            icon: '/images/xp/icons/InternetShortcut.png',
            href: social_url('Instagram'),
        },
    ];
```

Note: `required` is already imported at line 6. The removed entries (My Pictures, My Music, Control Panel, Display Properties, Search, Run, Accessories tree, Windows Catalog/Update, Startup, MPC/Paint duplicates in `col_1`) go away entirely — §3.4 is exhaustive. Display Properties stays reachable via desktop right-click → Properties (verified in Task 12). This also drops the only `my_pictures_id`/`my_music_id` usages — remove them from the `import { my_pictures_id, my_music_id } from '../../lib/system';` line (line 4) to keep lint clean (delete the whole import if empty).

- [ ] **Step 2: Header — avatar + name (replaces the empty gradient div, lines 398-401)**

```svelte
    <div
        class="w-full h-[70px] rounded-t-md shrink-0 flex flex-row items-center px-2"
        style:background-image={'linear-gradient(rgb(24, 104, 206) 0%, rgb(14, 96, 203) 12%, rgb(14, 96, 203) 20%, rgb(17, 100, 207) 32%, rgb(22, 103, 207) 33%, rgb(27, 108, 211) 47%, rgb(30, 112, 217) 54%, rgb(36, 118, 220) 60%, rgb(41, 122, 224) 65%, rgb(52, 130, 227) 77%, rgb(55, 134, 229) 79%, rgb(66, 142, 233) 90%, rgb(71, 145, 235) 100%)'}
    >
        <img
            src={profile.meta.avatar}
            alt={profile.meta.name}
            class="w-12 h-12 rounded border-2 border-white/70 object-cover shadow"
        />
        <span
            class="ml-2 text-slate-50 text-[14px] font-bold"
            style="text-shadow: 1px 1px 1px rgba(0,0,0,0.5);"
            >{profile.meta.name}</span
        >
    </div>
```

Keep the surrounding eslint-disable comments for the long gradient exactly as they are.

- [ ] **Step 3: Right column renders `href` items as anchors**

Replace the `col_2` each-block (lines 815-842) with:

```svelte
            <!-- eslint-disable-next-line svelte/require-each-key -- inherited unkeyed each; keying changes DOM reuse semantics -->
            {#each col_2 as item}
                {#if item == null}
                    <div
                        class="my-0.5 mx-auto w-5/6 h-[1px] bg-blue-100 shrink-0"
                    ></div>
                {:else if item.href != null}
                    <a
                        href={item.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="flex flex-row items-center shrink-0 p-1 group/c2 hover:bg-blue-500 no-underline"
                        on:click={hide}
                    >
                        <div
                            class="w-7 h-7 bg-contain mr-1"
                            style:background-image="url({item.icon})"
                        ></div>
                        <div
                            class="text-[11px] group-hover/c2:text-white text-slate-800"
                        >
                            {item.name}
                        </div>
                    </a>
                {:else}
                    <div
                        class="flex flex-row items-center shrink-0 p-1 group/c2 hover:bg-blue-500"
                        on:click={() => {
                            launch(item);
                        }}
                    >
                        <div
                            class="w-7 h-7 bg-contain mr-1"
                            style:background-image="url({item.icon})"
                        ></div>
                        <div
                            class="text-[11px] group-hover/c2:text-white text-slate-800 {item.font ==
                            'bold'
                                ? 'font-bold'
                                : ''}"
                        >
                            {item.name}
                        </div>
                    </div>
                {/if}
            {/each}
```

- [ ] **Step 4: Bottom bar — remove the Log Off row**

Delete the Log Off block (lines 852-860: the first inner `<div class="p-1 rounded-sm ...">` with the Logout icon and "Log Off" span). Keep "Turn Off Computer" (this is §3.4's Shut Down — the existing `show_shutdown_panel` flow) unchanged.

- [ ] **Step 5: Add the flyout test id**

Line 643-645 — the desktop All Programs flyout container gains an id:

```svelte
                    <div
                        id="all-programs-flyout"
                        class="hidden sm:block absolute z-10 bottom-0 left-[90%] w-[250px] shadow-xl border-t border-l-4 border-blue-500 bg-slate-50"
                    >
```

- [ ] **Step 6: Verify by hand**

`npm run dev` → Start: header shows avatar + "Mohamed Abdelnasser"; pinned = IE + Contact Me; All Programs flyout = My Computer, About Me, Command Prompt, Python, Paint, Music Player, Games ▸ (Minesweeper/Solitaire/Chess/DOOM — each opens a named placeholder); Music Player opens MPC; right column = My Computer, My CV, About Me, Contact Me | GitHub/LinkedIn/Instagram (each opens a new tab); bottom bar has only Turn Off Computer; no Log Off, no Display Properties, no Search/Run.

- [ ] **Step 7: Run gates and commit**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build && npx playwright test
git add src/routes/xp/start_menu.svelte
git commit -m "feat: restructure start menu per spec (pinned, All Programs + Games flyout, socials, identity header)"
```

---

### Task 10: Window cascade (build work — base has none)

**Files:**
- Create: `src/lib/cascade.ts`
- Modify: `src/lib/components/xp/Window.svelte:95-102` (the no-saved-rect else branch; today rect-less windows open dead-center)
- Test: `src/lib/cascade.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `cascade_position(spawn_index: number, dims: CascadeDims): WindowPosition` (pure), `next_cascade_position(dims: CascadeDims): WindowPosition` (module-level spawn cursor), `reset_cascade(): void` (tests only), `CASCADE_STEP = 24`. `CascadeDims = { win_width, win_height, workspace_width, workspace_height }` (all `number`), `WindowPosition = { top, left }`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/cascade.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import {
    CASCADE_STEP,
    cascade_position,
    next_cascade_position,
    reset_cascade,
} from './cascade';

const dims = {
    win_width: 600,
    win_height: 400,
    workspace_width: 1280,
    workspace_height: 770,
};
// centered base for these dims
const base = { top: 185, left: 340 };

describe('cascade_position (pure)', () => {
    it('opens the first window at the centered base', () => {
        expect(cascade_position(0, dims)).toEqual(base);
    });

    it('offsets each successive spawn by 24px down-right', () => {
        expect(cascade_position(1, dims)).toEqual({
            top: base.top + CASCADE_STEP,
            left: base.left + CASCADE_STEP,
        });
        expect(cascade_position(3, dims)).toEqual({
            top: base.top + 3 * CASCADE_STEP,
            left: base.left + 3 * CASCADE_STEP,
        });
    });

    it('wraps back to the base before crossing the workspace bottom', () => {
        // max down-steps: floor((770 - 400 - 185) / 24) = 7 → 8 slots
        expect(cascade_position(7, dims).top).toBe(
            base.top + 7 * CASCADE_STEP,
        );
        expect(cascade_position(8, dims)).toEqual(base);
        expect(cascade_position(9, dims)).toEqual({
            top: base.top + CASCADE_STEP,
            left: base.left + CASCADE_STEP,
        });
    });

    it('pins oversized windows to the top-left with no offset', () => {
        const oversized = {
            win_width: 1400,
            win_height: 900,
            workspace_width: 1280,
            workspace_height: 770,
        };
        expect(cascade_position(0, oversized)).toEqual({ top: 0, left: 0 });
        expect(cascade_position(5, oversized)).toEqual({ top: 0, left: 0 });
    });
});

describe('next_cascade_position (module spawn cursor)', () => {
    beforeEach(() => {
        reset_cascade();
    });

    it('advances one slot per call', () => {
        expect(next_cascade_position(dims)).toEqual(base);
        expect(next_cascade_position(dims)).toEqual({
            top: base.top + CASCADE_STEP,
            left: base.left + CASCADE_STEP,
        });
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/cascade.test.ts`
Expected: FAIL — cannot resolve `./cascade`.

- [ ] **Step 3: Create `src/lib/cascade.ts`**

```typescript
/**
 * Window-cascade spawn positions (§4.1 "Cascade"; design decision 12 — BUILD
 * work, the base has none: rect-less windows opened dead-center and
 * Window.svelte's calc_nudges only offsets same-app duplicates with a saved
 * rect).
 *
 * Windows without a saved rect open at the centered base + n·(24,24),
 * wrapping back to the base before the window would cross the workspace's
 * bottom or right edge (the workspace already excludes the taskbar).
 * Saved-rect behavior is unchanged.
 */

export const CASCADE_STEP = 24;

export interface CascadeDims {
    win_width: number;
    win_height: number;
    workspace_width: number;
    workspace_height: number;
}

export interface WindowPosition {
    top: number;
    left: number;
}

export function cascade_position(
    spawn_index: number,
    dims: CascadeDims,
): WindowPosition {
    const base_top = Math.max(
        0,
        (dims.workspace_height - dims.win_height) / 2,
    );
    const base_left = Math.max(
        0,
        (dims.workspace_width - dims.win_width) / 2,
    );
    const max_down = Math.floor(
        (dims.workspace_height - dims.win_height - base_top) / CASCADE_STEP,
    );
    const max_right = Math.floor(
        (dims.workspace_width - dims.win_width - base_left) / CASCADE_STEP,
    );
    const slots = Math.max(1, Math.min(max_down, max_right) + 1);
    const step = spawn_index % slots;
    return {
        top: base_top + step * CASCADE_STEP,
        left: base_left + step * CASCADE_STEP,
    };
}

let spawn_index = 0;

/** Module-level spawn cursor: one increment per rect-less window mount. */
export function next_cascade_position(dims: CascadeDims): WindowPosition {
    const position = cascade_position(spawn_index, dims);
    spawn_index += 1;
    return position;
}

/** Test-only reset for the module-level cursor. */
export function reset_cascade(): void {
    spawn_index = 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/cascade.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 5: Integrate into `Window.svelte`**

Add the import (next to the other lib imports, after line 10):

```typescript
    import { next_cascade_position } from '../../cascade';
```

Replace the else branch at lines 95-102:

```typescript
        } else {
            if (options.top == null && options.left == null) {
                // no saved rect, no program-specified position → cascade (§4.1)
                const position = next_cascade_position({
                    win_width: win().offsetWidth,
                    win_height: win().offsetHeight,
                    workspace_width: parent.offsetWidth,
                    workspace_height: parent.offsetHeight,
                });
                options.top = position.top;
                options.left = position.left;
            } else {
                if (options.top == null) {
                    options.top =
                        (parent.offsetHeight - win().offsetHeight) / 2;
                }
                if (options.left == null) {
                    options.left =
                        (parent.offsetWidth - win().offsetWidth) / 2;
                }
            }
        }
```

(The saved-rect path above — lines 44-71 with `calc_nudges` — is untouched; the `< 640px` mobile-maximize path is untouched.)

- [ ] **Step 6: Verify by hand**

`npm run dev` (fresh profile or clear IndexedDB + the window-rect keys via DevTools → Application → IndexedDB → delete database): open About Me, then Contact Me, then My CV → each opens 24px down-right of the previous; windows with a saved rect (e.g. reopened My Computer after dragging) restore their rect as before.

- [ ] **Step 7: Run gates and commit**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build && npx playwright test
git add src/lib/cascade.ts src/lib/cascade.test.ts src/lib/components/xp/Window.svelte
git commit -m "feat: cascade rect-less windows 24px down-right with workspace wrap"
```

---

### Task 11: Slice-2 E2E specs

**Files:**
- Create: `e2e/start_menu.spec.ts`
- Create: `e2e/shell.spec.ts`

**Interfaces:**
- Consumes: `bootToDesktop` from `e2e/helpers.ts` (slice 1); DOM ids `#start-menu-btn`, `#start-menu`, `#all-programs-flyout`; placeholder copy `"{Name} is under construction — coming in a later phase."`; dialog copy from Task 8.

- [ ] **Step 1: Create `e2e/start_menu.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

test('start menu matches the §3.4 structure', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#start-menu-btn').click();
    const menu = page.locator('#start-menu');
    await expect(menu).toBeVisible();

    // identity header
    await expect(menu.getByText('Mohamed Abdelnasser')).toBeVisible();
    // pinned column
    await expect(menu.getByText('Internet Explorer')).toBeVisible();
    await expect(menu.getByText('Contact Me').first()).toBeVisible();
    // right column
    await expect(menu.getByText('My Computer').first()).toBeVisible();
    await expect(menu.getByText('My CV')).toBeVisible();
    await expect(menu.getByText('About Me').first()).toBeVisible();

    // socials are real external links (new tab + noopener)
    const github = menu.locator('a[href="https://github.com/Momad-Y"]');
    await expect(github).toBeVisible();
    await expect(github).toHaveAttribute('target', '_blank');
    await expect(github).toHaveAttribute('rel', /noopener/);
    await expect(
        menu.locator(
            'a[href="https://www.linkedin.com/in/mohamed-y-abdelnasser/"]',
        ),
    ).toBeVisible();
    await expect(
        menu.locator('a[href="https://instagram.com/7.zsjj"]'),
    ).toBeVisible();

    // gone per design decision 7
    await expect(menu.getByText('Log Off')).toHaveCount(0);
    await expect(menu.getByText('Display Properties')).toHaveCount(0);
    await expect(menu.getByText('Search')).toHaveCount(0);
});

test('All Programs flyout lists the programs and the Games flyout', async ({
    page,
}) => {
    await bootToDesktop(page);
    await page.locator('#start-menu-btn').click();
    await page.locator('#start-menu').getByText('All Programs').hover();

    const flyout = page.locator('#all-programs-flyout');
    await expect(flyout).toBeVisible();
    for (const label of [
        'My Computer',
        'About Me',
        'Command Prompt',
        'Python',
        'Paint',
        'Music Player',
        'Games',
    ]) {
        await expect(flyout.getByText(label)).toBeVisible();
    }

    // Games level-2 flyout (opens after the 180ms hover delay)
    await flyout.getByText('Games').hover();
    for (const game of ['Minesweeper', 'Solitaire', 'Chess', 'DOOM']) {
        await expect(flyout.getByText(game)).toBeVisible();
    }
});
```

- [ ] **Step 2: Create `e2e/shell.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';
import { bootToDesktop } from './helpers';

test('About Me desktop icon opens the named placeholder', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'About Me' }).dblclick();

    const win = page.locator('#work-space .window').first();
    await expect(win).toBeVisible();
    await expect(
        win.getByText(
            'About Me is under construction — coming in a later phase.',
        ),
    ).toBeVisible();
    await win.getByText('OK').click();
    await expect(win).toBeHidden();
});

test('two rect-less windows cascade instead of stacking', async ({ page }) => {
    await bootToDesktop(page);
    await page.locator('#work-space p', { hasText: 'About Me' }).dblclick();
    await expect(page.locator('#work-space .window')).toHaveCount(1);
    await page.locator('#work-space p', { hasText: 'Contact Me' }).dblclick();
    await expect(page.locator('#work-space .window')).toHaveCount(2);

    const first = await page
        .locator('#work-space .window')
        .nth(0)
        .boundingBox();
    const second = await page
        .locator('#work-space .window')
        .nth(1)
        .boundingBox();
    if (!first || !second) throw new Error('window has no bounding box');
    // both placeholders share the same size → identical base, so the second
    // sits exactly one 24px cascade step down-right of the first
    expect(Math.round(second.x - first.x)).toBe(24);
    expect(Math.round(second.y - first.y)).toBe(24);
});

test('double-clicking an unassociated file shows the XP dialog', async ({
    page,
}) => {
    await bootToDesktop(page);
    const workspace = page.locator('#work-space');
    await workspace.click({ button: 'right', position: { x: 700, y: 300 } });
    await page.getByText('New', { exact: true }).hover();
    await page.getByText('Text Document', { exact: true }).click();
    // commit the default name (spawns in rename mode; Enter commits, and a
    // plain click elsewhere blurs/commits as a fallback)
    await page.keyboard.press('Enter');
    await workspace.click({ position: { x: 900, y: 500 } });

    await page
        .locator('#work-space p', { hasText: 'New Text Document' })
        .dblclick();
    await expect(
        page.getByText(
            'Windows cannot open this file — no program is associated with it.',
        ),
    ).toBeVisible();
    await page.getByText('OK').click();
});
```

- [ ] **Step 3: Run the E2E suite**

Run: `npx playwright test`
Expected: 10 passed (3 smoke + 2 login + 2 start_menu + 3 shell). If the "New Text Document" flow proves flaky on the rename commit, replace `Enter` + click with only the blur click — the assertion target is the dialog, not the rename.

- [ ] **Step 4: Commit**

```bash
git add e2e/start_menu.spec.ts e2e/shell.spec.ts
git commit -m "test: E2E for start-menu structure, placeholder, cascade, and fallback dialog"
```

---

### Task 12: Touch-drag verification on ≥1024px touch emulation (verify AND patch if needed)

**Files:**
- Possibly create: `static/js/jquery.ui.touch-punch.min.js`
- Possibly modify: `src/app.html:29-32` (script tag after jquery-ui)

- [ ] **Step 1: Verify current behavior**

```bash
npm run dev
npx playwright codegen --device="iPad Pro 11 landscape" http://localhost:3000
```

In the codegen browser (1194×834 → full desktop): boot → login → open My Computer → try dragging the title bar and resizing edges by touch.

- [ ] **Step 2: If drag/resize does NOT work (expected — jQuery UI is mouse-event based), vendor touch-punch**

```bash
curl -sfL https://cdnjs.cloudflare.com/ajax/libs/jqueryui-touch-punch/0.2.3/jquery.ui.touch-punch.min.js -o static/js/jquery.ui.touch-punch.min.js
```

Add to `src/app.html` immediately after the jquery-ui script (line 32):

```html
        <!-- maps touch events onto jQuery UI's mouse handlers so window
             drag/resize works on >=1024px touch devices (§4.6 note) -->
        <script src="/js/jquery.ui.touch-punch.min.js"></script>
```

(Local file — no SRI needed; touch-punch is MIT.)

- [ ] **Step 3: Re-verify with the same codegen device**

Title-bar touch-drag moves the window; edge touch-drag resizes. Record the before/after result — it goes into `docs/phase-1-guide.md` at phase handoff.

- [ ] **Step 4: Run gates and commit**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build && npx playwright test
git add static/js/jquery.ui.touch-punch.min.js src/app.html
git commit -m "fix: enable touch drag/resize for windows via vendored jQuery UI touch-punch"
```

(If Step 1 showed touch drag already works, skip Steps 2-4 and note the verification result for the phase guide instead.)

---

### Task 13: Slice-2 parity loop (§11) + PR

**Files:**
- Create: `design/research/gate1-slice2-start-menu.png`, `gate1-slice2-desktop.png` (+ any fix iterations)

- [ ] **Step 1: Two-browser parity walk (Playwright MCP, 1280×800)**

With `npm run dev` running:
1. Tab A → `http://localhost:3000` booted to desktop; Tab B → `file:///home/momad/Projects/Momads-XP/design/inspiration/my-start-menu.png` and `my-desktop.png`; also https://win32.run for inherited surfaces (window chrome, context menus, taskbar).
2. Screenshot the open start menu → `design/research/gate1-slice2-start-menu.png`; the curated desktop → `design/research/gate1-slice2-desktop.png`.
3. Compare against the mockups; fix gradient/spacing/font deltas in `start_menu.svelte`; tune the Games flyout `top` offset so the L2 panel doesn't clip the taskbar. Iterate to ≥95%.
4. Inherited regression sweep vs win32.run: window drag/resize/min/max/close/focus, taskbar behavior (§3.6), desktop interactions (§4.2 — select, drag-select rectangle, icon context menus), cursors. Plus the new cascade behavior.
5. **Phase-0 criterion re-verified:** desktop right-click → Properties still opens Display Properties and wallpaper switching works (it left the start menu in Task 9).

- [ ] **Step 2: Final gates, push, PR**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build && npx playwright test
git add design/research/
git commit -m "docs: add slice-2 visual parity evidence"
git push -u origin feature/phase-1-slice-2-shell-curation
gh pr create --base dev --title "Phase 1 slice 2: seed curation, placeholder program, start menu, cascade, fallback dialog" --body "$(cat <<'EOF'
## Summary
- Placeholder program (`placeholder.svelte`) + `exe_item` launch channel; multiple instances allowed
- Desktop seed curated by script to §3.5's 5 icons (About Me / My CV / Contact Me → placeholder); Games VFS folder deleted; SEED_VERSION recomputed + new hash-guard unit test
- Start menu restructured per §3.4: identity header, pinned IE + Contact Me, All Programs (incl. Games flyout ×4 named placeholders, Music Player → MPC), right column + social links as new-tab anchors; Log Off + Display Properties removed from the menu
- Window cascade built (24px down-right, workspace wrap) — TDD'd pure calculator + Window.svelte integration
- Unhandled-extension double-click now shows the XP "no association" dialog (replaces dead notepad dispatch)
- Touch drag/resize verified on ≥1024px touch emulation (patched via vendored touch-punch if needed)

## Test plan
- [ ] CI green (check / lint / format / vitest+coverage / build / playwright — 10 E2E)
- [ ] Manual: fresh IndexedDB re-seed shows curated desktop; placeholders open; socials open new tabs
- [ ] Desktop right-click → Properties still reaches Display Properties (Phase-0 criterion)
- [ ] Parity evidence in design/research/gate1-slice2-*.png

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Part 3 — Slice 3: mobile experience

Branch (after slice 1 merged — imports `src/lib/profile.ts`; independent of slice 2):
`git checkout dev && git pull && git checkout -b feature/phase-1-slice-3-mobile`

### Task 14: `decideMode` pure function (TDD)

**Files:**
- Create: `src/lib/mobile.ts`
- Test: `src/lib/mobile.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `export type ViewMode = 'desktop' | 'mobile' | 'rotate'`; `export function decideMode(width: number, height: number): ViewMode`; `export const DESKTOP_MIN_WIDTH = 1024`. Task 16 consumes both.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/mobile.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { decideMode } from './mobile';

describe('decideMode (§4.6 breakpoint table)', () => {
    it('>=1024px width is the full desktop, any orientation', () => {
        expect(decideMode(1280, 800)).toBe('desktop');
        expect(decideMode(1024, 1366)).toBe('desktop'); // portrait tablet at the floor
        expect(decideMode(1024, 500)).toBe('desktop'); // boundary, landscape
    });

    it('<1024px portrait is the mobile portfolio', () => {
        expect(decideMode(390, 844)).toBe('mobile');
        expect(decideMode(1023, 1024)).toBe('mobile');
        expect(decideMode(500, 500)).toBe('mobile'); // square counts as portrait
    });

    it('<1024px landscape is the rotate prompt', () => {
        expect(decideMode(844, 390)).toBe('rotate');
        expect(decideMode(1023, 768)).toBe('rotate');
    });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/mobile.test.ts`
Expected: FAIL — cannot resolve `./mobile`.

- [ ] **Step 3: Create `src/lib/mobile.ts`**

```typescript
/**
 * Viewport-mode decision (§4.6 breakpoint summary):
 *
 * | Viewport  | Orientation | Experience                      |
 * | --------- | ----------- | ------------------------------- |
 * | >= 1024px | Any         | Full XP desktop                 |
 * | <  1024px | Portrait    | Simplified mobile portfolio     |
 * | <  1024px | Landscape   | Prompt to rotate or use desktop |
 *
 * Pure — decided once at load in +page.svelte (design decision 8: mode
 * locking; a booted desktop never live-switches).
 */

export type ViewMode = 'desktop' | 'mobile' | 'rotate';

export const DESKTOP_MIN_WIDTH = 1024;

export function decideMode(width: number, height: number): ViewMode {
    if (width >= DESKTOP_MIN_WIDTH) return 'desktop';
    return height >= width ? 'mobile' : 'rotate';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/mobile.test.ts`
Expected: PASS — 3 tests.

- [ ] **Step 5: Commit**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage
git add src/lib/mobile.ts src/lib/mobile.test.ts
git commit -m "feat: add decideMode viewport-mode function for the mobile branch"
```

---

### Task 15: `MobilePortfolio.svelte` + `RotatePrompt.svelte`

**Files:**
- Create: `src/routes/xp/mobile/MobilePortfolio.svelte` (path per spec §8)
- Create: `src/routes/xp/mobile/RotatePrompt.svelte`

**Interfaces:**
- Consumes: `profile` from `src/lib/profile.ts` (slice 1) — every §4.6 content block reads it; no personal content is hardcoded.
- Produces: two page components consumed by Task 16's `+page.svelte` branch. Neither dispatches `load_page`. No sounds (§4.6: mobile silent by default).

- [ ] **Step 1: Create `src/routes/xp/mobile/MobilePortfolio.svelte`**

Full §4.6 content list: XP title bar "Momad's XP — AI Engineer", avatar + name + tagline, bio summary, expandable About Me / Experience / Projects / Skills / Education sections (XP-styled accordions), action buttons (Download Resume, Contact via mailto, GitHub/LinkedIn/Instagram), desktop footer. Social icons use the interim generic PNG until slice 4's brand components.

```svelte
<script lang="ts">
    import { profile } from '../../../lib/profile';
    import { required } from '../../../lib/types';

    type SectionName =
        | 'About Me'
        | 'Experience'
        | 'Projects'
        | 'Skills'
        | 'Education';

    const sections: SectionName[] = [
        'About Me',
        'Experience',
        'Projects',
        'Skills',
        'Education',
    ];

    let open_section: SectionName | null = null;

    function toggle(section: SectionName) {
        open_section = open_section === section ? null : section;
    }

    function social_url(platform: string): string {
        return required(
            profile.social.find((s) => s.platform === platform),
            `social link ${platform}`,
        ).url;
    }
</script>

<div
    class="absolute inset-0 overflow-y-auto bg-[#5a7edc] font-sans"
    style="-webkit-overflow-scrolling: touch;"
>
    <!-- XP title bar -->
    <div
        class="sticky top-0 z-10 h-8 flex items-center px-2 shrink-0"
        style="background: linear-gradient(rgb(9, 151, 255) 0%, rgb(0, 83, 238) 8%, rgb(0, 80, 238) 40%, rgb(0, 61, 215) 88%, rgb(0, 61, 215) 93%, rgb(0, 66, 235) 95%, rgb(0, 61, 215) 96%, rgb(0, 55, 210) 100%);"
    >
        <img src="/assets/images/xp-logo.png" alt="" class="h-5 mr-2" />
        <span
            class="text-slate-50 text-[13px] font-bold truncate"
            style="text-shadow: 1px 1px 1px rgba(0,0,0,0.5);"
            >Momad's XP — AI Engineer</span
        >
    </div>

    <!-- identity -->
    <div class="flex flex-col items-center text-center px-4 pt-6 pb-4">
        <img
            src={profile.meta.avatar}
            alt={profile.meta.name}
            class="w-24 h-24 rounded border-2 border-white/80 object-cover shadow-lg"
        />
        <h1
            class="mt-3 text-slate-50 text-xl font-bold"
            style="text-shadow: 1px 1px 2px rgba(0,0,0,0.4);"
        >
            {profile.meta.name}
        </h1>
        <p class="text-slate-200 text-xs mt-1">{profile.meta.tagline}</p>
    </div>

    <!-- bio summary (short version) -->
    <div class="mx-3 mb-3 rounded border border-blue-900/40 bg-xp-yellow p-3">
        <p class="text-[12px] text-slate-800 leading-snug">
            {profile.about.bio[0]}
        </p>
    </div>

    <!-- expandable sections -->
    <div class="mx-3 flex flex-col gap-2">
        {#each sections as section (section)}
            <div
                class="rounded border border-blue-900/40 bg-slate-50 overflow-hidden"
            >
                <button
                    class="w-full flex items-center justify-between px-3 py-2 text-left"
                    style="background: linear-gradient(rgb(240, 240, 235), rgb(220, 224, 235));"
                    on:click={() => {
                        toggle(section);
                    }}
                >
                    <span class="text-[13px] font-bold text-blue-900"
                        >{section}</span
                    >
                    <span
                        class="text-blue-900 text-[13px] transition-transform {open_section ===
                        section
                            ? 'rotate-90'
                            : ''}">▸</span
                    >
                </button>

                {#if open_section === section}
                    <div class="p-3 border-t border-blue-900/20">
                        {#if section === 'About Me'}
                            {#each profile.about.bio as paragraph (paragraph)}
                                <p
                                    class="text-[12px] text-slate-800 leading-snug mb-2"
                                >
                                    {paragraph}
                                </p>
                            {/each}
                        {:else if section === 'Experience'}
                            {#each profile.experience as entry (entry.company + entry.period)}
                                <div class="mb-3">
                                    <p
                                        class="text-[12px] font-bold text-slate-900"
                                    >
                                        {entry.role} — {entry.company}
                                    </p>
                                    <p class="text-[11px] text-slate-500">
                                        {entry.period} · {entry.location}
                                    </p>
                                    <ul
                                        class="list-disc ml-4 mt-1 text-[11px] text-slate-700"
                                    >
                                        {#each entry.description as bullet (bullet)}
                                            <li class="mb-0.5">{bullet}</li>
                                        {/each}
                                    </ul>
                                </div>
                            {/each}
                        {:else if section === 'Projects'}
                            {#if profile.projects.length === 0}
                                <p class="text-[12px] text-slate-600 italic">
                                    Projects are coming soon — check back
                                    shortly.
                                </p>
                            {:else}
                                {#each profile.projects as project (project.name)}
                                    <div class="mb-3">
                                        <p
                                            class="text-[12px] font-bold text-slate-900"
                                        >
                                            {project.name}
                                        </p>
                                        <p
                                            class="text-[11px] text-slate-700"
                                        >
                                            {project.description}
                                        </p>
                                    </div>
                                {/each}
                            {/if}
                        {:else if section === 'Skills'}
                            {#each Object.entries(profile.skills) as [group, items] (group)}
                                <div class="mb-2">
                                    <p
                                        class="text-[12px] font-bold text-slate-900 mb-1"
                                    >
                                        {group}
                                    </p>
                                    <div class="flex flex-wrap gap-1">
                                        {#each items as skill (skill)}
                                            <span
                                                class="text-[10px] px-2 py-0.5 rounded-full border border-blue-700/40 bg-blue-100 text-blue-900"
                                                >{skill}</span
                                            >
                                        {/each}
                                    </div>
                                </div>
                            {/each}
                        {:else}
                            {#each profile.education as entry (entry.institution)}
                                <div class="mb-3">
                                    <p
                                        class="text-[12px] font-bold text-slate-900"
                                    >
                                        {entry.institution}
                                    </p>
                                    <p class="text-[11px] text-slate-700">
                                        {entry.degree}
                                    </p>
                                    <p class="text-[11px] text-slate-500">
                                        {entry.period}{entry.honors != null
                                            ? ` · ${entry.honors}`
                                            : ''}
                                    </p>
                                </div>
                            {/each}
                        {/if}
                    </div>
                {/if}
            </div>
        {/each}
    </div>

    <!-- action buttons -->
    <div class="mx-3 mt-4 flex flex-col gap-2">
        <a href={profile.meta.resumePdf} download class="xp-btn"
            >Download Resume</a
        >
        <a href="mailto:{profile.meta.email}" class="xp-btn">Contact Me</a>
        <div class="flex flex-row gap-2">
            <a
                href={social_url('GitHub')}
                target="_blank"
                rel="noopener noreferrer"
                class="xp-btn grow">GitHub</a
            >
            <a
                href={social_url('LinkedIn')}
                target="_blank"
                rel="noopener noreferrer"
                class="xp-btn grow">LinkedIn</a
            >
            <a
                href={social_url('Instagram')}
                target="_blank"
                rel="noopener noreferrer"
                class="xp-btn grow">Instagram</a
            >
        </div>
    </div>

    <!-- footer -->
    <div
        class="flex flex-row items-center justify-center gap-2 py-6 text-slate-200 text-[11px]"
    >
        <div
            class="w-4 h-4 bg-[url(/images/xp/icons/Desktop.png)] bg-contain bg-no-repeat"
        ></div>
        <span>For the full experience, visit on desktop</span>
    </div>
</div>

<style>
    .xp-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px 12px;
        font-size: 12px;
        color: #0f172a;
        text-decoration: none;
        text-align: center;
        background: linear-gradient(#fefefe, #e8e8e4);
        border: 1px solid #003c74;
        border-radius: 3px;
        box-shadow: inset -1px -1px 1px #d8d8d0;
    }
    .xp-btn:active {
        background: linear-gradient(#e0e0da, #efefea);
    }
</style>
```

- [ ] **Step 2: Create `src/routes/xp/mobile/RotatePrompt.svelte`**

```svelte
<div
    class="absolute inset-0 bg-[#00309c] flex flex-col items-center justify-center text-center p-8 font-sans"
>
    <img src="/assets/images/xp-logo.png" alt="" class="w-16 mb-4" />
    <p
        class="text-slate-50 text-lg font-bold mb-2"
        style="text-shadow: 1px 1px 2px rgba(0,0,0,0.5);"
    >
        Momad's XP
    </p>
    <p class="text-slate-200 text-sm max-w-[420px]">
        Rotate to portrait for the mobile experience, or visit on a desktop
        for the full XP experience.
    </p>
</div>
```

- [ ] **Step 3: Commit (components are wired in Task 16; they compile standalone)**

```bash
npm run check && npm run lint && npm run format:check
git add src/routes/xp/mobile/MobilePortfolio.svelte src/routes/xp/mobile/RotatePrompt.svelte
git commit -m "feat: add mobile portrait portfolio and rotate prompt components"
```

---

### Task 16: Viewport branch in `+page.svelte` with mode locking

**Files:**
- Modify: `src/routes/+page.svelte` (whole script; the markup keeps `svelte:head` + `svelte:component`)

**Interfaces:**
- Consumes: `decideMode`/`ViewMode` (Task 14), `MobilePortfolio.svelte`/`RotatePrompt.svelte` (Task 15).
- Produces: the final `PageComponent` union — later phases extend it, so it must stay exhaustive: `Starting | Login | Desktop | Shutdown | Blackout | MobilePortfolio | RotatePrompt`.

- [ ] **Step 1: Rewrite the `+page.svelte` script**

Replace the whole `<script lang="ts">` block with (markup below it unchanged):

```svelte
<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import type { LoadPageEvent } from '../lib/types';
    import { decideMode } from '../lib/mobile';
    /* eslint-disable @typescript-eslint/no-duplicate-type-constituents -- eslint's TS service resolves .svelte imports as `any`, so the union members look identical to it; svelte-check types them precisely */
    import type Starting from './xp/starting.svelte';
    import type Login from './xp/login.svelte';
    import type Desktop from './xp/desktop.svelte';
    import type Shutdown from './xp/shutdown.svelte';
    import type Blackout from './xp/blackout.svelte';
    import type MobilePortfolio from './xp/mobile/MobilePortfolio.svelte';
    import type RotatePrompt from './xp/mobile/RotatePrompt.svelte';

    type PageComponent =
        | typeof Starting
        | typeof Login
        | typeof Desktop
        | typeof Shutdown
        | typeof Blackout
        | typeof MobilePortfolio
        | typeof RotatePrompt;
    /* eslint-enable @typescript-eslint/no-duplicate-type-constituents */

    let page: PageComponent | undefined = undefined;
    let mobile_locked = false;

    onMount(async () => {
        // §4.6 / design decision 8: the mode is decided ONCE at load. A booted
        // desktop never live-switches (that would destroy shell state); a
        // non-desktop load only reacts portrait ↔ rotate-prompt.
        const mode = decideMode(window.innerWidth, window.innerHeight);
        if (mode === 'desktop') {
            await load_page('./xp/starting.svelte');
            return;
        }
        mobile_locked = true;
        await load_mobile(mode);
        window.addEventListener('resize', on_mobile_resize);
    });

    onDestroy(() => {
        if (mobile_locked && typeof window !== 'undefined') {
            window.removeEventListener('resize', on_mobile_resize);
        }
    });

    function on_mobile_resize() {
        const next = decideMode(window.innerWidth, window.innerHeight);
        // never live-switch into the desktop shell: a >=1024px landscape
        // rotation after a mobile load gets the rotate/desktop prompt instead
        void load_mobile(next === 'mobile' ? 'mobile' : 'rotate');
    }

    async function load_mobile(mode: 'mobile' | 'rotate') {
        page =
            mode === 'mobile'
                ? (await import('./xp/mobile/MobilePortfolio.svelte')).default
                : (await import('./xp/mobile/RotatePrompt.svelte')).default;
    }

    async function load_page(url: string) {
        //manually import modules cause Vite doesn't support fully dynamic import specifiers
        if (url == './xp/starting.svelte') {
            page = (await import('./xp/starting.svelte')).default;
        } else if (url == './xp/login.svelte') {
            page = (await import('./xp/login.svelte')).default;
        } else if (url == './xp/desktop.svelte') {
            page = (await import('./xp/desktop.svelte')).default;
        } else if (url == './xp/shutdown.svelte') {
            page = (await import('./xp/shutdown.svelte')).default;
        } else if (url == './xp/blackout.svelte') {
            page = (await import('./xp/blackout.svelte')).default;
        } else if (url == './+page.svelte') {
            page = (await import('./xp/starting.svelte')).default;
        }
    }
</script>
```

- [ ] **Step 2: Verify by hand**

`npm run dev` →
- Desktop browser window (≥1024px): boots normally to login/desktop; shrinking the window after boot does NOT switch to mobile.
- DevTools device toolbar, iPhone 12 (390×844), reload: mobile portfolio; all five sections expand with real content; Download Resume link points at the PDF; socials open new tabs.
- Rotate the device emulation (844×390), no reload: rotate prompt appears; rotate back: portfolio returns.
- Landscape reload (844×390): rotate prompt directly.

- [ ] **Step 3: Run gates and commit**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build && npx playwright test
git add src/routes/+page.svelte
git commit -m "feat: branch to mobile portfolio or rotate prompt before the boot chain"
```

---

### Task 17: Mobile E2E + PR

**Files:**
- Create: `e2e/mobile.spec.ts`

**Interfaces:**
- Consumes: the mobile DOM from Task 15 (section buttons with exact labels, `a[download]`).

- [ ] **Step 1: Create `e2e/mobile.spec.ts`**

```typescript
import { test, expect } from '@playwright/test';

test.describe('mobile portrait (390x844)', () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('renders the full-content portfolio', async ({ page }) => {
        await page.goto('/');
        await expect(
            page.getByText("Momad's XP — AI Engineer"),
        ).toBeVisible({ timeout: 15_000 });
        await expect(page.getByText('Mohamed Abdelnasser')).toBeVisible();

        // ≥1 Experience entry
        await page.getByRole('button', { name: 'Experience' }).click();
        await expect(
            page.getByText('AI Engineer — Printerpix'),
        ).toBeVisible();

        // ≥1 Skills group
        await page.getByRole('button', { name: 'Skills' }).click();
        await expect(page.getByText('AI & Machine Learning')).toBeVisible();

        // resume download + socials
        await expect(page.locator('a[download]')).toHaveAttribute(
            'href',
            '/assets/Mohamed_Abdelnasser_Resume.pdf',
        );
        await expect(
            page.locator('a[href="https://github.com/Momad-Y"]'),
        ).toBeVisible();
    });
});

test.describe('mobile landscape (844x390)', () => {
    test.use({ viewport: { width: 844, height: 390 } });

    test('shows the rotate prompt', async ({ page }) => {
        await page.goto('/');
        await expect(
            page.getByText('Rotate to portrait for the mobile experience'),
        ).toBeVisible({ timeout: 15_000 });
        // the desktop shell must NOT have booted
        await expect(page.locator('#start-menu-btn')).toHaveCount(0);
    });
});
```

- [ ] **Step 2: Run the E2E suite**

Run: `npx playwright test`
Expected: 12 passed (10 prior + 2 mobile). Note: mobile specs skip `bootToDesktop` — the mobile branch bypasses the boot chain entirely (§4.6: boot sequence deferred on mobile).

- [ ] **Step 3: Final gates, push, PR**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build && npx playwright test
git add e2e/mobile.spec.ts
git commit -m "test: E2E for mobile portrait portfolio and landscape rotate prompt"
git push -u origin feature/phase-1-slice-3-mobile
gh pr create --base dev --title "Phase 1 slice 3: mobile portrait experience + rotate prompt" --body "$(cat <<'EOF'
## Summary
- Pure `decideMode(width, height)` viewport decision (§4.6 breakpoint table), TDD'd
- `MobilePortfolio.svelte`: full §4.6 content — XP title bar, identity, bio, About/Experience/Projects/Skills/Education accordions, resume download, mailto, socials, desktop footer; all content from profile.ts
- `RotatePrompt.svelte` for <1024px landscape
- Mode locked at load in +page.svelte; live reaction only portrait ↔ rotate-prompt; a booted desktop never live-switches
- No sounds on mobile (silent by default per §4.6); no heavy libs loaded — single static page

## Test plan
- [ ] CI green (check / lint / format / vitest+coverage / build / playwright — 12 E2E)
- [ ] Manual: 390×844 renders all sections; 844×390 prompts to rotate; ≥1024px boots the shell; post-boot window shrink does not switch modes

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Part 4 — Slice 4: carry-overs (FA-Free swap, brand icons, panzoom vendoring, diff-cover)

Branch (after slices 2 and 3 merged — Task 19 touches `start_menu.svelte` and `MobilePortfolio.svelte`):
`git checkout dev && git pull && git checkout -b feature/phase-1-slice-4-carryovers`

### Task 18: Font Awesome Pro → Free glyph swap (7 files / 20 glyph sites)

**Files:**
- Modify: `src/lib/components/SMenu.svelte:36`
- Modify: `src/lib/components/xp/SelectBox.svelte:89`
- Modify: `src/lib/components/xp/ContextMenu.svelte:164,214`
- Modify: `src/lib/components/xp/RButton.svelte:42`
- Modify: `src/routes/xp/programs/image_viewer.svelte:191,202,216,227`
- Modify: `src/routes/xp/programs/media_player_classic.svelte:388,398,420,438,456,474,492,512,532` (9 sites — the whole control bar)
- Modify: `src/routes/xp/programs/my_computer/sidebar.svelte:165,174`

> Line numbers are the `<!--! Font Awesome Pro ...` comment positions at plan time — re-locate with `grep -n "Font Awesome Pro" <file>` before editing. The design brief says "MPC — 11 glyphs"; the actual count in the tree is 9 (verified by `grep -c viewBox`), 20 sites total across the 7 files, which matches the design's own total.

**Glyph → FA Free 6.x solid icon mapping** (identified from each site's path data + usage):

| File:line | Icon name | viewBox |
|---|---|---|
| SMenu.svelte:36 | `caret-right` | 0 0 256 512 |
| ContextMenu.svelte:164 | `caret-right` | 0 0 256 512 |
| ContextMenu.svelte:214 | `circle` (check bullet) | 0 0 512 512 |
| SelectBox.svelte:89 | `chevron-down` | 0 0 512 512 |
| RButton.svelte:42 | `caret-down` | 0 0 320 512 |
| image_viewer:191 | `magnifying-glass-plus` | 0 0 512 512 |
| image_viewer:202 | `magnifying-glass-minus` | 0 0 512 512 |
| image_viewer:216 | `backward` (previous image) | 0 0 512 512 |
| image_viewer:227 | `forward` (next image) | 0 0 512 512 |
| MPC:388 | `play` | 0 0 384 512 |
| MPC:398 | `pause` | 0 0 320 512 |
| MPC:420 | `stop` | 0 0 384 512 |
| MPC:438 | `backward-fast` (rewind 15s) | 0 0 512 512 |
| MPC:456 | `backward` (rewind 5s) | 0 0 512 512 |
| MPC:474 | `forward` (forward 5s) | 0 0 512 512 |
| MPC:492 | `forward-fast` (forward 15s) | 0 0 512 512 |
| MPC:512 | `repeat` (loop) | 0 0 512 512 |
| MPC:532 | `expand` (fullscreen) | 0 0 448 512 |
| sidebar:165 | `angles-down` (collapse) | 0 0 448 512 |
| sidebar:174 | `angles-up` (expand) | 0 0 448 512 |

- [ ] **Step 1: Fetch the FA Free 6.7.2 reference SVGs**

```bash
FA_DIR=/tmp/claude-1000/-home-momad-Projects-Momads-XP/eb9cceba-1df2-4dc0-a19d-a98a19492fdb/scratchpad/fa-free
mkdir -p "$FA_DIR"
for icon in caret-right caret-down chevron-down circle magnifying-glass-plus magnifying-glass-minus backward forward backward-fast forward-fast play pause stop repeat expand angles-up angles-down; do
    curl -sfL "https://raw.githubusercontent.com/FortAwesome/Font-Awesome/6.7.2/svgs/solid/$icon.svg" -o "$FA_DIR/$icon.svg" || echo "MISSING $icon"
done
ls "$FA_DIR" | wc -l
```

Expected: `17` and no `MISSING` lines. (All 17 names ship in Free solid.)

- [ ] **Step 2: Swap every site**

For each of the 20 sites, per the mapping table:
1. Verify the downloaded SVG's `viewBox` matches the site's (they must — mismatches mean the mapping row was misidentified; stop and re-check the icon by its `tooltip`/handler context before editing).
2. Replace the site's license comment with the Free one, verbatim:
   `<!--! Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License) Copyright 2024 Fonticons, Inc. -->`
3. Replace the `<path d="...">` data with the `d` from the downloaded SVG. (For most of these icons the Free path is byte-identical to the inlined Pro path — the diff is then comment-only; that is expected and still required, because the Pro license header is the violation.)

Everything else at each site (classes, viewBox, event handlers, `{#if}` structure) stays untouched.

- [ ] **Step 3: Confirm no Pro attribution remains**

```bash
grep -rn "Font Awesome Pro" src/ | wc -l
grep -rn "Font Awesome Free" src/ | wc -l
```

Expected: `0` then `20`.

- [ ] **Step 4: Visual spot check**

`npm run dev` → context menu carets render (right-click desktop → New ▸); SelectBox chevron (image viewer's zoom dropdown); My Computer sidebar collapse chevrons; image viewer zoom/prev/next buttons; MPC control bar (Start → All Programs → Music Player): play/pause/stop/±5s/±15s/loop/fullscreen all render at the same size as before. (The dedicated MPC parity pass is Task 22.)

- [ ] **Step 5: Run gates and commit**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build && npx playwright test
git add src/lib/components/SMenu.svelte src/lib/components/xp/SelectBox.svelte src/lib/components/xp/ContextMenu.svelte src/lib/components/xp/RButton.svelte src/routes/xp/programs/image_viewer.svelte src/routes/xp/programs/media_player_classic.svelte src/routes/xp/programs/my_computer/sidebar.svelte
git commit -m "fix: replace Font Awesome Pro glyphs with FA Free equivalents (license compliance)"
```

---

### Task 19: Social brand icon components (FA Free brands) + swap into start menu and mobile

**Files:**
- Create: `src/lib/components/icons/GitHubIcon.svelte`, `src/lib/components/icons/LinkedInIcon.svelte`, `src/lib/components/icons/InstagramIcon.svelte`
- Modify: `src/routes/xp/start_menu.svelte` (the three social entries + the right-column anchor markup from slice-2 Task 9)
- Modify: `src/routes/xp/mobile/MobilePortfolio.svelte` (the three social buttons from slice-3 Task 15)

**Interfaces:**
- Consumes: the interim `InternetShortcut.png` social entries (slice 2) and text-only social buttons (slice 3).
- Produces: `<GitHubIcon size={16} class="..."/>` etc. — each renders an inline FA Free brands SVG with `fill: currentColor`, sized via the `size` prop (default 16).

- [ ] **Step 1: Fetch the three brand SVGs**

```bash
FA_DIR=/tmp/claude-1000/-home-momad-Projects-Momads-XP/eb9cceba-1df2-4dc0-a19d-a98a19492fdb/scratchpad/fa-free
for icon in github linkedin instagram; do
    curl -sfL "https://raw.githubusercontent.com/FortAwesome/Font-Awesome/6.7.2/svgs/brands/$icon.svg" -o "$FA_DIR/brand-$icon.svg" || echo "MISSING $icon"
done
grep -o 'viewBox="[^"]*"' "$FA_DIR"/brand-*.svg
```

Expected viewBoxes: github `0 0 496 512`, instagram `0 0 448 512`, linkedin `0 0 448 512`.

- [ ] **Step 2: Create the three components**

`src/lib/components/icons/GitHubIcon.svelte` (template — the other two are identical except for the viewBox and the `d` you paste from the corresponding downloaded file):

```svelte
<script lang="ts">
    export let size = 16;
    let klass = '';
    export { klass as class };
</script>

<svg
    class={klass}
    width={size}
    height={size}
    style="fill: currentColor;"
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 496 512"
    ><!--! Font Awesome Free 6.7.2 by @fontawesome - https://fontawesome.com License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License) Copyright 2024 Fonticons, Inc. --><path
        d="PASTE_D_FROM_brand-github.svg"
    /></svg
>
```

`LinkedInIcon.svelte`: viewBox `0 0 448 512`, `d` from `brand-linkedin.svg`.
`InstagramIcon.svelte`: viewBox `0 0 448 512`, `d` from `brand-instagram.svg`.

(`PASTE_D_FROM_*.svg` means the literal `d="..."` attribute value of the file fetched in Step 1 — it is machine-generated path data, several KB long, and must be pasted exactly, not retyped.)

- [ ] **Step 3: Swap into the start menu**

`src/routes/xp/start_menu.svelte`:

1. Add imports:

```typescript
    import GitHubIcon from '../../lib/components/icons/GitHubIcon.svelte';
    import LinkedInIcon from '../../lib/components/icons/LinkedInIcon.svelte';
    import InstagramIcon from '../../lib/components/icons/InstagramIcon.svelte';
```

2. Extend `StartMenuItem` with a component slot and use it on the three social entries (replacing the interim `icon: '/images/xp/icons/InternetShortcut.png'`):

```typescript
        /** Inline icon component (FA brands) — takes precedence over `icon`. */
        icon_component?: typeof GitHubIcon;
```

```typescript
        {
            name: 'GitHub',
            icon: '',
            icon_component: GitHubIcon,
            href: social_url('GitHub'),
        },
        {
            name: 'LinkedIn',
            icon: '',
            icon_component: LinkedInIcon,
            href: social_url('LinkedIn'),
        },
        {
            name: 'Instagram',
            icon: '',
            icon_component: InstagramIcon,
            href: social_url('Instagram'),
        },
```

3. In the right-column anchor branch (Task 9's `{:else if item.href != null}` block), replace the icon `<div>` with:

```svelte
                        {#if item.icon_component != null}
                            <span
                                class="w-7 h-7 mr-1 flex items-center justify-center text-slate-700 group-hover/c2:text-white"
                            >
                                <svelte:component
                                    this={item.icon_component}
                                    size={18}
                                />
                            </span>
                        {:else}
                            <div
                                class="w-7 h-7 bg-contain mr-1"
                                style:background-image="url({item.icon})"
                            ></div>
                        {/if}
```

- [ ] **Step 4: Swap into the mobile portfolio**

`src/routes/xp/mobile/MobilePortfolio.svelte` — add the same three imports, then give each social anchor its icon:

```svelte
            <a
                href={social_url('GitHub')}
                target="_blank"
                rel="noopener noreferrer"
                class="xp-btn grow gap-1"><GitHubIcon size={14} /> GitHub</a
            >
            <a
                href={social_url('LinkedIn')}
                target="_blank"
                rel="noopener noreferrer"
                class="xp-btn grow gap-1"
                ><LinkedInIcon size={14} /> LinkedIn</a
            >
            <a
                href={social_url('Instagram')}
                target="_blank"
                rel="noopener noreferrer"
                class="xp-btn grow gap-1"
                ><InstagramIcon size={14} /> Instagram</a
            >
```

- [ ] **Step 5: Verify by hand + run gates + commit**

Start menu socials show the brand glyphs (turning white on hover); mobile buttons show them inline. E2E from slices 2/3 still pass (they assert `href`s, which are unchanged).

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build && npx playwright test
git add src/lib/components/icons/ src/routes/xp/start_menu.svelte src/routes/xp/mobile/MobilePortfolio.svelte
git commit -m "feat: add FA Free brand icon components for GitHub/LinkedIn/Instagram"
```

---

### Task 20: Vendor panzoom locally (drop the unpkg runtime dependency)

**Files:**
- Create: `static/js/panzoom.min.js`
- Modify: `src/routes/xp/desktop.svelte:64-68`

- [ ] **Step 1: Vendor the exact pinned version**

```bash
mkdir -p static/js
curl -sfL "https://unpkg.com/panzoom@9.4.0/dist/panzoom.min.js" -o static/js/panzoom.min.js
head -c 200 static/js/panzoom.min.js
```

Expected: minified JS starting with a banner/IIFE (not an HTML error page).

- [ ] **Step 2: Point the loader at it**

`src/routes/xp/desktop.svelte:64-68`:

```typescript
        //load other pure js lib
        // panzoom is vendored (design decision 13) — removes the unpkg runtime
        // dependency; consumer is the kept image_viewer. The Google Charts
        // loader stays CDN WITHOUT SRI: it fetches submodules dynamically, so
        // SRI is infeasible — accepted; sole consumer is disk_properties.
        loadjs(['https://www.gstatic.com/charts/loader.js', '/js/panzoom.min.js']);
```

- [ ] **Step 3: Verify by hand**

`npm run dev` → My Computer → C: → Pictures (any seeded image) → image viewer opens → mouse-wheel/pinch zoom and pan work (panzoom is live); DevTools Network shows `/js/panzoom.min.js` served locally and no unpkg request.

- [ ] **Step 4: Run gates and commit**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build && npx playwright test
git add static/js/panzoom.min.js src/routes/xp/desktop.svelte
git commit -m "chore: vendor panzoom 9.4.0 locally, dropping the unpkg runtime dependency"
```

---

### Task 21: Coverage ratchet — lcov reporter, widened include, diff-cover in CI

**Files:**
- Modify: `vitest.config.ts` (whole file)
- Modify: `.github/workflows/ci.yml:12` (fetch-depth) and after the vitest step (new diff-cover step)

> Mechanism note (sanctioned by phase-0-guide §10: "Phase 1 **switches** to diff-based patch coverage"): the Phase-0 glob thresholds (80% on `seed.ts` only) are **replaced** by the diff-cover gate. Keeping global 80% thresholds while widening `include` to all of `src/**/*.ts` would instantly fail CI on the untested inherited modules (`system.ts`, `utils.ts`, `fs.ts`, …) — the ratchet gates **changed lines** instead.

- [ ] **Step 1: Rewrite `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['src/**/*.test.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'lcov'],
            // Phase 1 ratchet (design decision 10): every typed module is
            // instrumented; the gate is diff-cover in CI (>=80% on changed
            // lines vs origin/dev). `.svelte` components are deliberately
            // exempt from line coverage — they are owned by the Playwright
            // E2E suite. Phase 0's glob thresholds retire with this switch
            // (phase-0-guide §10).
            include: ['src/**/*.ts'],
            exclude: ['src/**/*.test.ts', 'src/**/*.d.ts'],
        },
    },
});
```

- [ ] **Step 2: Verify locally**

```bash
npx vitest run --coverage
ls coverage/lcov.info
```

Expected: all unit suites pass; the text report now lists every `src/**/*.ts` module (untested inherited ones at low/0%); `coverage/lcov.info` exists. No threshold failure.

```bash
python3 -m pip install --user diff-cover 2>/dev/null || pipx install diff-cover
git fetch origin dev
diff-cover coverage/lcov.info --compare-branch origin/dev --fail-under 80
```

Expected: reports coverage on this branch's changed `.ts` lines (vitest.config.ts is outside `src/` instrumentation → "No lines with coverage information in this diff" is a pass).

- [ ] **Step 3: Wire CI**

`.github/workflows/ci.yml` — two edits:

1. The checkout step gains full history (diff-cover needs the `origin/dev` merge base):

```yaml
            - uses: actions/checkout@v4
              with:
                  fetch-depth: 0
```

2. Insert after the "Unit tests (coverage-gated)" step, before "Production build":

```yaml
            - name: Diff coverage vs dev (>=80% on changed lines, PRs only)
              if: github.event_name == 'pull_request'
              run: |
                  python3 -m pip install --quiet diff-cover
                  diff-cover coverage/lcov.info --compare-branch origin/dev --fail-under 80
```

(python3 is preinstalled on ubuntu-latest; the diff-cover package is not — hence the install. On pushes to dev/main the diff vs origin/dev is empty, so the step is PR-only.)

- [ ] **Step 4: Run gates and commit**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build && npx playwright test
git add vitest.config.ts .github/workflows/ci.yml
git commit -m "ci: switch coverage gate to diff-cover (80% on changed lines vs dev)"
```

---

### Task 22: Slice-4 parity loop (MPC control bar + swapped glyph surfaces) + PR

**Files:**
- Create: `design/research/gate1-slice4-mpc-controls.png`, `gate1-slice4-image-viewer.png`, `gate1-slice4-start-menu-socials.png`

- [ ] **Step 1: Dedicated MPC control-bar parity pass (design decision 9)**

With `npm run dev` running, Playwright MCP at 1280×800:
1. Tab A → local: boot → Start → All Programs → Music Player → screenshot the MPC window's control bar → `design/research/gate1-slice4-mpc-controls.png`.
2. Tab B → https://win32.run → open Media Player Classic the same way → screenshot its control bar.
3. Compare glyph-by-glyph: play/pause/stop/±5s/±15s/loop/fullscreen — same visual size, alignment, and disabled-state color as the reference. Fix any size/alignment drift (adjust nothing but the `d`/classes at the affected site). Iterate to ≥95%.
4. Repeat for the image viewer toolbar (zoom ± / prev / next) and the My Computer sidebar chevrons vs win32.run → `gate1-slice4-image-viewer.png`.
5. Screenshot the start menu's social rows with the brand icons → `gate1-slice4-start-menu-socials.png` (comparison target: `design/inspiration/my-start-menu.png`).

- [ ] **Step 2: Final gates, push, PR**

```bash
npm run check && npm run lint && npm run format:check && npx vitest run --coverage && npm run build && npx playwright test
git add design/research/
git commit -m "docs: add slice-4 visual parity evidence (MPC control bar, glyph surfaces)"
git push -u origin feature/phase-1-slice-4-carryovers
gh pr create --base dev --title "Phase 1 slice 4: FA-Free swap, brand icons, panzoom vendoring, diff-cover CI" --body "$(cat <<'EOF'
## Summary
- All 20 inlined Font Awesome **Pro** glyph sites across 7 files replaced with FA **Free** 6.7.2 equivalents (license compliance; Phase-0 red-team must-do)
- New inline FA Free *brands* icon components (GitHub/LinkedIn/Instagram) wired into the start menu socials and mobile buttons
- panzoom 9.4.0 vendored to static/js (unpkg runtime dependency removed); Google Charts loader stays CDN without SRI (dynamic submodules — documented acceptance)
- Coverage ratchet: vitest lcov reporter + include widened to src/**/*.ts (svelte exempt, owned by E2E); CI gates PRs with diff-cover >=80% on changed lines vs origin/dev (fetch-depth 0)

## Test plan
- [ ] CI green incl. the new diff-cover step on this PR
- [ ] MPC control bar parity evidence in design/research/gate1-slice4-*.png
- [ ] Manual: image viewer zoom/pan works from the vendored panzoom; no unpkg request in the Network tab

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# After slice 4 (outside this plan's PRs)

Per §11 the phase is not done at the last merge: gate 6 (red-team of the implementation diff) runs next, then `docs/phase-1-guide.md` is written (10 sections per §11, including the touch-drag verification result from Task 12 and all `design/research/gate1-*` parity evidence), ending with the literal statement **"Phase 1 is complete."** — followed by the `dev` → `main` cutover. Those steps belong to the phase workflow, not to a PR slice, and are intentionally not tasks here.

# Design deviations & ambiguities surfaced while planning (resolved as stated, flagged for review)

1. **`exe_item` vs the design's "gains `fs_item`" (decision 5):** passing the executable's own item as `fs_item` would make the desktop My Computer icon open the `.exe` as a folder (work_space's my_computer branch consumes `fs_item` as the target folder). A new `exe_item` field carries the identity channel instead — same capability, no regression. (Task 6.)
2. **Socials as `<a target="_blank" rel="noopener noreferrer">` instead of `window.open(...,'noopener')`:** identical navigation semantics, declaratively testable (the design's own E2E list asserts social `href`s, which only exist on anchors). (Task 9.)
3. **"Shut Down" placement:** §3.4 lists Shut Down at the end of the right column; the XP-faithful location (and the base's existing flow) is the bottom bar's "Turn Off Computer" button. Kept in the bottom bar, Log Off removed, per design decision 7's "existing flow". (Task 9.)
4. **Interim social icons in slices 2–3:** the task slicing puts the FA-brands components in slice 4, but the start menu (slice 2) and mobile (slice 3) render socials earlier — they ship with a generic PNG / text-only until slice 4 swaps the brand components in. (Tasks 9, 15, 19.)
5. **MPC glyph count:** design says "11 glyphs"; the tree has 9 in MPC (20 total across 7 files, matching the design's own file/total scope). Plan follows the tree. (Task 18.)
6. **Coverage thresholds removed with the include widening (decision 10):** global 80% thresholds + `src/**/*.ts` include would fail CI on untested inherited modules; phase-0-guide §10 explicitly frames Phase 1 as *switching* to diff-based patch coverage. (Task 21.)
7. **Python start-menu icon:** no Python icon asset exists; interim `/images/xp/icons/ApplicationWindow.png` until Phase 3 ships the real app. (Task 9.)
8. **§7 sample image references (education/awards):** the referenced image files don't exist in `static/assets/images/`; all `images` arrays ship empty in Phase 1 (Phase 2 adds the files with its content apps). (Task 1.)
