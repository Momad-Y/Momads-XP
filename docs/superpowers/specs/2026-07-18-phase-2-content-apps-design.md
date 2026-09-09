# Phase 2 Design — Portfolio Content Apps

> Spec per `SPECIFICATION.md` §9 Phase 2 / §3.1 / §6.7 / §6.8 / §7. Gates per §11.
> Base facts referenced below come from the Phase 1 codebase (tip `818a64f`).

## 1. Goal

Visitors explore the full portfolio through native-feeling XP apps: **My Computer**
(resume-section folder tree with per-entry detail views), **About Me**, **My CV**
(pdfjs viewer), and **Contact Me** (real email via Resend). All content is driven by
`src/lib/data/profile.json`; the VFS seed is generated from it at build time
(`scripts/generate-vfs`), retiring the hand-stamped `SEED_VERSION`.

**Out of scope:** CMD/Python/Paint/Music (Phase 3), games (Phase 4), IE chatbot
(Phase 5 — the inherited IE browser stays as-is), sound manager (Phase 6).

## 2. Current-state facts that shape the design

- The VFS seed (`static/json/hard_drive.json`, 24 items) is an id-keyed map of
  `VfsItem`s; apps are `.exe` items with `storage_type:'fake'` and
  `url:'./programs/x.svelte'`.
- Programs mount via `work_space.svelte`'s `launch()` — a static-import if/else
  chain keyed on the literal `path` string. Every new program needs a branch there.
- File associations live in `doctypes` (`system.ts:159`) — `.pdf`/`.txt` currently
  have **no** opener (fall through to the no-association dialog).
- The Explorer (`my_computer.svelte` + `viewer.svelte`) renders a **uniform icon
  grid**; the only special view is the root (`id == null`), whose "Files Stored on
  This Computer" section renders the folders in the `my_computer` id list
  (`system.ts:101`). There is no folder tree and no per-folder detail pane.
- `SEED_VERSION` (`seed.ts`) is a hand-pasted hash; mismatch on boot re-fetches the
  seed and **wipes** the visitor's IndexedDB drive (user files included).
- About Me / My CV / Contact Me are placeholder `.exe`s (desktop + start menu).
- `profile.json` is live and typed (`profile.ts`); `projects: []` is empty;
  `docs/Profile.pdf` contains **no projects section**; only assets on disk are the
  resume PDF, avatar, xp-logo, and the 7 app icons (no gallery images yet).
- E2E runs against `vite preview` (static output) — **SvelteKit server routes do
  not run there**, so `/api/email` is not exercisable in CI E2E.

## 3. Sub-decisions (for / against / verdict)

### D1 — How My Computer shows entry detail

- **A) Dedicated portfolio-entry file type + new viewer program.** Seed each entry
  (experience item, project, …) as a VFS file carrying a `portfolio_ref`
  (section + index) pointing into `profile.json`; double-click opens a new
  `portfolio_viewer.svelte` window rendering title/subtitle/bullets/gallery.
    - For: zero changes to the inherited, regression-prone `viewer.svelte`
      (sort worker, selection, debounce, touch); reuses the established
      doctypes/work_space pattern; detail is a normal draggable XP window;
      trivially testable in isolation. Spec §3.1 explicitly allows "or in a
      new window".
    - Against: not the "detail view within the explorer window" variant; one
      more work_space branch.
- **B) Teach `viewer.svelte` per-folder detail panes** (branch on folder id).
    - For: in-place navigation, matches the first variant in §3.1.
    - Against: highest regression risk in the most complex inherited component;
      id-keyed special cases break uniform Back/Forward semantics; hard to test.
- **C) Seed generated `.html` files opened by the inherited IE.**
    - For: zero new programs.
    - Against: IE becomes the chatbot in Phase 5 (collision); baked HTML in the
      seed duplicates content that must stay data-driven; browser chrome is the
      wrong XP metaphor for a document.

