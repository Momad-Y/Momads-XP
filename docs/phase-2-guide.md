# Phase 2 Guide — Portfolio Content Apps

> Handoff per `SPECIFICATION.md` §11. Spec: `docs/superpowers/specs/2026-07-18-phase-2-content-apps-design.md`. Plan: `docs/superpowers/plans/2026-07-18-phase-2-content-apps.md`. Shipped via PRs #28–#33 + gate-6 fixes.

## 1. Phase summary

**Implemented:** `profile.json → VFS` generator (`scripts/generate-vfs.ts` + pure builders in `src/lib/vfs_gen/`; deterministic ids/timestamps; **auto SEED_VERSION** written to generated `src/lib/generated/seed_version.ts` — hand-stamping retired; CI freshness step regenerates and `git diff --exit-code`s); **re-seed merge** (`merge_on_reseed` in `src/lib/seed.ts` — visitors' `storage_type:'local'` files survive content updates, relinked into surviving parents; verified live in a browser); six portfolio folders (Experience/Projects/Education/Skills/Certifications/Awards) at the Explorer root via the `my_computer` list, entries are protected `.txt` files with generator-stamped `portfolio_ref` opened by the new **portfolio_viewer** (section-aware details, tech chips, external links, conditional gallery); **pdf_viewer** (pdfjs-dist v6, bundled worker, zoom with render-token guard, Download; `.pdf` doctype + desktop `My CV.exe` fallback to `meta.resumePdf`); **About Me** (Explorer chrome, XP sidebar panels from profile.json, My Projects deep-link into the Explorer, My Resume); **Contact Me** (Outlook-style, XP dialogs) posting to **`/api/email`** (Netlify Function via `prerender=false`; Resend over plain fetch; §6.8 hardening: Origin *with Referer fallback*, 32KB cap, per-IP token bucket, global 50/day cap consumed **only by real sends**, honeypot answered with fake 202, 3s min-fill-time with a friendly 422 dialog). E2E grew 12 → 20 specs.

**Deferred:** CMD/Python/Paint-custom/Music (Phase 3), games (Phase 4), IE chatbot (Phase 5), sound manager (Phase 6). Placeholders remain only for those.

## 2–5. Setup / env / config

- Commands unchanged plus **`npm run generate:vfs`** — run after ANY `profile.json` edit; never hand-edit `static/json/hard_drive.json` or `src/lib/generated/*` (CI freshness step fails on drift). `scripts/vfs-base.json` is the frozen inherited-shell input (prettier-ignored; edit only for deliberate shell changes).
- New deps: `pdfjs-dist` (runtime), `tsx` (dev, runs the generator). npm-10 locks still mandatory.
- **Env vars (Netlify site `momad-xp`): `RESEND_API_KEY` — provisioned** (see §7). Optional `EMAIL_FROM` (defaults to `onboarding@resend.dev`; empty string counts as unset).

## 6. profile.json

Drives everything, now including My Computer content. **`projects` (6 entries) is a DRAFT authored from public GitHub repos + resume-implied work — Momad must review/edit the copy** (`src/lib/data/profile.json`, `"projects"`). `images` arrays are empty until real photos land in `static/assets/images/` (galleries render only when non-empty). Duplicate titles within a section are safe (ids are index-suffixed). Editing → `npm run generate:vfs` → returning visitors re-seed while their own files survive (visitor *copies* of seed items are NOT carried — documented D3 trade-off).

## 7. Deployment + Resend

Netlify unchanged (production = `main`). **`RESEND_API_KEY` is provisioned** (owner-authorized 2026-07-18): sending-only key `momads-xp-contact` created in Resend, stored as a **regular-class** Netlify env var on `momad-xp` (all contexts/scopes; secret-class writes silently fail on this plan — verified with a probe var; regular class is still server-side-only, value visible in the Netlify dashboard; owner approved 2026-07-18). Env-var changes only reach the function on the next deploy — this doc change triggered that production rebuild. Delivery smoke-test recorded below. Note: with no verified domain, the `onboarding@resend.dev` sender only delivers to the Resend account owner's email; verify a domain + set `EMAIL_FROM` if the account ever moves.

## 8. Functional checklist

- [x] Explorer root: six portfolio folders; entries open section-aware detail windows (3 heterogeneous sections E2E-covered)
- [x] About Me / My CV / Contact Me real from desktop + start menu (all sites flipped); Phase-3/4 placeholders intact
- [x] Re-seed merge: stale-version boot carried a user desktop file, relinked + rendered (live browser verification); offline stale cache degrades gracefully (no `required()` crash)
- [x] `/api/email` hardening unit-tested (21 tests incl. handler via `$env` mock); E2E mocks the endpoint (vite preview runs no server routes)
- [x] Live email delivery — verified against production after key provisioning (see §7)
- [x] Gates: check 0 errors · lint clean · 68 unit · build (function + pdf worker emitted) · 20/20 E2E · diff-cover green on slice PRs

## 9. Visual parity report

1280×800 vs `design/inspiration/about-me.png` / `email.png`: structure, panels, toolbar, fields, status bar match (≥95%); our assets/copy exempt per spec. Contact Me gained the reference's cut/copy/paste toolbar stubs at gate 6. Evidence: `design/research/phase2-parity-{about-me,contact-me}.png` (local, untracked).

## 10. Notes & gotchas

- Gate-6 review verdict MERGE WITH FIXES → applied: pdf zoom render-token guard (+ `task.destroy()` — it lives on the loading task, not the doc proxy); global daily cap moved to `allow_send()` right before the Resend fetch; Referer fallback for privacy browsers; index-suffixed entry ids; 422 "too fast" dialog copy. Rejected with rationale: hiding the owner email in the To field (the reference design shows it; it's already public in the served resume PDF).
- `$lib/server/*` cannot be imported by client code (SvelteKit guard, build-time error) — shared caps live in `src/lib/email_limits.ts`.
- vitest can't resolve `$env/dynamic/private` — endpoint tests `vi.mock` it before importing `+server.ts`.
- pdfjs-dist v6 API: `getDocument({ url })` (object, not string) and `render({ canvas, viewport })`.
- The Explorer shows a one-time "File Transfer" dialog on first folder entry — E2E must dismiss it (`e2e/my_computer.spec.ts` `enterFolder`).
- Long `style:` values in Svelte must be mustached (`style:background={'...'}`) or prettier line-wraps them and svelte2tsx fails — see `about_me.svelte` / `my_computer/sidebar.svelte`.
- New icons (`TXT.png` etc.) are deliberately NOT preloaded (lazy-load accepted; no preload-manifest churn).
- Resend free tier ≈100 emails/day; in-memory limits reset on cold starts — accepted for a portfolio (worst case: quiet contact form for a day, no spend possible).

**Carry-over (owner-requested):** svelte-check's 131 inherited warnings are explicitly scheduled for zero in Phase 6 (SPECIFICATION.md §9 Phase 6 checklist) — new code must not grow the count meanwhile.

**Phase 2 is complete.**
