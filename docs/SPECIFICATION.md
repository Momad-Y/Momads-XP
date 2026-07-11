# Momad's XP — Specification

> A Windows XP-faithful portfolio website for Mohamed Abdelnasser, AI Engineer.
> Single source of truth for development.

---

## Table of Contents

1. [Vision & Concept](#1-vision--concept)
2. [User Flow & Screens](#2-user-flow--screens)
3. [Desktop Applications](#3-desktop-applications)
4. [UX & Interaction Design](#4-ux--interaction-design)
5. [Tech Stack](#5-tech-stack)
6. [Architecture](#6-architecture)
7. [Data Model](#7-data-model)
8. [File Structure](#8-file-structure)
9. [Implementation Phases](#9-implementation-phases)
10. [Assets & Resources](#10-assets--resources)
11. [Phase Handoff & Visual Parity](#11-phase-handoff--visual-parity)

---

## 1. Vision & Concept

**Momad's XP** is a personal portfolio website that faithfully recreates the Windows XP operating system in the browser. It is not a parody or novelty — it is a fully interactive desktop environment used as a medium to present Mohamed Abdelnasser's work as an AI Engineer.

**Core principles:**

- Pixel-accurate XP UI — every window, button, icon, and UI element looks **and behaves** exactly like the real OS
- Authentic motion — every animation (boot, window open/close/minimize, menus, hover states) matches XP's exact timing and feel
- Authentic audio — startup music, logon/logoff, errors, clicks: all SFX are the real XP sounds
- Functional applications — apps do real things (send emails, run a chatbot, play games)
- Data-driven content — all personal data lives in a single JSON file; zero hardcoded content in components
- Performance-first — lazy loading, code splitting, asset preloading; fast on modern hardware
- Desktop-focused — primary experience targets 1280x720+; mobile gets a simplified fallback
- Proven base — built on [win32.run.cf](https://github.com/ducbao414/win32.run.cf) (MIT), the author-refactored Svelte 5 build of [win32.run](https://win32.run), stripped and rebranded in Phase 0 rather than rebuilding the XP shell from scratch

**Positioning:** Mohamed Abdelnasser — AI Engineer | Automation Systems | Robotics | RoboCup @Home Champion. Based in Dubai, UAE. B.Sc. in AI (Intelligent Systems, Excellent with Honors) from AAST.

---

## 2. User Flow & Screens

The website loads through four sequential screens that mimic a real XP boot, then lands on the interactive desktop.

### 2.1 Boot / Loading Screen

- Black background with the Windows XP logo (modified to read "Momad's XP" / "AI Engineer")
- Animated progress bar (the classic blue segmented bar)
- "For the best experience, Enter Full Screen (F11)" hint at bottom-left
- "Portfolio" watermark at bottom-right
- Asset preloading happens during this screen (fonts, critical images, sounds)
- Duration: ~3-4 seconds (or until assets are loaded, whichever is longer)
- Click anywhere or press any key to skip
- The site starts **directly at this screen** — the base repo's BIOS/boot-device menu and Win95/DOS installation flows are pruned in Phase 0

### 2.2 User Login Screen

- Blue gradient background matching XP's login screen
- Left side: "Momad's XP / AI Engineer" branding with XP logo
- Center: "To begin, click on Mohamed to log in"
- Right side: User avatar card — Mohamed's photo, name, title "AI Engineer"
- Bottom-left: "Restart Momad's XP" button (reloads the page)
- Bottom-right: Flavor text — "After you log on, the system is yours to explore. Every detail has been designed with a purpose."
- Clicking the user card triggers the welcome transition

> Note: the base repo has **no login screen** (its flow is BIOS → loading → desktop, with a welcome splash on the desktop). This screen is built new in Phase 1, styled against XP's real login screen and the mockups in `design/inspiration/my-users.png`.

### 2.3 Welcome Screen

- Blue gradient background (lighter blue, matching XP's actual welcome screen)
- Center: "welcome" text in white italic (XP's exact font and positioning)
- Duration: ~1.5 seconds, auto-advances to desktop
- Fade-out transition

### 2.4 Desktop

- Full-viewport interactive desktop
- Bliss wallpaper background (the iconic green hills)
- Desktop icon grid (left-aligned, top-to-bottom then left-to-right)
- Taskbar pinned to bottom
- All applications launch from here

### Screen Transitions

| From    | To      | Transition                                |
| ------- | ------- | ----------------------------------------- |
| Boot    | Login   | Fade out boot, fade in login (~500ms)     |
| Login   | Welcome | Slide/fade transition (~400ms)            |
| Welcome | Desktop | Fade out welcome, reveal desktop (~600ms) |

All transitions should use CSS animations (no JS-driven frame loops). The XP startup sound plays at the Login → Welcome transition.

---

## 3. Desktop Applications

### 3.1 System & Portfolio Apps

#### My Computer (File Explorer)

- Opens an XP-style Explorer window with folder tree on the left and content area on the right
- Top: menu bar (File, Edit, View, Favorites, Tools, Help) — decorative
- Navigation toolbar: Back, Forward, Up, Address bar
- Left panel: folder tree with expandable nodes
- Folder structure maps to resume sections:

```
My Computer
├── Experience/
│   ├── Printerpix — AI Engineer
│   ├── Udacity — Session Lead
│   ├── Robotics Club AASTMT — VP of Software Development
│   ├── Corporatica — NLP Intern
│   ├── RoboCup Federation — AI & Robotics Engineer
│   └── Mentorness — ML Intern
├── Projects/
│   ├── [Project entries from JSON]
│   └── ...
├── Education/
│   ├── AAST — B.Sc. Artificial Intelligence
│   └── Al Ma'arifa International Private School
├── Skills/
│   ├── AI & Machine Learning
│   ├── NLP & LLMs
│   ├── Robotics & Automation
│   ├── Data Engineering
│   └── Software Development
├── Certifications/
│   └── [List from JSON]
└── Awards/
    ├── 1st Place — RoboCup @Home (Egypt)
    ├── 3rd Place — RoboCup @Home (Netherlands)
    └── ...
```

- Clicking a folder shows its contents as XP file/folder icons in the right panel
- Clicking a file (experience entry, project, etc.) opens a detail view within the explorer window or in a new window

**Image & media support per entry:**

Each file (experience, education, award, project, certification) can have associated images and/or GIFs defined in `profile.json`. These are rendered in the detail view when a file is opened.

Examples:

- **Education → AAST**: Diploma photo, graduation project presentation photo
- **Awards → RoboCup 1st Place (Egypt)**: Team photo, certificate scan
- **Experience → Printerpix**: Office photo, system dashboard screenshot
- **Certifications → IELTS**: Certificate scan

Images are displayed as a thumbnail gallery or inline within the detail view. Clicking a thumbnail opens a larger preview (XP-style image viewer or lightbox within the explorer window).

All image paths are defined in the JSON data file under each entry's `images` array — no hardcoded paths in components. See the Data Model section for the schema.

#### About Me

- XP Explorer-style window (matches `about-me.png` design reference)
- Left sidebar: Navigation links (Social Links, Skills tree, Software list)
- Main content area: Bio text, avatar/photo, paragraphs about background
- Toolbar: Back, Forward, navigation to "My Projects", "My CV"
- Address bar shows "About Me"
- Content pulled entirely from JSON

#### My CV / Resume

- Desktop icon with PDF icon graphic
- Click opens a new XP window displaying the PDF (rendered with `pdfjs-dist` on canvas inside XP window chrome — a plain `<iframe>` is unreliable on iOS Safari, and the base repo's bundled generic pdf.js viewer is 16MB and styled as Foxit, so a slim custom viewer replaces both)
- Download button in the window toolbar
- The PDF file URL is specified in the JSON data

#### Contact Me (Email Client)

- Window styled as Outlook Express (matches `email.png` design reference)
- Menu bar: File, Edit, View
- Toolbar: Send Message, New Message, Addresses, LinkedIn button
- Form fields: To (pre-filled with Mohamed's email, read-only), From (user input), Subject, Message body
- "Compose a message to Mohamed" helper text
- Sends real emails via a serverless function (Netlify Function `/api/email` + Resend), hardened against abuse per §6.8 (honeypot field, per-IP rate limiting, payload caps)
- Success: XP-style dialog box "Message sent successfully"
- Error: XP-style error dialog

#### Internet Explorer (AI Chatbot)

- Window styled as Internet Explorer 6
- Menu bar, toolbar with navigation buttons, address bar
- Content area is a chat interface
- RAG-based chatbot that answers questions about Mohamed using his portfolio data as context
- Backend: Netlify Function `/api/chat` → **Google Gemini 3 Flash** (`gemini-3-flash`, via the `@google/genai` SDK) with a system prompt containing Mohamed's full profile
- Uses the **free tier** of the Gemini API (rate-limited; sufficient for portfolio traffic)
- The chatbot knows about experience, projects, skills, education, and can answer questions like "What does Mohamed specialize in?" or "Tell me about his RoboCup experience"
- Typing indicator, message bubbles styled to fit within the IE window
- Stretch: address bar shows "Ask me anything about Mohamed..."

### 3.2 Developer / Power User Apps

#### CMD (Terminal)

- Linux-style terminal (bash emulation, not Windows cmd)
- Black background, white/green monospace text
- Title bar: "momad@xp:~"
- Functional terminal powered by xterm.js
- **On startup**, echoes a short intro/help message:
    ```
    Welcome to Momad's XP Terminal
    Type 'help' to see available commands.
    Navigate my portfolio like a filesystem — try 'ls' or 'cd experience'.
    ```
- **Core commands (Phase 3):**
    - `help` — list available commands
    - `about` — print bio
    - `skills` — list skills
    - `experience` — print experience summary
    - `projects` — list projects
    - `contact` — show contact info
    - `social` — list social links
    - `clear` — clear screen
    - `echo [text]` — echo text
    - `date` / `time` — show current date/time
    - `whoami` — prints "momad"
    - `uname -a` — prints fake XP system info
    - Easter eggs: `matrix`, `hack` (fake hacking animation), `sudo` (humorous denial)
- **Filesystem navigation commands (Phase 6 — Polish):**
    - `ls` — list contents of current directory (portfolio sections)
    - `cd [dir]` — navigate into a section (e.g., `cd experience`, `cd projects`)
    - `cd ..` — go up one level
    - `pwd` — print current path (e.g., `/home/momad/experience`)
    - `cat [file]` — display contents of a file (e.g., `cat printerpix` shows that experience entry)
    - Directory structure mirrors the File Explorer folder tree from `profile.json`
- All command output data sourced from JSON

#### Python REPL

- Terminal window with Python branding
- Simulated Python interpreter using Pyodide (CPython 3.13.x — whichever patch the pinned Pyodide release ships), integrated **in-page** — the base repo's "Python REPL" is just an iframe of pyodide.org's hosted console and gets replaced
- Pyodide is loaded from the official CDN at a pinned version (no iframe; self-hosting the multi-MB dist would bloat `static/` for a single app)
- Shows the real `Python 3.13.x` banner (from the running Pyodide) and `>>>` prompt
- Users can write and execute real Python code in the browser
- Pre-loaded greeting: `print("Welcome to Momad's XP")`

#### Paint

- Classic MS Paint recreation
- Canvas with basic tools: pencil, brush, eraser, fill bucket, color picker, shapes (line, rectangle, ellipse), text
- Color palette at the bottom
- Menu bar: File (New, Save as PNG), Edit (Undo, Redo), View
- Implementation: HTML5 Canvas API with a custom toolbar UI styled as XP Paint
- Library option: the base repo already bundles a build of [jspaint](https://github.com/1j01/jspaint) (MIT) at `static/html/jspaint` — it survives the Phase 0 prune; wrap it in XP window chrome, or build a simplified Canvas version

#### Music Player

- Styled as Windows Media Player or Winamp
- Plays a set of royalty-free tracks bundled as local MP3s
    - **Decision:** the Spotify iframe embed exposes no volume control and no access to the audio stream (cross-origin), which makes the controls and visualizer below impossible — local audio is the only option that satisfies the feature list
- Controls: play/pause, next, previous, volume slider, seek bar
- Track list panel
- Visualization: simple waveform or spectrum analyzer (Canvas API + Web Audio `AnalyserNode`)
- Stretch alternative: an additional Spotify Embed mode with a reduced feature set (only the embed's own play/pause/seek)

### 3.3 Games

#### Minesweeper

- Exact XP Minesweeper recreation
- Difficulty levels: Beginner (9x9, 10 mines), Intermediate (16x16, 40), Expert (30x16, 99)
- Timer, mine counter, smiley face button
- Right-click to flag, left-click to reveal
- Implementation: custom Svelte component with grid state management (the base repo's minesweeper is a licenseless third-party embed that loads jQuery from a CDN — pruned in Phase 0 and rebuilt properly)

#### Solitaire (Klondike)

- Classic XP Solitaire with green felt background
- Drag-and-drop cards
- Auto-complete detection
- Win animation (bouncing cards)
- Library option: adopt an MIT-licensed Klondike library integrated as a Svelte component — **no third-party iframes** (the base's own solitaire was a CrazyGames embed, pruned in Phase 0 for exactly that reason)

#### Chess

- Chess board with piece graphics matching classic Windows chess
- Play against a simple AI (chess.js for logic, Stockfish WASM for AI — **single-threaded build by default**: the multithreaded [lichess-org/stockfish.wasm](https://github.com/lichess-org/stockfish.wasm) needs SharedArrayBuffer, i.e. COOP/COEP cross-origin isolation, which breaks the Spotify embed, js-dos assets, and other third-party iframes)
- Or: two-player local mode

#### DOOM

- Embedded DOSBox/js-dos running the shareware WAD
- Fullscreen toggle within the XP window
- Performance note: js-dos runs DOOM 1 shareware at solid FPS in modern browsers

### 3.4 Start Menu

The Start Menu is the primary application launcher. All apps live here; the desktop shows only a curated subset (see 3.5).

**Left column (top section — user identity):**

- User avatar and name at the very top (XP-style header)

**Left column (pinned items):**

- Internet Explorer (AI Chatbot)
- Contact Me (Email)
- Separator

**Left column (All Programs):**

- All Programs → flyout submenu:
    - My Computer
    - About Me
    - Command Prompt
    - Python
    - Paint
    - Music Player
    - Games → flyout submenu:
        - Minesweeper
        - Solitaire
        - Chess
        - DOOM

**Right column:**

- My Computer
- My CV
- About Me
- Contact Me
- Separator
- Social links:
    - GitHub (icon + label)
    - LinkedIn
    - Instagram
- Separator
- Shut Down (shows XP shutdown dialog, then redirects to a "Shutting down..." screen → blank → login screen)

**Note:** Every desktop shortcut also appears in the Start Menu. The Start Menu is the exhaustive list; the desktop is the curated shortcut surface.

### 3.5 Desktop Icons

The desktop is intentionally uncluttered. **Maximum 5 icons in a single column**, arranged top-to-bottom on the left edge. Every desktop icon is a shortcut — it also exists in the Start Menu.

| Icon             | Label             | Action                |
| ---------------- | ----------------- | --------------------- |
| My Computer icon | My Computer       | Opens File Explorer   |
| About Me icon    | About Me          | Opens About Me window |
| CV/PDF icon      | My CV             | Opens PDF viewer      |
| IE icon          | Internet Explorer | Opens AI Chatbot      |
| Outlook icon     | Contact Me        | Opens email client    |

**Additional element (not counted in the 5):**

- Recycle Bin icon — bottom-right corner, decorative or easter egg

All other apps (CMD, Python, Paint, Music Player, Games) are accessible exclusively through the Start Menu. This keeps the desktop clean and focused on the portfolio essentials, matching the feel of a fresh XP install where only system icons are on the desktop.

### 3.6 Taskbar

- Fixed to bottom, full width
- **Start Button:** Green "Start" button with XP flag logo, left-aligned
- **Quick Launch:** Small icons next to Start (optional)
- **Taskbar Items:** One button per open window; active window is highlighted/pressed; clicking toggles minimize
- **System Tray (right side):**
    - Volume icon (clicking opens a volume slider for site sounds)
    - Network icon (decorative)
    - Security shield icon (decorative)
    - Clock showing real local time (format: "1:38 PM")
- **Notification Area:** Occasional XP-style balloon tooltips (e.g., "Your system is protected" on first load — nostalgic touch)

---

## 4. UX & Interaction Design

### 4.1 Window Behavior

Every application window must support:

- **Dragging** — click and drag the title bar to move; constrained to viewport
- **Resizing** — drag edges and corners; minimum size per app
- **Minimize** — animates down to taskbar button
- **Maximize** — fills viewport (minus taskbar); title bar double-click toggles
- **Close** — removes window; animate shrink/fade
- **Focus** — clicking any part of a window brings it to front (highest z-index)
- **Cascade** — new windows open offset from the last opened window (not stacked directly on top)

### 4.2 Desktop Interactions

- **Single-click icon:** Select (highlight with blue selection box)
- **Double-click icon:** Open application
- **Right-click desktop:** Context menu with "Refresh", "Paste", "Properties", separator, "New >"
- **Right-click icon:** Context menu with "Open", "Rename" (decorative), "Properties"
- **Drag select:** Click and drag on empty desktop area draws a blue selection rectangle; icons within are selected
- **Keyboard:** Enter opens selected icon; Delete does nothing (or shows error dialog); Tab cycles icons

### 4.3 Sounds

Sounds are **on by default**, exactly like the real OS. The login-card click (a required user gesture) unlocks audio under browser autoplay policies, so the XP startup sound genuinely plays. The system-tray speaker icon mutes/unmutes and controls volume. Mobile stays silent by default.

| Event                   | Sound                   |
| ----------------------- | ----------------------- |
| Boot → Login transition | XP Startup sound        |
| Open window             | XP "ding" / window open |
| Close window            | XP window close         |
| Error dialog            | XP error/critical stop  |
| Empty Recycle Bin       | XP recycle              |
| Click Start Menu        | XP menu click           |
| Minimize                | Subtle click            |
| Shutdown                | XP Shutdown sound       |
| Login click             | XP logon                |

Sound files: inherited from the base repo's `static/audio` (the full XP sound set, ~5MB total — see §10). Keep any newly added SFX small (compressed MP3/OGG).

### 4.4 Animations

- **Window open:** Scale from 0.95 to 1.0 + opacity 0→1, ~200ms ease-out
- **Window close:** Scale from 1.0 to 0.95 + opacity 1→0, ~150ms ease-in
- **Window minimize:** Animate position + scale toward the corresponding taskbar button, ~300ms
- **Window maximize:** Expand from current position/size to full viewport, ~200ms
- **Start Menu open:** Slide up from taskbar + fade in, ~200ms
- **Start Menu close:** Fade out, ~150ms
- **Context menu:** Instant appear (no animation, matches real XP)
- **Boot progress bar:** Segmented blue blocks sliding left-to-right in loop
- **Welcome text:** Fade in, hold, fade out
- **Hover states:** XP buttons show raised/pressed states via box-shadow changes (no modern transitions — XP was instant)

### 4.5 Cursor

- Default: XP's white arrow cursor
- Over links/buttons: XP hand cursor
- Over text: XP I-beam cursor
- Drag/resize: appropriate resize cursors
- Loading: XP hourglass (shown during boot and heavy operations)

Custom cursor files (`.cur` or `.png`) applied via CSS `cursor: url(...)`.

### 4.6 Mobile Experience

The mobile experience is simplified but still XP-inspired. Two distinct layouts based on orientation.

#### Vertical / Portrait Mode (< 1024px width, portrait orientation)

A condensed, touch-friendly, single-column layout styled with XP aesthetics (blue gradient, XP window chrome, Tahoma font).

**Layout:**

- Top: XP-style title bar reading "Momad's XP — AI Engineer"
- User avatar + name + tagline
- Bio summary (short version from JSON)
- Scrollable list of sections presented as XP-style list items or small window cards:
    - About Me (expandable)
    - Experience (expandable list)
    - Projects (expandable list)
    - Skills (grouped chips)
    - Education
- Action buttons (XP button style):
    - Download Resume (PDF)
    - Contact Me (opens mailto: or a simple form)
    - LinkedIn / GitHub / Instagram icons
- Footer: "For the full experience, visit on desktop" with a small desktop icon

**What's available on mobile (portrait):**

- Full portfolio content (read-only, no window management)
- Contact form or mailto link
- Resume PDF download
- Social links
- About Me, Experience, Projects, Skills, Education — all viewable

**What's deferred on mobile (portrait):**

- Window management (drag, resize, minimize, maximize)
- Desktop icons grid, taskbar, start menu
- Games (DOOM, Minesweeper, Solitaire, Chess)
- CMD terminal, Python REPL
- Paint
- AI Chatbot (IE) — stretch: include a simplified version
- Sound effects (disabled by default on mobile)
- Boot sequence (skip directly to content; optionally show a brief loading animation)

**Performance trade-offs:**

- No lazy-loaded app components — mobile renders a single static page
- No Pyodide, js-dos, xterm.js, or other heavy libraries loaded
- Significantly smaller JS bundle for mobile visitors

#### Horizontal / Landscape Mode (< 1024px width, landscape orientation OR >= 1024px)

- **>= 1024px viewport width (any orientation):** Full desktop XP experience as described in all other sections
- **< 1024px width in landscape:** Show a prompt: "Rotate to portrait for the mobile experience, or visit on a desktop for the full XP experience." This avoids a cramped, unusable half-desktop.

#### Breakpoint Summary

| Viewport  | Orientation | Experience                      |
| --------- | ----------- | ------------------------------- |
| >= 1024px | Any         | Full XP desktop                 |
| < 1024px  | Portrait    | Simplified mobile portfolio     |
| < 1024px  | Landscape   | Prompt to rotate or use desktop |

> Note: >= 1024px **touch** devices (e.g. iPad landscape) get the full desktop — window drag/resize must work through pointer/touch events. The base has no touch support; verify and patch in Phase 1.

---

## 5. Tech Stack

> The stack is inherited from the Phase 0 base repo, [win32.run.cf](https://github.com/ducbao414/win32.run.cf) (MIT) — the original author's SvelteKit 2 / Svelte 5 refactor of win32.run. **Deciding factor:** it ships a working, pixel-faithful XP shell (boot flow, window manager, virtual filesystem, Explorer) that would take months to rebuild in React; adopting its stack costs a framework switch but keeps the head start. (Alternatives weighed in Phase 0's research verdict, §9.)

### Core

| Layer            | Choice                                          | Rationale                                                                                                                                                                                    |
| ---------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework        | **SvelteKit 2 + Svelte 5**                      | Inherited from the base repo; the entire XP shell (window manager, VFS, Explorer, boot flow) is already built with it                                                                          |
| Language         | **TypeScript — strict, no `any`**               | Full conversion of the base in Phase 0: `strict: true` tsconfig, all `src/**/*.js` converted and every component given `lang="ts"`, `svelte-check` clean, ESLint `@typescript-eslint/no-explicit-any` set to `error`. Every module — inherited and new — is fully typed |
| Build Tool       | **Vite 6**                                      | Inherited; fast HMR, native ESM                                                                                                                                                                |
| Styling          | **Tailwind CSS 3 + custom XP component styles** | The base's pixel-accurate XP chrome is hand-built with Tailwind. XP.css is dropped — two styling systems would fight, and the base's fidelity is higher than XP.css's                          |
| State Management | **Svelte 5 runes + stores**                     | Replaces Zustand; the base's window/program state already lives in Svelte stores                                                                                                               |
| Window system    | **Inherited custom window system**              | Replaces react-rnd; the base ships XP-faithful drag, resize, minimize/maximize with correct animations                                                                                         |
| Deployment       | **Netlify**                                     | Free tier; static SvelteKit output (`ssr = false`) via `@sveltejs/adapter-netlify`, with `/api/email` and `/api/chat` endpoints deployed as Netlify Functions                                  |

### Libraries

| Purpose           | Library                                                           | Notes                                                                                                                                                                       |
| ----------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terminal emulator | **xterm.js**                                                      | Full terminal emulator; used by VS Code; supports custom commands (CMD is built new)                                                                                          |
| Python REPL       | **Pyodide**                                                       | CPython 3.13.x in WebAssembly; in-page via pinned official CDN (replaces the base's pyodide.org iframe)                                                                       |
| PDF viewer        | **pdfjs-dist**                                                    | Slim canvas viewer in XP chrome; replaces react-pdf (React-only) and the base's bundled 16MB generic pdf.js viewer                                                            |
| Paint             | **jspaint** ([1j01/jspaint](https://github.com/1j01/jspaint))     | MIT; already bundled by the base at `static/html/jspaint`                                                                                                                     |
| DOOM              | **js-dos**                                                        | DOSBox in the browser; runs shareware DOOM WAD                                                                                                                                |
| Chess logic       | **chess.js**                                                      | Move validation, game state, PGN                                                                                                                                              |
| Chess AI          | **Stockfish WASM (single-threaded build)**                        | The multithreaded [lichess-org/stockfish.wasm](https://github.com/lichess-org/stockfish.wasm) requires SharedArrayBuffer → COOP/COEP isolation, which breaks Spotify/js-dos iframes. Single-threaded is plenty strong for a portfolio; revisit per-route isolation only if needed |
| Email sending     | **Resend** (via Netlify Function)                                 | Simple email API; generous free tier                                                                                                                                          |
| AI chatbot        | **Google Gemini API** — `gemini-3-flash` (via Netlify Function)   | Powers the IE chatbot; RAG over portfolio data; free tier. Evaluate Netlify AI Gateway in Phase 5 (managed key handling — verify model availability first)                     |
| Gemini SDK        | **@google/genai**                                                 | Google's current SDK — `@google/generative-ai` is deprecated                                                                                                                  |
| Music playback    | **Local MP3s + Web Audio API**                                    | Spotify Embed rejected as primary: the iframe exposes no volume control or audio-stream access, killing the visualizer (§3.2); reduced-feature Spotify mode is a stretch item |
| Icons             | Inherited XP icon set (base `static/images`) + `design/` packs    | Base ships a full XP icon set; supplement from the icon packs in `design/`                                                                                                    |
| Fonts             | Inherited Tahoma-family webfonts (base `static/fonts`, ~560KB)    | XP's system fonts, already bundled                                                                                                                                            |

### Dev Tools

> The base repo ships **none** of these (zero tests, no linting). They are added in Phase 0.

| Tool                        | Purpose                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| ESLint + Prettier           | Code quality and formatting (`@typescript-eslint/no-explicit-any: error`)                    |
| Vitest                      | Unit tests for window manager, commands, utilities (80%+ coverage)                           |
| Playwright                  | E2E tests for boot flow, window interactions                                                 |
| Husky + lint-staged         | Pre-commit hooks                                                                             |
| GitHub Actions              | CI — see pipeline below                                                                      |
| Netlify Git integration     | CD — PR deploy previews + production deploys from `main`                                     |

### CI/CD Pipeline

- **CI — GitHub Actions** (`.github/workflows/ci.yml`), on every push and PR:
    1. `npm ci` (Node version pinned, matching `netlify.toml`)
    2. Typecheck: `svelte-check` + `tsc --noEmit` (strict, no `any`)
    3. Lint + format check: ESLint, Prettier
    4. Unit tests: Vitest (80%+ coverage enforced)
    5. E2E: Playwright (boot flow, window interactions)
    6. Production build: `npm run build` must pass
- **CD — Netlify Git integration:** production deploys from `main` **only**; deploy preview for every PR (and optionally a branch deploy for `dev` as a staging URL)
- **Gate:** `main` and `dev` are protected branches requiring all CI checks green — nothing reaches production without passing typecheck, lint, tests, and build

### Branching Model

| Branch      | Role                                                                                       |
| ----------- | ------------------------------------------------------------------------------------------ |
| `main`      | Production. Netlify deploys from here and nowhere else. Only receives cutover merges from `dev` |
| `dev`       | Integration branch — the local default; all day-to-day work happens here                    |
| `feature/*` | One branch per feature/phase task, cut from `dev`, merged back into `dev` via PR (CI-gated) |

**Flow:** work on `feature/*` off `dev` → PR into `dev` (CI must pass) → every now and then, when `dev` is stable and a phase (or meaningful slice) is verified, **cutover**: PR `dev` → `main` → CI green → merge → Netlify deploys production. Hotfixes follow the same path (fix on a branch off `dev`, cutover) unless production is on fire.

---

## 6. Architecture

### 6.1 High-Level Architecture

```
┌──────────────────────────────────────────────────┐
│                   Browser                        │
│  ┌────────────────────────────────────────────┐  │
│  │        SvelteKit SPA (ssr = false)         │  │
│  │  ┌──────────┐  ┌───────────────────────┐   │  │
│  │  │ Boot     │  │   Desktop Shell       │   │  │
│  │  │ Sequence │→ │  ┌──────────────────┐ │   │  │
│  │  │ (Loader, │  │  │ Window Manager   │ │   │  │
│  │  │  Login,  │  │  │ (Svelte stores)  │ │   │  │
│  │  │  Welcome)│  │  │  - open/close    │ │   │  │
│  │  └──────────┘  │  │  - focus/z-index │ │   │  │
│  │                │  │  - minimize/max  │ │   │  │
│  │                │  │  - position/size │ │   │  │
│  │                │  └──────────────────┘ │   │  │
│  │                │  ┌──────────────────┐ │   │  │
│  │                │  │  App Registry    │ │   │  │
│  │                │  │  (lazy-loaded    │ │   │  │
│  │                │  │   components)    │ │   │  │
│  │                │  └──────────────────┘ │   │  │
│  │                │  ┌──────────────────┐ │   │  │
│  │                │  │  Taskbar + Start │ │   │  │
│  │                │  │  + System Tray   │ │   │  │
│  │                │  └──────────────────┘ │   │  │
│  │                └───────────────────────┘   │  │
│  │  ┌──────────────────────────────────────┐  │  │
│  │  │  Data Layer (JSON + IndexedDB VFS)   │  │  │
│  │  │  profile.json → all personal data    │  │  │
│  │  │  VFS seed → virtual filesystem (§6.7)│  │  │
│  │  └──────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌────────────────────────────────────────────┐  │
│  │           Netlify Functions                │  │
│  │  /api/email   — Resend integration         │  │
│  │  /api/chat    — AI chatbot (Gemini 3 Flash)│  │
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### 6.2 Window Manager (inherited, Svelte stores)

The window manager is the core of the application — inherited from the base repo (`src/routes/xp/*` + its stores) and implemented with Svelte stores, fully typed after the Phase 0 TypeScript conversion. It tracks all open windows and provides operations. The contract below is the **target shape**:

```typescript
interface WindowState {
    id: string;
    appId: string; // references AppRegistry
    title: string;
    icon: string; // path to icon
    position: { x: number; y: number };
    size: { width: number; height: number };
    minSize: { width: number; height: number };
    zIndex: number;
    isMinimized: boolean;
    isMaximized: boolean;
    isFocused: boolean;
    // Restored position/size (before maximize)
    preMaximize?: {
        position: { x: number; y: number };
        size: { width: number; height: number };
    };
}

interface WindowManagerStore {
    windows: WindowState[];
    nextZIndex: number;

    openWindow: (appId: string) => void;
    closeWindow: (id: string) => void;
    focusWindow: (id: string) => void;
    minimizeWindow: (id: string) => void;
    maximizeWindow: (id: string) => void;
    restoreWindow: (id: string) => void;
    updatePosition: (id: string, position: { x: number; y: number }) => void;
    updateSize: (id: string, size: { width: number; height: number }) => void;
}
```

**Z-index strategy:** A global counter (`nextZIndex`) increments every time a window is focused. This guarantees correct stacking without needing to reorder arrays.

### 6.3 App Registry

Each application is registered with metadata and a lazy-loaded component.

```typescript
interface AppDefinition {
    id: string;
    title: string;
    icon: string;
    defaultSize: { width: number; height: number };
    minSize: { width: number; height: number };
    component: () => Promise<{ default: Component }>; // lazy dynamic import (Svelte 5)
    singleton?: boolean; // only one instance allowed (e.g., My Computer)
    desktopIcon?: boolean; // show on desktop (max 5 desktop icons)
    startMenu?: boolean; // show in start menu
    startMenuPinned?: boolean; // pinned to top of start menu left column
    startMenuGroup?: string; // group in All Programs submenu (e.g., "Games")
}
```

Apps are registered in a central `appRegistry.ts` file. The window manager references this when opening new windows.

### 6.4 Boot Sequence State Machine

```
LOADING → LOGIN → WELCOME → DESKTOP
   │         │        │         │
   │ assets  │ click   │ timer   │ interactive
   │ loaded  │ user    │ 1.5s    │
   ▼         ▼        ▼         ▼
```

Managed by a simple Svelte store:

```typescript
type BootPhase = "loading" | "login" | "welcome" | "desktop";
```

### 6.5 Sound Manager

A singleton service that preloads audio files and exposes a `play(soundName)` method.

```typescript
const soundManager = {
  init: () => void;         // preload all sounds
  play: (name: SoundName) => void;
  setVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
};
```

Sounds are loaded as `Audio` objects on first user interaction (to comply with browser autoplay policies). The system tray volume icon controls `setMuted` / `setVolume`.

### 6.6 Context Menu System

A global context menu provider that listens for `contextmenu` events and renders a positioned menu.

```typescript
interface ContextMenuItem {
    label: string;
    icon?: string;
    action?: () => void;
    separator?: boolean;
    disabled?: boolean;
    submenu?: ContextMenuItem[];
}
```

Different areas (desktop, icons, taskbar, inside windows) provide different menu items via a context-aware hook.

### 6.7 Profile → Virtual Filesystem (VFS)

The base repo persists a virtual filesystem in IndexedDB (`idb-keyval`): a seed (`static/json/hard_drive.json`) is fetched **once** on first boot, stored, and written back on shutdown — it is never refreshed for returning visitors.

Momad's XP adapts this so all portfolio content stays data-driven:

- A build-time script (`scripts/generate-vfs`) generates the VFS seed from `src/lib/data/profile.json` — the My Computer folder tree (Experience, Projects, Education, Skills, Certifications, Awards) is derived from the JSON, never hand-edited
- The seed carries a `SEED_VERSION` — computed as a **content hash** of the generated seed, so it changes automatically with every content edit (no manual bump to forget); on boot, a version mismatch re-seeds IndexedDB so content updates actually reach returning visitors
- User-created files (Paint drawings, etc.) survive re-seeds where possible; portfolio folders are always replaced by the new seed

### 6.8 API Hardening

`/api/email` and `/api/chat` are **unauthenticated public endpoints** on Netlify's free tier, which has no built-in WAF or rate limiting — a curl loop could drain the Resend quota (sending spam as Mohamed) or the Gemini quota. Minimum protections, implemented in the functions themselves:

- Honeypot field + minimum-fill-time check on the contact form
- Best-effort per-IP token bucket (in-function memory; accepts cold-start resets)
- Strict payload caps (message length, chat history length) and `maxOutputTokens` on Gemini calls
- Origin/Referer check against the production domain (plus `*.netlify.app` deploy-preview origins outside production, so PR previews can test the forms)
- Friendly XP-style error dialogs on 429s
- Both routes export `const prerender = false` — with the app-wide `prerender = true`, adapter-netlify would otherwise emit **no serverless function at all** and `/api/*` would 404 in production
- Note: Netlify free-tier synchronous functions time out at ~10s — verify SSE streaming for `/api/chat` through `@sveltejs/adapter-netlify`. If it fails: the adapter's `edge: true` option is all-or-nothing (no per-route toggle), so the real fallback is a standalone `netlify/edge-functions/chat.ts` intercepting `/api/chat` outside SvelteKit routing (replacing that route's `+server.ts`)

---

## 7. Data Model

All personal content lives in a single `src/lib/data/profile.json`. Components read from this file — never hardcode personal content.

```jsonc
{
    "meta": {
        "name": "Mohamed Abdelnasser",
        "shortName": "Momad",
        "title": "AI Engineer",
        "tagline": "AI Engineer | Automation Systems | Robotics | RoboCup @Home Champion",
        "location": "Dubai, United Arab Emirates",
        "email": "Mohamed.Y.Abdelnasser@gmail.com",
        "phone": "+971503429805",
        "avatar": "/assets/avatar.png",
        "resumePdf": "/assets/Mohamed_Abdelnasser_Resume.pdf",
    },

    "about": {
        "bio": [
            "Hi, I'm Mohamed Abdelnasser, an AI Engineer with a B.Sc. in Artificial Intelligence (Intelligent Systems, Excellent with Honors) from AAST. I build production-ready AI systems, with a strong focus on automation and real-world impact.",
            "I currently work at Printerpix, where I design and deploy AI-powered production systems across 9 international markets. Previously, I worked with Mentorness, Corporatica, and Udacity in research, development, and mentoring roles. I've built AI assistants, NLP pipelines, computer vision systems, and intelligent automations, and I led the AI and robotics stack for RoboCup @Home, earning 1st place nationally and 3rd place internationally.",
        ],
    },

    "social": [
        {
            "platform": "GitHub",
            "url": "https://github.com/GITHUB_USERNAME",
            "icon": "github",
        },
        {
            "platform": "LinkedIn",
            "url": "https://www.linkedin.com/in/mohamed-y-abdelnasser/",
            "icon": "linkedin",
        },
        {
            "platform": "Instagram",
            "url": "https://instagram.com/INSTAGRAM_HANDLE",
            "icon": "instagram",
        },
    ],

    "experience": [
        {
            "company": "Printerpix",
            "role": "AI Engineer",
            "period": "October 2025 – Present",
            "location": "Dubai, United Arab Emirates",
            "description": [
                "Build and maintain AI-powered automated production systems across Printerpix's 9 international markets.",
            ],
            "images": [],
        },
        {
            "company": "Udacity",
            "role": "Session Lead",
            "period": "July 2025 – September 2025",
            "location": "Remote",
            "description": [
                "Led the DECI Summer Cohort (Level 1), delivering 3 weekly live online sessions to 30+ students.",
                "Covered Python, HTML, CSS, fundamentals of AI, and data science, along with introductions to networks, cybersecurity, multimedia, and encoding/decoding.",
                "Mentored students through hands-on projects and activities, achieving an 80%+ graduation rate.",
            ],
            "images": [],
        },
        {
            "company": "Robotics Club — AASTMT",
            "role": "Vice President of Software Development",
            "period": "October 2022 – June 2025",
            "location": "El Alameen, Egypt",
            "description": [
                "Organized RoboCup-inspired line-tracking and CPC-inspired programming competitions.",
                "Conducted sessions teaching Python, C/C++, Competitive Programming, and Arduino to over 300 students.",
                "Attended the 2023 Maker Faire in Cairo representing the Robotics Club.",
            ],
            "images": [],
        },
        {
            "company": "Corporatica",
            "role": "Natural Language Processing Intern",
            "period": "September 2024 – November 2024",
            "location": "Wyoming, USA (Remote)",
            "description": [
                "Optimized LangChain and LangGraph RAG pipelines, improving retrieval efficiency and reducing response time by ~15%.",
                "Developed a LangChain-based ReAct agent with custom and pre-built tools to fix LLM-generated code errors, decreasing failure rates and hallucinations by 20%.",
                "Contributed to all stages of NLP pipelines—pre/post-processing, LLM integration, monitoring, and evaluation.",
            ],
            "images": [],
        },
        {
            "company": "RoboCup Federation",
            "role": "AI & Robotics Engineer",
            "period": "December 2023 – August 2024",
            "location": "Alexandria, Egypt & Eindhoven, Netherlands",
            "description": [
                "Led Team 3arfeen Hollanda to 1st place in the 2024 RoboCup @Home Education Competition (Egypt).",
                "Led Team Wingardium Levioso to 3rd place in the RoboCup @Home Education Major Competition (Netherlands).",
            ],
            "images": [],
        },
        {
            "company": "Mentorness",
            "role": "Machine Learning Intern",
            "period": "April 2024 – May 2024",
            "location": "Ahmedabad, India (Remote)",
            "description": [
                "Built predictive models for disease diagnosis (Anemia, Diabetes, Thalassemia) and stock market forecasting using Scikit-learn, TensorFlow, and PyTorch.",
                "Developed classifiers (Naive Bayes, Random Forest, Logistic Regression) and sequence models (LSTM, GRU).",
                "Compared multiple models and selected top performers (90%+ accuracy) for deployment.",
            ],
            "images": [],
        },
    ],

    "education": [
        {
            "institution": "Arab Academy for Science, Technology and Maritime Transport",
            "degree": "Bachelor's degree, Artificial Intelligence (Intelligent Systems)",
            "period": "October 2021 – July 2025",
            "honors": "Excellent with Honors",
            "images": [
                {
                    "src": "/assets/images/aast-diploma.jpg",
                    "alt": "AAST Diploma",
                },
                {
                    "src": "/assets/images/aast-graduation-project.jpg",
                    "alt": "Graduation project presentation",
                },
            ],
        },
        {
            "institution": "Al Ma'arifa International Private School",
            "degree": "High School Diploma",
            "period": "September 2017 – July 2021",
            "images": [],
        },
    ],

    "skills": {
        "AI & Machine Learning": [
            "TensorFlow",
            "PyTorch",
            "Scikit-learn",
            "Computer Vision",
            "Predictive Modeling",
        ],
        "NLP & LLMs": [
            "LangChain",
            "LangGraph",
            "RAG Pipelines",
            "ReAct Agents",
            "Prompt Engineering",
        ],
        "Robotics & Automation": [
            "ROS",
            "Arduino",
            "RoboCup @Home",
            "Production Automation",
        ],
        "Data Engineering": [
            "Google BigQuery",
            "Microsoft SQL Server",
            "Supabase",
            "ETL Pipelines",
        ],
        "Software Development": [
            "Python",
            "TypeScript",
            "React",
            "Node.js",
            "REST APIs",
        ],
    },

    "awards": [
        {
            "title": "1st Place – RoboCup @Home Education Competition (Egypt)",
            "year": "2024",
            "images": [],
        },
        {
            "title": "3rd Place – RoboCup @Home Education Major Competition (Netherlands)",
            "year": "2024",
            "images": [],
        },
        {
            "title": "Honorary Award – Smart White Cane (AISC), White Cane Conference",
            "year": "",
            "images": [],
        },
        {
            "title": "Certificate of Excellence – Graduation Honors",
            "year": "2025",
            "images": [],
        },
    ],

    "certifications": [
        {
            "title": "Certificate of Achievement – Mentorness Machine Learning Internship",
            "images": [],
        },
        {
            "title": "Certificate of Excellence – Graduation Honors",
            "images": [],
        },
        {
            "title": "3rd Place – RoboCup @Home Education Major Competition (Netherlands)",
            "images": [],
        },
        {
            "title": "Certificate of Participation – RoboCup Junior",
            "images": [],
        },
        {
            "title": "IELTS Academic Certificate",
            "images": [],
        },
    ],

    "projects": [
        // Populate with actual projects — each entry:
        // {
        //   "name": "...",
        //   "description": "...",
        //   "tech": ["..."],
        //   "url": "...",
        //   "images": [{ "src": "/assets/images/...", "alt": "..." }]
        // }
    ],

    "languages": [
        { "language": "Arabic", "level": "Native" },
        { "language": "English", "level": "Full Professional" },
    ],
}
```

**Update flow:** Edit `profile.json` → rebuild/redeploy → all UI reflects changes. No component code changes needed. The build regenerates the VFS seed and bumps `SEED_VERSION` (§6.7), so returning visitors' IndexedDB is re-seeded too.

**Source material:** the profile data (experience, education, etc.) is filled from `docs/Profile.pdf` (LinkedIn export). The resume file referenced by `meta.resumePdf` is copied from it into `static/assets/` in Phase 1 (the mobile layout's Download Resume button needs it).

---

## 8. File Structure

> Inherited from the base repo's SvelteKit layout, extended for Momad's XP. Names marked **(new)** don't exist in the base; everything else is adopted (and possibly renamed) from win32.run.cf. Exact inherited names may shift slightly during Phase 0 — this tree is the target convention, not a promise about upstream internals.

```
.
├── src/
│   ├── routes/
│   │   ├── +layout.svelte / +layout.ts   # ssr = false, prerender (client-only SPA)
│   │   ├── +page.svelte                  # Entry: goes straight to the XP loading screen
│   │   │                                 #  (base's BIOS boot_manager + installation flows pruned)
│   │   ├── api/                          # Netlify Functions (SvelteKit endpoints, new)
│   │   │   │                             #  each exports `prerender = false` (§6.8)
│   │   │   ├── email/+server.ts          # POST /api/email — Resend
│   │   │   └── chat/+server.ts           # POST /api/chat — Gemini 3 Flash via @google/genai
│   │   └── xp/
│   │       ├── starting.svelte           # "Momad's XP" loading screen (inherited, rebranded)
│   │       ├── login.svelte              # (new) XP login screen — §2.2
│   │       ├── welcome.svelte            # Welcome splash (inherited, verify §2.3)
│   │       ├── desktop.svelte            # Desktop shell (inherited)
│   │       ├── task_bar.svelte           # Taskbar (inherited)
│   │       ├── start_menu.svelte         # Start menu (inherited, restructured per §3.4)
│   │       ├── system_tray.svelte        # Clock, volume, tray icons (inherited)
│   │       ├── shutdown.svelte           # Shut Down flow (inherited)
│   │       ├── mobile/                   # (new) portrait-mode simplified portfolio — §4.6
│   │       └── programs/                 # One component (or folder) per app
│   │           ├── my_computer/          # Explorer (inherited, mapped to profile VFS)
│   │           ├── internet_explorer.svelte  # IE chrome (inherited) + chat UI (new)
│   │           ├── about_me.svelte       # (new)
│   │           ├── contact_me.svelte     # (new) Outlook Express-style email form
│   │           ├── pdf_viewer.svelte     # (new) My CV — pdfjs-dist
│   │           ├── cmd.svelte            # (new) xterm.js terminal
│   │           ├── python_repl.svelte    # (new) local Pyodide
│   │           ├── paint.svelte          # jspaint wrapper (inherited)
│   │           ├── image_viewer.svelte   # (inherited)
│   │           ├── music_player.svelte   # (new/adapted) Spotify embed or local tracks
│   │           ├── minesweeper.svelte    # (new) custom implementation
│   │           ├── solitaire.svelte      # (new)
│   │           ├── chess.svelte          # (new) chess.js + Stockfish
│   │           └── doom.svelte           # (new) js-dos
│   └── lib/
│       ├── components/xp/                # Inherited XP widgets (Window, TitleBar, Dialog,
│       │                                 #  ContextMenu, Menu, Button, TrayIcon, ...)
│       ├── stores/                       # Window manager, boot phase, sound manager
│       ├── data/
│       │   └── profile.json              # (new) All personal content — §7
│       ├── sounds.ts                     # (new) Sound manager — §6.5
│       └── utils/
│
├── static/                               # SvelteKit static assets (base convention; NOT public/)
│   ├── images/                           # XP icons, wallpapers, logos (inherited + curated)
│   ├── audio/                            # XP sounds (inherited: startup, error, click, ...)
│   ├── fonts/                            # Tahoma family .woff2 (inherited)
│   ├── cursors/                          # (new) XP .cur files
│   ├── html/jspaint/                     # Bundled jspaint (inherited, kept)
│   ├── json/hard_drive.json              # VFS seed — GENERATED from profile.json (§6.7)
│   └── assets/                           # (new) portfolio images, avatar, resume PDF
│
├── scripts/
│   └── generate-vfs.ts                   # (new) profile.json → VFS seed, bumps SEED_VERSION
│
├── .github/workflows/ci.yml              # (new) CI: typecheck, lint, tests, build (§5 CI/CD)
├── netlify.toml                          # (new) build cmd, publish dir, Node version pin
├── tsconfig.json                         # (new) strict: true — full TS, no `any`
├── svelte.config.js                      # adapter-netlify (swapped from adapter-cloudflare)
├── LICENSE                               # Project license
└── LICENSE-win32.run                     # (new) upstream MIT notice — required by MIT terms
```

---

## 9. Implementation Phases

### Phase 0: Base Repo Adoption (clone & strip)

**Goal:** Start from win32.run.cf, prune it to a lean XP shell, and get a skeleton deployed on Netlify.

**Research verdict (done — evidence in `design/research/` screenshots and `.claude/research/` clones):**

- **win32.run.cf** ✅ — MIT; SvelteKit 2 + Svelte 5 + Vite 6 (the author's own refactor, so the framework migration is already done); builds clean from a cold clone; client-only (`ssr = false`) except one deletable API route; unmatched XP fidelity (BIOS boot, VFS, Explorer, window manager)
- Original **win32.run** ❌ — same project but SvelteKit pre-1.0/Svelte 3; we'd redo the migration the author already published
- **OnlineWinXP** (wxp.vercel.app) ❌ — React 16 + dead CRA toolchain, far fewer features, no boot flow
- **winxpsite** (pohwp.dev) ❌ — **no LICENSE file ⇒ legally unusable as a base**; also lowest fidelity (visual reference only)

**What the base actually gives us** (honest inventory): boot flow (BIOS + XP loading — the BIOS part gets pruned, and there is no login screen), desktop/taskbar/start menu/tray, window manager, IndexedDB virtual filesystem, My Computer/Explorer, IE window chrome, image viewer, Media Player Classic, bundled jspaint, XP icons/sounds/fonts. Its "Python REPL" is an external iframe; Notepad/Minesweeper/PDF viewer are third-party embeds that get pruned and rebuilt; there is **zero mobile support**, **no tests/linting**, and it is **plain JavaScript** (converted to strict TS in this phase).

**Tasks:**

- [ ] Clone win32.run.cf into the repo root (fresh copy, no upstream git history)
- [ ] License reconciliation: add `LICENSE-win32.run` with the upstream MIT copyright + permission notice (required by MIT terms) alongside the project LICENSE
- [ ] Execute the prune manifest — for every removal, also update `static/json/hard_drive.json` (VFS seed), the hardcoded preload arrays in `starting.svelte` (~170 image paths + `/html/*` iframe preloads), and start-menu/desktop entries:
    - [ ] `static/html/*` third-party embeds **except `jspaint`** (serves the Paint app): koodo (28MB), notepad (26MB ace build), msword (8.4MB), foxit_reader (16MB — replaced by pdfjs-dist), minesweeper embed (licenseless, loads jQuery from CDN), visualizers
    - [ ] Support libs orphaned by those prunes: `static/js/ace.js`, `static/js/mammoth.browser.min.js`, `static/js/libarchive.js` (5MB), vendored `src/lib/libarchive.js` and `src/lib/docx/`
    - [ ] Rewrite `src/routes/+page.svelte` — it is a hardcoded dynamic-import switch over `boot_manager` and every installation route; after the prune it goes straight to the XP loading screen
    - [ ] CrazyGames game embeds (~20 entries in `hard_drive.json`) and `static/files/*` demo media
    - [ ] Programs not in this spec: microsoft_word, koodo, flash_player, winrar, java, photon, xp_tour, app_installer, webapp + the `/api/webapp_info` endpoint (its only consumer is app_installer)
    - [ ] Win95/DOS installation flows (`src/routes/installation/`) **and** the BIOS/boot-device screen (`boot_manager.svelte`) — remove entirely; the site starts directly at the XP loading screen (§2.1)
    - [ ] Dead dependencies: @faker-js/faker, docx, vendored libarchive.js (if unused after pruning). NOT dead — keep for now: axios (fetches the VFS seed in kept `starting.svelte`) and build-url (kept `internet_explorer.svelte`); @tailwindcss/line-clamp only removable together with its `tailwind.config.cjs` registration and if the lockfile resolves Tailwind ≥3.3 (details in the Phase 0 design doc)
- [ ] Swap `@sveltejs/adapter-cloudflare` → `@sveltejs/adapter-netlify`; add `netlify.toml` (build command, publish dir, pinned Node version)
- [ ] **Full TypeScript conversion**: strict `tsconfig.json` (`strict: true`), convert all `src/**/*.js` to `.ts` and add `lang="ts"` to every component, `svelte-check` passes clean, ESLint `@typescript-eslint/no-explicit-any: error` — no `any` anywhere; evaluate dropping the base's `compilerOptions.compatibility.componentApi: 4` flag (migrate any legacy component-API call sites) as part of the same pass
- [ ] Add VFS `SEED_VERSION` re-seeding (§6.7) — the base fetches the seed once and never refreshes, so pruned/updated content would otherwise never reach returning visitors
- [ ] Tooling (base has none): ESLint + Prettier, Vitest, Playwright, husky + lint-staged
- [ ] CI/CD (§5 CI/CD Pipeline): `.github/workflows/ci.yml` (typecheck, lint, tests, build on every push/PR); connect the repo to Netlify (PR deploy previews, production deploys from `main` only); protect `main` and `dev` behind green CI
- [ ] Branching model (§5 Branching Model): create `dev` from `main`, make it the local default; all Phase 0 work lands on `feature/*` branches off `dev`; first cutover `dev` → `main` happens at this phase's exit (deploying the skeleton)
- [ ] Migrate the remaining `public/assets/` production files into `static/assets/` and remove `public/` — avatar, xp-logo, and the about-me / contact-me / my-cv / chess / doom icons (the base's ~560-icon set + sounds + Bliss already cover everything else; those duplicates were moved to `design/asset-pool/`)
- [ ] Verify: `npm run dev` boots straight to the XP loading screen → desktop; windows open/close/drag/resize; `npm run build` passes; skeleton deployed on Netlify

**Exit criteria:** A lean, MIT-attributed, fully-TypeScript XP shell (~45MB static — mostly the kept jspaint; optionally slim its dist further) running locally and deployed on Netlify through the CI/CD pipeline. **Explicitly expected broken after pruning:** Notepad, Minesweeper, PDF viewing, Python REPL (all rebuilt in later phases). Working: loading screen → desktop, taskbar, start menu, My Computer, image viewer, Paint (jspaint), Media Player Classic.

### Phase 1: Core XP Shell

**Goal:** Rebranded boot sequence (with the new login screen) + desktop with verified window management + mobile fallback.

> Much of this phase is inherited from the base — the work is verification against §4, rebranding, and the two genuinely new pieces: the **login screen** and the **mobile experience**.

- [ ] Boot sequence: "Momad's XP" loading screen (entry point — rebrand per §2.1) → **Login screen (new — §2.2)** → Welcome (verify §2.3) → Desktop
- [ ] XP startup sound wired to the Login → Welcome transition
- [ ] Asset preloading during boot (inherited — preload manifest updated after the Phase 0 prune)
- [ ] Desktop with Bliss wallpaper (inherited)
- [ ] Window manager: open, close, focus, minimize, maximize, position, size (inherited — verify each behavior in §4.1, including cascade)
- [ ] Taskbar with Start button, per-window taskbar items, system tray + clock (inherited — verify §3.6)
- [ ] Desktop icon grid with double-click to open (inherited — curate to the 5 icons of §3.5 + Recycle Bin)
- [ ] Start menu restructured per §3.4 (pinned column, All Programs flyout, right column with social links, Shut Down)
- [ ] Context menu system (inherited — verify desktop/icon menus per §4.2)
- [ ] XP cursor overrides (verify; add missing cursors from `design/` packs)
- [ ] Create `src/lib/data/profile.json` with all personal data (source: `docs/Profile.pdf`) and copy the resume PDF into `static/assets/` — the mobile layout below needs both **now**; Phase 2's apps consume the same file
- [ ] Mobile experience (**new** — base has zero mobile support): portrait layout per §4.6; landscape prompt; >= 1024px full desktop

**Exit criteria:** User can boot → login → see desktop → double-click icons to open/close/drag/resize windows → use taskbar and start menu. Unbuilt apps render a placeholder. Mobile visitors see the simplified portfolio.

### Phase 2: Portfolio Content Apps

**Goal:** My Computer, About Me, Contact Me, My CV — the core portfolio experience.

- [ ] Verify/extend `profile.json` (created in Phase 1) — add projects, `images` arrays, and any fields the Phase 2 apps need
- [ ] Write `scripts/generate-vfs.ts` and wire it into the build: `profile.json` → VFS seed (`hard_drive.json`), with `SEED_VERSION` computed as a content hash of the generated seed (no manual bumping to forget) — §6.7
- [ ] My Computer: Explorer-style window with folder tree and file/folder view
    - Folder structure: Experience, Projects, Education, Skills, Certifications, Awards
    - Clicking items shows detail content sourced from JSON
    - Image/GIF gallery per entry (rendered from `images` array in JSON)
- [ ] About Me: Explorer window with sidebar navigation, bio content, skills tree
- [ ] My CV / PDF Viewer: Window rendering the resume PDF via pdfjs-dist (XP chrome, Download button)
- [ ] Contact Me: Outlook Express-style email form
    - Netlify Function `/api/email` (SvelteKit endpoint) using Resend
    - Abuse hardening per §6.8 (honeypot, rate limit, payload caps)
    - Form validation, success/error XP dialogs
- [ ] Ensure all content is driven by `profile.json` — zero hardcoded personal content

**Exit criteria:** Visitor can explore the full portfolio (experience, projects, skills, education, contact) through native-feeling XP applications.

### Phase 3: Developer & Interactive Apps

**Goal:** CMD, Python, Paint, Music Player — the "power user" experience.

- [ ] CMD: xterm.js Linux-style terminal with startup intro message and core command set (`help`, `about`, `skills`, `experience`, `whoami`, etc.)
    - Command output reads from `profile.json`
    - Easter eggs: `matrix`, `hack`, `sudo`
- [ ] Python REPL: Pyodide-powered Python 3.13.x interpreter in a terminal window (in-page via pinned CDN — replaces the base's pyodide.org iframe)
- [ ] Paint: bundled jspaint (kept in Phase 0) wrapped in XP window chrome, or a custom Canvas app
    - Tools: pencil, brush, eraser, fill, shapes, color picker
    - File menu: New, Save as PNG
- [ ] Music Player: local bundled tracks with play/pause/next/prev, volume, seek, track list, and Canvas visualizer (§3.2 — the Spotify embed cannot satisfy these; reduced-feature Spotify mode is stretch)

**Exit criteria:** All four apps are functional and styled authentically.

### Phase 4: Games

**Goal:** Minesweeper, Solitaire, Chess, DOOM.

- [ ] Minesweeper: Custom implementation; 3 difficulty levels; timer; mine counter
- [ ] Solitaire: Klondike; drag-and-drop cards; win animation
- [ ] Chess: chess.js + chessboard UI; single-threaded Stockfish WASM for AI opponent (see §5 — the multithreaded build's COOP/COEP requirement breaks other embeds)
- [ ] DOOM: js-dos embedding with shareware WAD; fullscreen toggle

**Exit criteria:** All four games are playable within XP windows.

### Phase 5: AI Chatbot (Internet Explorer)

**Goal:** RAG-based chatbot that answers questions about Mohamed.

- [ ] IE window with browser-style UI (address bar, toolbar, navigation buttons)
- [ ] Chat interface: message list, input field, send button
- [ ] Netlify Function `/api/chat` (SvelteKit endpoint):
    - System prompt includes full `profile.json` content as context
    - Uses **Google Gemini 3 Flash** (`gemini-3-flash`) via `@google/genai` on the Gemini API free tier
      (alternative to evaluate: Netlify AI Gateway — managed key handling; verify the model is offered before committing)
    - Streaming responses (SSE) — **verify** streaming works through `@sveltejs/adapter-netlify` on the free tier (sync functions time out at ~10s; the fallback is a standalone `netlify/edge-functions/chat.ts`, not a per-route adapter flag — see §6.8)
    - Abuse hardening per §6.8 (rate limit, payload/history caps, `maxOutputTokens`)
    - Verify the exact model id and free-tier quotas (RPM/TPD) at implementation time and record them in the phase guide
- [ ] Typing indicator, error handling, conversation history (session-scoped)
- [ ] Suggested questions: "What does Mohamed specialize in?", "Tell me about RoboCup", etc.

**Exit criteria:** Visitor can have a natural conversation with the chatbot and get accurate answers about Mohamed's background.

### Phase 6: Polish & SFX

**Goal:** Sounds, animations, final UX details, performance optimization.

- [ ] Sound manager: preload all XP sounds; system tray volume control
- [ ] Wire up all sound triggers (boot, open, close, error, minimize, startup, shutdown)
- [ ] Window animations: open, close, minimize, maximize transitions
- [ ] Start menu animation (slide up)
- [ ] Selection box on desktop (drag to select multiple icons)
- [ ] Taskbar balloon notifications ("Your system is protected" on first load)
- [ ] CMD filesystem navigation: `ls`, `cd`, `pwd`, `cat` mapped to portfolio sections from `profile.json`
- [ ] Shut Down dialog → shutdown animation → return to login
- [ ] Performance audit: lazy load all apps; code split per app; optimize images (WebP)
- [ ] Preload critical assets; defer non-critical
- [ ] SEO: meta tags, Open Graph image (screenshot of the desktop), structured data
- [ ] Favicon: XP-style icon
- [ ] Accessibility: keyboard navigation for desktop icons and start menu; focus indicators
- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)
- [ ] Deploy to Netlify with custom domain

**Exit criteria:** Production-ready, polished experience indistinguishable from a real XP session at first glance.

### Stretch / Optional

- [ ] Notepad / WordPad: Simple text editor
- [ ] Recycle Bin: Decorative with "Empty Recycle Bin" sound
- [ ] CRT monitor filter toggle (scanlines + slight curve via CSS/SVG filters)
- [ ] Screensaver after inactivity (classic XP pipes, starfield, or maze)
- [ ] Multiple wallpaper options (right-click desktop → Properties → change wallpaper)
- [ ] Theme support (XP Silver, Olive Green, Royal Blue)
- [ ] Clippy assistant (animated helper that pops up with tips)
- [ ] System Properties dialog showing "OS version", "RAM", "Processor" with humorous specs
- [ ] Blue Screen of Death easter egg (triggered by a secret key combo)

---

## 10. Assets & Resources

### Fonts

| Font            | Usage                                      | Source                                    |
| --------------- | ------------------------------------------ | ----------------------------------------- |
| Tahoma          | Primary UI font (menus, labels, body text) | **Inherited** — base ships Tahoma-family `.woff2` in `static/fonts` (~560KB) |
| Trebuchet MS    | Start menu user name, some headings        | Web-safe                                  |
| Franklin Gothic | XP logo text "Momad's XP"                  | Web font or substitute                    |
| Lucida Console  | CMD terminal, monospace contexts           | Web-safe                                  |

### Icons

XP-style icons needed (32x32 and 48x48):

- My Computer, My Documents, Recycle Bin, Internet Explorer, Outlook Express
- CMD, Python, Paint, Media Player, Minesweeper, Solitaire, Chess, DOOM
- Folder, File, PDF, GitHub, LinkedIn, Instagram
- System tray: Volume, Network, Security Shield

**Source:** The base repo ships a full XP icon set in `static/images` — use it first. Supplement from the icon packs in `design/` (high-res icon pack, cursor packs) for anything missing (GitHub/LinkedIn/Instagram, portfolio-specific icons).

### Sounds

| Sound                    | File            |
| ------------------------ | --------------- |
| XP Startup               | startup.mp3     |
| XP Shutdown              | shutdown.mp3    |
| XP Logon                 | logon.mp3       |
| XP Logoff                | logoff.mp3      |
| XP Error / Critical Stop | error.mp3       |
| XP Exclamation           | exclamation.mp3 |
| XP Ding                  | ding.mp3        |
| XP Notify                | notify.mp3      |
| XP Recycle               | recycle.mp3     |
| Menu click               | click.mp3       |

**Source:** The base repo ships the real XP sounds in `static/audio` (e.g. `xp_startup.mp3`) — use those. Note: this (like the inherited icons and fonts) is the same nostalgic fair-use posture as upstream win32.run — Microsoft assets used in a personal, non-commercial portfolio. Archive.org XP sound packs remain a fallback for anything missing.

### Images

| Image               | Usage                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------- |
| Bliss wallpaper     | Desktop background                                                                                      |
| XP logo (modified)  | Boot screen, login screen                                                                               |
| User avatar         | Login screen, start menu, about me                                                                      |
| XP login background | Blue gradient with hills                                                                                |
| Portfolio images    | Diplomas, certificates, team photos, project screenshots — referenced in `profile.json` `images` arrays |

### Reference Links

- [win32.run.cf](https://github.com/ducbao414/win32.run.cf) — the MIT base repo (author's Svelte 5 refactor of win32.run)
- [win32.run](https://win32.run) ([repo](https://github.com/ducbao414/win32.run)) — live reference for shell parity
- [Svelte 5](https://svelte.dev/) / [SvelteKit 2](https://svelte.dev/docs/kit) — framework
- [@sveltejs/adapter-netlify](https://svelte.dev/docs/kit/adapter-netlify) — Netlify deploy adapter
- [Netlify Functions](https://docs.netlify.com/build/functions/overview/) — serverless email + chat endpoints
- [xterm.js](https://xtermjs.org/) — Terminal emulator
- [Pyodide](https://pyodide.org/) — Python in the browser
- [pdf.js / pdfjs-dist](https://github.com/mozilla/pdf.js) — PDF rendering for My CV
- [js-dos](https://js-dos.com/) — DOS emulator for DOOM
- [chess.js](https://github.com/jhlywa/chess.js) — Chess logic
- [stockfish.wasm](https://github.com/lichess-org/stockfish.wasm) — Chess AI (multithreaded; needs SharedArrayBuffer/COOP+COEP — default to a single-threaded build instead, see §5)
- [jspaint](https://github.com/1j01/jspaint) — MS Paint recreation (bundled in the base)
- [Google Gemini API](https://ai.google.dev/) — AI chatbot (free tier)
- [@google/genai](https://github.com/googleapis/js-genai) — Gemini SDK (successor of the deprecated `@google/generative-ai`)
- [Resend](https://resend.com/) — Email API
- [Spotify Embed API](https://developer.spotify.com/documentation/embeds) — Music player option

---

## 11. Phase Handoff & Visual Parity

> Condensed from (and replacing) the former `PHASE-HANDOFF-GUIDE.md`. A phase is done when it is **functionally correct**, **visually faithful to Windows XP**, and **documented**.

### Phase workflow (mandatory, every phase)

Each phase runs through six gates, in order. Every red-team gate uses a **fresh-context subagent explicitly instructed to find problems, not validate** — verdicts it grades Weak/Wrong get fixed (or rejected only with a concrete reasoning flaw, never a vibe):

**Autonomy rule:** the gates run back-to-back **without pausing for owner approval between them**. Stop and ask only when something genuinely needs the owner: destructive or irreversible actions beyond the plan, scope changes, account/credential/spend decisions, or a red-team finding that invalidates a locked decision. Everything else: decide with for-and-against, document it, keep moving — the owner reviews at the phase handoff and can override there.

1. **Spec** — spec the phase in detail using the superpowers skills (brainstorming first, then the relevant process skills); output: a written phase spec (scope, exit criteria, sub-decisions with for/against)
2. **Red-team the spec** — attack scope gaps, hidden sub-decisions, cross-decision conflicts, wrong assumptions
3. **Plan** — implementation plan (planner agent / plan mode): files, order, test strategy, risks
4. **Red-team the plan** — attack sequencing, missed dependencies, untestable steps, regressions to inherited surfaces
5. **Implement** — TDD on `feature/*` branches off `dev` (§5 Branching Model), merging back to `dev` via CI-gated PRs
6. **Red-team the implementation** — code review + security review agents on the diff before the phase is declared done; findings fixed before handoff

Only after gate 6 does the phase produce its handoff file and (when stable) a cutover `dev` → `main`.

### Handoff file

Each completed phase produces `docs/phase-{N}-guide.md` (N = 0…6, one file per phase, never a reused generic name) with these sections:

1. **Phase summary** — goal + exit criteria (from §9), what was implemented, what's explicitly deferred
2. **Required assets** — what to obtain/replace, formats, exact folder locations, remaining placeholders
3. **Setup & commands** — Node version, package manager, install/dev/build/preview commands, local URL, success criteria
4. **Environment variables** — every `.env` key, what it's for, where to get it, example block with placeholders (never real secrets); or "None for this phase" + why
5. **Code configuration** — files where placeholders/constants must be updated; files not to touch
6. **profile.json dependencies** — which fields this phase reads; required vs optional; minimal valid examples
7. **Deployment (Netlify)** — deploy steps, env vars to set in the Netlify UI, functions introduced (`/api/email`, `/api/chat`), free-tier caveats; or point to the earliest guide that covers shared setup
8. **Functional testing checklist** — step-by-step checkboxes mapping to the phase's exit criteria
9. **Visual parity report** — see below; "N/A — no UI changes" if applicable
10. **Notes & gotchas** — pitfalls, known limitations, browser caveats, dependencies on later phases

Writing rules: concrete commands and full paths, no marketing language, honest about stubs/gaps, consistent names with this spec, parity claims backed by screenshots.

### Visual parity standard

Since Phase 0 the project **is** a pruned win32.run — so parity means two different things:

- **Inherited surfaces** (boot, desktop, taskbar, start menu, windows): do not regress. When in doubt, compare against [win32.run](https://win32.run) live.
- **New surfaces** (login screen, About Me, Contact Me, games, mobile layout): compare side-by-side against the closest reference — `design/inspiration/*` mockups, `design/research/*` screenshots, or real XP screenshots.

**Workflow (mandatory for every phase that touches UI):**

1. Open two Playwright browser instances at the same viewport (e.g. 1280×800): reference vs `http://localhost:5173`
2. Walk both through the same stages (boot / login / welcome / desktop / taskbar / start menu / the phase's new surfaces)
3. Screenshot both at each stage, compare pixel-level, fix differences in code, reload, re-screenshot
4. Iterate until each screen reaches **≥95% parity**: layout/colors/gradients/fonts/borders/animation timing indistinguishable at normal viewing distance. Acceptable differences: font rendering subtleties, sub-pixel anti-aliasing, portfolio content vs reference content
5. Do not eyeball it and move on — screenshots are the evidence, and no asking for confirmation mid-loop

### Completion checklist

- [ ] All six workflow gates passed — spec, plan, and implementation each red-teamed, findings resolved
- [ ] All exit criteria from §9 for this phase are met
- [ ] Visual parity loop completed for all in-scope screens (≥95%), no unaddressed or undocumented mismatches
- [ ] `docs/phase-{N}-guide.md` written per the structure above
- [ ] `npm run dev` works and the functional checklist passes
- [ ] `npm run build` (production) succeeds
- [ ] Env vars + Netlify deploy steps documented (or N/A)
- [ ] Handoff states which screens changed, what changed, and any unavoidable deviations with reasons
- [ ] Ends with the explicit statement: **"Phase {N} is complete."**

---

_This document is the single source of truth for Momad's XP development. Update it as decisions evolve._