**Verdict: A.** Deciding factor: it is the only option that adds the feature
without modifying the fragile inherited Explorer, and the spec sanctions the
new-window variant. Entries use a dedicated extension (exact ext chosen in the
plan) registered in `doctypes` → `portfolio_viewer`.

Binding details (red-team F6/F7/M2/M4):

- **`portfolio_ref` shape:** `{ section, key }` where `key` is a numeric index
  for the array sections (experience/projects/education/awards/certifications)
  and the **category name string** for `skills` (it is a
  `Record<string, string[]>`, not an array — an index cannot address it).
  Declared as an optional typed field on `VfsItem` (`types.ts`), set only by the
  generator.
- **Section-aware rendering, not one uniform template.** The viewer switches on
  `section` and renders every field the schema defines: experience (role,
  company, period, location, description bullets), project (name, description,
  tech chips, external link), education (institution, degree, period, honors),
  award (title, year — tolerate empty year), certification (title), skills
  category (name + skill list). Optional/empty fields collapse; the gallery
  strip renders only when `images` is non-empty.
- **Icons:** the generator stamps a per-item `icon` on every entry file (the new
  ext gets no `icons`-map entry; without a stamped icon entries would render the
  generic default).
- **Descope note (F9):** §3.1's "folder tree with expandable nodes" left panel
  is **not delivered** — the inherited Explorer has no tree; its XP
  common-tasks sidebar + address-bar navigation is adopted as-is. Recorded here
  so the parity gate grades against this, not §3.1's tree.

### D2 — VFS generation: build-time script with committed output

- **A) `scripts/generate-vfs.ts` writes `hard_drive.json` + `seed_version`; output
  committed; CI freshness check** (regenerate → must be byte-identical).
    - For: deterministic and diffable; dev server serves the real file from
      `static/` with zero Vite plumbing; the existing hash-guard test model keeps
      working; hand-edit drift is caught by CI.
    - Against: generated artifact lives in git (mitigated by the freshness check
      making it impossible to drift silently).
- **B) Generate at build only (uncommitted).**
    - For: single source of truth on disk.
    - Against: `vite dev` serves `static/` as-is — the file must exist before dev
      runs, so this degenerates into "run the script anyway, plus gitignore
      churn"; harder to inspect diffs; hash-guard test loses its anchor.
- **C) Derive the portfolio tree in the browser at boot.**
    - For: no build step.
    - Against: rewrites the inherited seed flow (highest risk); complicates
      re-seed semantics; ships generation code to every visitor for a
      build-time-constant result.

**Verdict: A.** Deciding factor: `static/` must contain the file at dev time
anyway, so committed-plus-freshness-check is strictly simpler and safer.
Implementation notes (binding, incl. red-team F4/F5/F10/M3):

- **Deterministic ids** (stable slugs per section/entry — re-generation never
  churns ids) and **deterministic timestamps**: generated items reuse the seed's
  frozen epoch (`1676799354180`); `Date.now()` anywhere in the generator would
  make the freshness check fail every CI run.
- **Field-preserving passthrough**: inherited non-portfolio items are copied as
  raw JSON, never round-tripped through the `VfsItem` type (the seed carries
  fields like `hidden` that the type doesn't declare).
- **Single source of truth for fixed ids**: the generator emits a constants
  module (portfolio folder/entry ids) that `system.ts` **imports** for the
  `my_computer` root list and `protected_items` — `finder.ts` hard-throws at
  first Explorer launch on any id in `my_computer` missing from the drive, so
  the ids must never live in two places.
- Output stays compact single-line JSON (`static/` is prettier-ignored); the
  generated `src/lib/seed_version.ts` and constants module must be
  prettier-clean (`src/` is NOT prettier-ignored) — generator runs its output
  through prettier or emits canonical formatting.
- **Writes the content hash into generated `src/lib/seed_version.ts`** —
  retiring manual stamping and the Phase-1 curation script. CI gains an explicit
  freshness step: regenerate → `git diff --exit-code`.

### D3 — Re-seed semantics: preserve user-created files

- **A) Merge on re-seed** (precise contract below).
    - For: honors §6.7 "user-created files survive re-seeds where possible";
      every future content edit stops nuking visitors' files; logic is a pure
      function over two id-maps — very unit-testable.
    - Against: merge logic + tests; orphan edge cases (resolved by the rules
      below).
- **B) Keep Phase-1 wipe-on-mismatch.**
    - For: zero work.
    - Against: contradicts §6.7 as written; Phase 2 makes content edits routine
      (every profile.json change re-seeds), so wipes become frequent, not rare.

**Verdict: A.** Deciding factor: Phase 2 is precisely the moment re-seeds become
routine; shipping the generator without the merge institutionalizes data loss the
spec already promises to avoid.

**Merge contract (binding — red-team F1/F2/F3):** pure function
`merge_on_reseed(cachedDrive, newSeed) → drive`:

1. The new seed owns every id it contains (seeded/portfolio items always come
   from `newSeed`, including their `children` arrays).
2. **Carry set:** every cached item with `storage_type === 'local'` (files AND
   user-created folders — `new_fs_item` marks both `local`) whose parent
   resolves in **`newSeed ∪ carry set`** (transitively — so a user folder tree
   on the Desktop survives whole, not just its top level).
3. **Relink:** each carried id whose parent is a `newSeed` item is spliced back
   into that parent's `children` (deduped, appended after seeded children) —
   without this the Explorer never renders carried files, because folders render
   from `parent.children`, not by scanning `.parent`.
4. Truly orphaned locals (parent chain broken in both maps) are dropped.
5. **Documented loss:** visitor *copies* of seed items are NOT carried —
   `clone_fs` preserves the source's `storage_type` (`remote`/`fake`/absent),
   so copies fail the `local` predicate. This is deliberate: the same predicate
   is what cleanly retires the Phase-1 placeholder `.exe`s (`storage_type:
   'fake'`) instead of resurrecting phantom launchers from cached drives.
   Recorded in the phase guide.

Unit-test matrix (minimum): desktop file carried + relinked · nested user-folder
tree carried whole · orphaned local dropped · stale `fake` placeholder NOT
carried · seeded folder's regenerated `children` not clobbered by relink ·
merge failure falls back to plain `newSeed`.

### D4 — Contact transport: SvelteKit endpoint `/api/email/+server.ts`

**Inherited from SPECIFICATION.md §6.8 — alternatives weighed there** (adapter
emits a Netlify Function; route exports `const prerender = false`; §6.8 hardening
list is binding: honeypot + min-fill-time, best-effort in-memory per-IP token
bucket, payload caps, Origin/Referer allowlist incl. `*.netlify.app` previews,
XP-styled 429/error dialogs).

### D5 — Resend call: plain `fetch` vs `resend` SDK

- **A) Plain `fetch` POST to `https://api.resend.com/emails`.**
    - For: the endpoint sends exactly one fixed-shape request; no new dependency
      in the serverless bundle; no SDK version churn; response handling is ours
      (we map to XP dialogs anyway).
    - Against: no typed client (mitigated: we type the one request/response pair
      ourselves and validate at the boundary).
- **B) `resend` npm SDK.**
    - For: battle-tested typing, idempotency helpers.
    - Against: a dependency for a single POST; larger function bundle; the SDK's
      error taxonomy still needs mapping to our dialogs.

**Verdict: A.** Deciding factor: one endpoint call does not clear the bar for a
new production dependency. Sender: use the account's verified domain if one
exists, else `onboarding@resend.dev` (valid because the recipient is the account
owner's address); `reply_to` is set to the visitor's address so replies just work.
The exact from-address and `RESEND_API_KEY` provisioning (Resend MCP → Netlify env
var) are confirmed at implementation and recorded in the phase guide.

### D6 — CV viewer: slim pdfjs-dist canvas viewer

**Forced by SPECIFICATION.md §3.1** (pdfjs-dist on canvas; iframe unreliable on
iOS; the base's 16MB Foxit-styled viewer was pruned in Phase 0). Scope decisions:
- Pages render sequentially into a scrollable column (all pages of a ~2-page
  resume — no virtualization; YAGNI for a resume-sized document).
- Toolbar: page indicator, zoom −/+ (fit-width default), **Download** (spec-named
  button) → `meta.resumePdf`.
- Worker loaded via Vite `?url` bundling (no CDN — keeps the §5 no-new-CDN
  posture); exact pdfjs-dist major pinned at implementation after checking
  current release.
- Registered as the `.pdf` handler in `doctypes` — a real
  `Mohamed_Abdelnasser_Resume.pdf` VFS file (storage_type `remote`) is seeded
  under the portfolio tree, so both the desktop "My CV.exe" and the VFS file
  open the same viewer and `.pdf` stops hitting the no-association dialog.
- Program file is **`pdf_viewer.svelte`** (matches SPECIFICATION §8's file
  structure; supersedes the working name "cv_viewer"). Dual entry points
  (red-team F12): launched from the `.exe` it receives only `exe_item` and
  **defaults to `meta.resumePdf`**; launched via the `.pdf` doctype it renders
  the passed `fs_item`'s URL.

### D7 — About Me: faithful to `design/inspiration/about-me.png`

Explorer-chrome window (menu bar stubs, Back/Forward + **My Projects** /
**My Resume** toolbar buttons, address bar reading "About Me"): left sidebar of
collapsible XP panels — **Social Links** (profile.social), **Skills** (categories
from profile.skills), **Languages**; blue main pane with avatar + bio paragraphs
(profile.about.bio). My Projects opens My Computer at the Projects folder;
My Resume opens the CV viewer. No alternatives worth weighing on layout — the
design reference is the owner-approved target (fidelity bar: pixel-close, our
content). Sub-decision — **how My Projects deep-links**: `queueProgram` requests
`my_computer.svelte` with the Projects folder as `fs_item` (the Explorer already
accepts a partial `fs_item` as its start location); no new mechanism.

### D8 — Contact Me: faithful to `design/inspiration/email.png`

Outlook-Express-style window: menu bar (File/Edit/View stubs), toolbar
(**Send Message**, **New Message** = clear, cut/copy/paste stubs, **LinkedIn**
button → profile.social), fields **To** (read-only,
`{meta.name} <{meta.email}>`), **From** (visitor email), **Subject**, body;
status bar "Compose a message to Mohamed". Client-side validation (email format,
required fields, length caps) mirrors server rules; hidden honeypot field +
form-open timestamp for the min-fill-time check; success/failure/429 use the
existing XP `Dialog` component. The visitor's email lands in `reply_to` (D5).

### D9 — Portfolio tree placement: Explorer root via the `my_computer` list

- **A) Six folders as children of C:\ with fixed ids appended to the
  `my_computer` root list** → they render in "Files Stored on This Computer"
  at the Explorer root, ordered before My Music/My Pictures.
    - For: matches the §3.1 tree ("My Computer ├── Experience/ …") exactly;
      zero `viewer.svelte` changes (the root section already renders that list);
      folders get `protected_items` for free (visitors can't delete the
      portfolio).
    - Against: root section grows to 8 folders (acceptable — the portfolio is
      the product; My Music/My Pictures stay for XP authenticity).
- **B) Plain children of C:\ only.**
    - For: less root clutter.
    - Against: contradicts the §3.1 tree; buries the content one click deep.

**Verdict: A.** Deciding factor: §3.1's tree is explicit and option A implements
it without touching the inherited viewer.

**Entry-file protection (red-team F8 — deliberate decision):** portfolio entry
*files* join `protected_items` alongside the six folders (via the generated
constants module, D2). For: a visitor deleting "Printerpix — AI Engineer" is
silent product breakage that persists until the next content edit — the entries
ARE the product. Against: slightly less XP-authentic (you can't delete the
owner's files); accepted — visitors keep full delete/rename freedom over their
own files and the rest of the drive. Desktop `.exe` shortcuts stay deletable
(authentic, and recoverable on next re-seed).

### D10 — Projects content: drafted from public sources, flagged for owner review

`docs/Profile.pdf` has no projects section, so the sanctioned source is empty.
- **A) Draft `projects` from Momad's public GitHub (`Momad-Y`) + projects his
  résumé implies (RoboCup @Home stack, Smart White Cane (AISC), Momad's XP
  itself), marked prominently in the phase guide + handoff for owner review.**
    - For: ships a working Projects folder now; content lives in one reviewable
      JSON block the owner can edit in minutes; consistent with the established
      review-at-handoff working mode.
    - Against: risk of misdescribing his work (mitigated: descriptions kept
      factual from repo READMEs/resume bullets; flagged as *draft* at handoff).
- **B) Ship Projects empty, wait for owner content.**
    - For: no risk of wrong content.
    - Against: an empty flagship folder fails the phase's exit criteria
      ("explore the full portfolio"); blocks on input mid-phase, against the
      autonomy rule.

**Verdict: A.** Deciding factor: drafts are cheap to correct at handoff; an empty
Projects folder is a broken experience. `images` arrays stay empty until the
owner supplies photos — detail views render the gallery strip **only when
non-empty** (no placeholder art).

### D11 — profile.json extensions

Add `projects` entries (D10; the `Project` interface and `projects: Project[]`
already exist in `profile.ts` — this is a data-only change, no new typing). Add
nothing else speculative (YAGNI): existing sections already cover every folder.
**No runtime schema validation** (inherited Phase-1 decision: the JSON compiles
into the bundle, no trust boundary — but the *generator* now validates shape at
build time via the same TS types, which closes the §7 "revisit at Phase 2"
note).

### D12 — Testing strategy

- **Unit (Vitest):** generator (tree shape vs profile.json, id determinism,
  parent/children integrity, single-line format, seed_version content-hash);
  re-seed merge (D3 cases: user file kept, orphan dropped, seeded item replaced);
  `/api/email` handler called directly as a function (validation matrix, honeypot,
  fill-time, token bucket, origin allowlist, Resend fetch mocked, error mapping);
  profile.ts project typing. The old hash-guard test is **replaced** by the
  freshness test (regenerate == committed).
- **E2E (Playwright, static preview):** My Computer root shows the six folders →
  navigate into Experience → open an entry → detail window shows role bullets;
  About Me renders bio + sidebar; CV viewer renders ≥1 canvas page; Contact Me
  validation error dialog + mocked success dialog via `page.route('/api/email')`.
  **Constraint (binding):** `vite preview` runs no server routes, so E2E always
  mocks `/api/email`; the real function is verified manually on the Netlify
  deploy preview of each contact-form PR (curl + form smoke), recorded in the
  phase guide. Detail-view E2E covers **three heterogeneous sections** (an
  experience entry's bullets, a project's tech/url, education honors — F7), not
  just one.
- Coverage: unchanged CI gate (diff-cover 80% on changed `.ts`; `.svelte` is
  E2E-owned).

### D13 — Placeholder retirement

The generator emits About Me / My CV / Contact Me desktop `.exe`s pointing at the
real programs; start-menu entries switch from the placeholder channel to real
launches. The placeholder program itself **stays** (still serves CMD/Python/
Paint-custom/Music/Games until Phases 3–4).

### D14 — Boundary items surfaced by red-team (resolved)

- **Mobile (M1):** the §4.6 mobile portfolio already renders
  `profile.projects` (with an empty-state branch), so the D10 data lands there
  for free; mobile contact stays the existing `mailto:` button — wiring mobile
  to `/api/email` is out of Phase 2 scope. Recorded so the mobile E2E specs get
  a projects assertion once data lands.
- **E2E count (M5):** CI runs whatever specs exist (no count enforcement — by
  design); the suite grows from 12 to ~16+ with the D12 additions.
- **Resend quota (M6):** free tier ≈100 emails/day; the in-memory per-IP bucket
  resets on cold starts, so a determined curl loop can exhaust the daily quota.
  Accepted for a portfolio (worst case: contact form quiet for a day, quota
  resets daily, no spend possible on the free tier) — plus a cheap global
  per-instance daily send cap as a second layer. Recorded in the phase guide.
- **pdfjs worker (M7):** the Vite `?url` worker asset must be verified served
  under adapter-netlify's static output at implementation (binding verify step
  in the plan).

## 4. Architecture

```
profile.json ──(build: scripts/generate-vfs.ts)──▶ static/json/hard_drive.json
     │                                             src/lib/seed_version.ts
     │ (runtime imports)                                    │ boot: version mismatch
     ▼                                                      ▼
about_me / contact_me / pdf_viewer / portfolio_viewer  seed.ts re-seed + D3 merge
     │ contact form POST                               (IndexedDB via idb-keyval)
     ▼
/api/email/+server.ts (prerender=false → Netlify Function) ──fetch──▶ Resend API
```

New programs (each: work_space branch + program component, standard
`Window`/`accessors`/`destroy` contract): `portfolio_viewer.svelte`,
`about_me.svelte`, `contact_me.svelte`, `pdf_viewer.svelte`. New lib modules kept
small (§ file-organization): `scripts/generate-vfs.ts` (+ pure helpers in
`src/lib/vfs_gen/` so Vitest covers them without a build), `src/lib/seed.ts`
gains the merge function, `src/routes/api/email/+server.ts` + pure validation/
rate-limit helpers in `src/lib/server/email/`.

## 5. Error handling

- Generator: throws on schema violations, duplicate slugs/ids, dangling
  parent/child — build fails loudly, nothing half-written.
- Boot re-seed: on seed fetch failure, keep the cached drive (Phase-1 behavior
  preserved); merge failures fall back to plain new-seed (never a broken drive).
- Contact form: every failure path surfaces an XP dialog (validation, 4xx/5xx,
  429 friendly-rate-limit, network); server logs details, client sees generic
  messages (§ error-handling / no data leaks).
- CV viewer: pdfjs load/render failure → in-window XP error pane with the
  Download button still functional (the PDF asset itself is static).
- `/api/email` never echoes input back; responds `{ ok }` / `{ error: code }`
  envelope only.

## 6. Exit criteria (maps §9 Phase 2)

1. Explorer root shows Experience/Projects/Education/Skills/Certifications/
   Awards; every entry opens a detail window with content (and gallery when
   images exist) — all sourced from profile.json.
2. About Me, My CV, Contact Me open real apps from desktop + start menu;
   placeholders remain only for Phase 3/4 apps.
3. A visitor message arrives in Mohamed's inbox (verified on deploy preview);
   abuse guards active; failures show XP dialogs.
4. `npm run build` regenerates the seed; editing profile.json + rebuilding
   re-seeds returning visitors while their own files survive (D3).
5. Zero hardcoded personal content in components; gates green (check / lint /
   unit / build / E2E / diff-cover).

## 7. Gate-2 red-team disposition

Fresh-context red-team verdict: **APPROVE WITH FIXES** (D3 Weak — merge
under-specified; D1/D12 Weak — heterogeneous rendering + E2E gaps; 12 findings +
7 missing sub-decisions). Disposition: **all findings verified against the code
and accepted** — F1/F2/F3 (D3 merge contract rewritten), F4/F5/F10/M3 (D2
determinism/id-coupling/prettier notes), F6/F7/M2/M4/F9 (D1 binding details),
F8 (D9 entry protection), F11 (D11 corrected — `Project` type already exists),
F12 (D6 renamed `pdf_viewer` + fallback), M1/M5/M6/M7 (new D14) — except one
partial rejection: F10's "CI lacks a freshness step" framed a planned addition
as a defect (the spec already mandated the step; the prettier interaction it
found was real and is incorporated).
