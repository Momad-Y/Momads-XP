# Session handoff — Phase 2 closed out, Phase 3 next

Read this first, then `docs/redteam-post-phase-2.md`, then
`docs/phase-2-guide.md`. §1 is the live task; everything after it is the
record of how Phase 2 got here and the rules that must not be undone.

---

## 1. NEXT UP — Phase 3, on the owner's "go"

Phase 2 is closed out and deployed (§2). **Phase 3 is specced but not started.**
The owner will say "go"; until then, do not begin.

### Scope (SPECIFICATION.md §9, Phase 3 — "Developer & Interactive Apps")

- **CMD** — xterm.js terminal, intro message, `help`/`about`/`skills`/
  `experience`/`whoami`, output read from `profile.json`; easter eggs
  `matrix`, `hack`, `sudo`
- **Python REPL** — Pyodide 3.13.x in-page via a pinned CDN, replacing the
  base's pyodide.org iframe
- **Paint** — the bundled jspaint kept in Phase 0, wrapped in XP chrome, or a
  custom Canvas app
- **Music Player** — local tracks, play/pause/next/prev, volume, seek, track
  list, Canvas visualizer (§3.2 records WHY the Spotify embed cannot satisfy
  this: no volume control, no audio-stream access)

**Exit criteria:** all four functional and styled authentically.

### The six gates (SPECIFICATION.md §11) — run in order, back to back

1. **Spec** the phase (superpowers brainstorming first), output a written
   phase spec: scope, exit criteria, sub-decisions each with for/against
2. **Red-team the spec** — fresh-context subagent, find-problems framing:
   scope gaps, hidden sub-decisions, cross-decision conflicts, wrong assumptions
3. **Plan** — files, order, test strategy, risks
4. **Red-team the plan** — sequencing, missed dependencies, untestable steps,
   regressions to inherited surfaces
5. **Implement** — TDD on `feature/*` off `dev`, CI-gated PRs into `dev`
6. **Red-team the implementation** — code review + security review on the diff,
   plus the §11 visual parity loop (screenshots at 1280x800, >=95%), then the
   `docs/phase-3-guide.md` handoff

**Autonomy rule (§11):** the gates run back-to-back WITHOUT pausing for
approval between them. Stop only for owner-level things — destructive or
irreversible actions beyond the plan, scope changes, account/credential/spend
decisions, or a red-team finding that invalidates a locked decision.

### Carry these constraints into Phase 3

- Read `docs/redteam-post-phase-2.md` first — 43 findings, what was fixed, the
  rules that must not be undone, and one finding explicitly REJECTED.
- **Probe the running deploy.** Two security holes survived 306 unit tests, 92
  e2e tests and five red-team lenses, and only fell to curling the live
  function — one of them only on production, because drafts are not cached the
  same way.
- The recurring root cause, now at SEVEN instances: a rule applied at one call
  site while its siblings are left alone. When adding a rule, enumerate every
  call site.
- New e2e specs must not reach the internet — use `e2e/stub_browse.ts`.
- Phase 3 adds heavy deps (xterm.js, Pyodide). npm 10 locks are mandatory:
  after ANY package.json change run `npx -y npm@10 install`.

---

## 1b. DONE — the View menu has no dead entries left (PR #93)

All 11 entries work. The 6 that were greyed were implemented together:

| Entry | Where it lives now |
| --- | --- |
| Toolbars ▸ | `show_standard_buttons` / `show_address_bar` / `show_links` in `my_computer.svelte`; the Links bar renders the web half of `$favorites` |
| Status Bar | `src/lib/status_bar.ts` + the bottom row; counts through `viewer.visible_ids`, never raw `selectingItems` |
| Explorer Bar ▸ | `left_panel` widened to include `favorites` \| `history`; new `favorites_panel.svelte` / `history_panel.svelte` |
| Choose Details… | `src/lib/details_columns.ts` + `my_computer/choose_details.svelte`, rendered INSIDE the window so two Explorers can differ |
| Go To ▸ | `go_to_submenu`, built off the same `history_entries` the Back/Forward dropdowns use |
| Refresh (+F5) | `viewer.refresh()` — bumps a nonce that rides in the sort hash. NOT for the worker's `cache` (that object is read but never written — dead code): the viewer only posts to the worker when `hash !== last_sort_tx_hash`, so without the nonce a Refresh nulls `sorted_items`, never re-posts, and the folder hangs on "working on it..." forever |

Worth remembering from that work:

- `data-menu` on menu-bar entries and `data-history-idx` on History rows exist
  because "Favorites"/"Search"/"Folders" now appear in BOTH the menu bar or
  toolbar and a submenu — text-only locators went ambiguous and broke four
  specs. Hidden submenus are still in the DOM, so `getByText` matches them.
- The My Computer root list is now reactive; it used to be a `const` frozen at
  mount. `folders_tree.svelte` was already reactive, so this removed an
  inconsistency rather than creating one.
- **Refresh must abandon an in-flight rename.** Tearing the item list down
  blurs the rename textarea and the blur handler COMMITS — so a reflex F5
  mid-edit silently saved a half-typed name. Fixed by calling
  `cancel_renaming()` from `refresh()`; covered by a test in
  `e2e/file_menu_safety.spec.ts`. This is the third time a fix landed on one
  call site and left a sibling path broken.

**Next open question:** nothing pending on the View menu. See §2 — the deploy is
the outstanding item, and §8 for the rules that came out of red-teaming this work.

---

## 2. DEPLOY — DONE. Production is current.

Deployed 2026-08-23 from `main` after the #106 cutover, plus #108 for the
cache-key fix. `main` and `dev` are level; the credit block that stopped the
28/30 July attempts is gone.

- Production: <https://momad-xp.netlify.app>, bundle `start.BtwIZKON.js`
  (was `start.2JH2ogIg.js` from 26 Jul)
- Netlify **auto-builds are OFF** (`stop_builds: true`) alongside
  `allowed_branches:["main"]` + `skip_prs:true` — every deploy so far has been
  prebuilt from the CLI (`deploy_source: api`), so this costs no build minutes.
  Deploy with:
  `npm run build && npx netlify deploy --prod --dir=build --no-build --site 73331ef4-01f7-4fc4-9848-f22261cc9dab`
- Reverse with `netlify api updateSite ... {"build_settings":{"stop_builds":false}}`

**Verified on production, not just locally:** boot -> login -> desktop -> start
menu -> Explorer C:\ -> Details (`61 KB`, `PDF File`, `9 objects`) -> IE
rendering the real wiby.me through `/api/browse`, with the iframe sandbox
reading `allow-scripts allow-forms allow-popups` — no `allow-same-origin`, no
`allow-popups-to-escape-sandbox`. Every SSRF form returns 400; every forged
origin returns 403; a legitimate same-origin request returns 200. Security
headers present.

**Two holes were found by probing the DEPLOYMENT that every local gate missed:**
`sec-fetch-site: none` was accepted (#105, found on a draft) and the CDN cached
an authorised response under a URL-only key (#107, found only on production —
drafts are not cached the same way). Neither the 306 unit tests, the 92 e2e
tests, nor five red-team lenses caught either. **Probe the running deploy.**

---

## 3. WHAT SHIPPED THIS SESSION (all merged to `dev`, none deployed)

PRs #77–#108. Highlights:

- **System Properties** — profile-driven content, all 4 tabs, dark-text logo.
- **Explorer File menu** — fleshed out to real XP (Open, Send To, New ▸, Create
  Shortcut, Delete, Rename, Properties, Close).
- **No fully-dead menus** — Folder Options + Internet Options dialogs, root
  Properties → System Properties.
- **Escape closes menus** (menu bar, context menus, Start menu, Views dropdown).
- **IE page proxy** (`/api/browse`) — external pages are served from our origin
  with a navigation reporter injected, so URL/history/shortcuts/favourites
  follow the page. See §5 for the security shape.
- **Favourites** — Explorer can favourite folders AND files; shared Organize
  Favorites dialog; folder/file favourites open in Explorer, web ones in IE.
- **View → Source** in IE (`/api/browse?raw=1` + Notepad-style `source_viewer`).
- **View modes greyed at the My Computer root**, where they do nothing.
- **The whole View menu works** — Toolbars, Status Bar, Explorer Bar, Choose
  Details…, Go To and Refresh; see §1.
- **De-duplication + a CRITICAL fix** — see §4.

---

## 4. THE RED TEAM AND WHAT IT FOUND (do not undo these)

A four-lens red team returned **DO NOT SHIP** with 2 CRITICAL + 4 HIGH, all in
the File-menu work. Root cause, named independently by two reviewers:
**window-scoped UI wired to app-global state/events, in components mounted once
per window.**

Fixed:

- `selectingItems` is ONE global store shared by the desktop and every Explorer
  window. The File menu now filters it through `viewer.visible_ids`, so it can
  never act on an item another window is showing.
- Delete decides recycle-vs-permanent **per item** (`plan_delete()` in
  `src/lib/delete_prompt.ts`). Collapsing it per-batch destroyed a live file
  outright while the prompt promised the Recycle Bin.
- **The right-click Delete had the identical bug** and was fixed later, in a
  separate pass — the lesson being that fixing one call site left the sibling
  broken. `CMFSItem.ts` now has unit tests (mock `mount` + `../Dialog.svelte`).
- `File > Open` routes through the viewer's dispatcher, not the navigate-only
  `open()`; `New ▸` is gated on the current item being a container.
- Escape cancels an inline rename instead of committing it.

---

## 5. `/api/browse` — the shape that must not be broken

- The IE iframe keeps `sandbox` **without `allow-same-origin`**, so a proxied
  page runs on an **opaque origin** and cannot touch localStorage/IndexedDB/the
  VFS. Research is explicit that same-origin + allow-scripts makes the sandbox a
  very weak boundary.
- The `real_url.startsWith('/')` rule that grants same-origin to app-owned pages
  **explicitly excludes `/api/browse`**. Removing that carve-out would hand every
  website on the internet our origin.
- Navigation is reported by an injected script over `postMessage`, validated by
  the parent (own frame only, http(s), ≤2048 chars).
- A late announcement from a page the user already left used to hijack the
  address bar; announcements are now ignored unless we are still on an external
  page AND the frame points at the page we intend.
- SSRF guards, same-origin-only via `Sec-Fetch-Site`, rate limits, 10s timeout,
  3MB cap, no cookies forwarded, upstream CSP/XFO stripped.

**Cost:** one function invocation per page navigation (HTML only; subresources
load direct via `<base>`). This is the first feature that spends Netlify
invocations per user action — watch it once deploys resume.

---

## 6. TRAPS LEARNED THE HARD WAY THIS SESSION

- **A leftover `npm run preview` makes Playwright test a STALE bundle**
  (`reuseExistingServer`). Symptom: new code "doesn't work" and unrelated tests
  fail together. `pkill -f "vite preview"` in its OWN bash call first.
- **`fill()` focuses WITHOUT dispatching a click**, so a fill-only test drives a
  path no user can take. It hid a live bug (Organize Favorites rename). Always
  `.click()` a field before typing. The whole suite was audited for this.
- **`.first()` / `.last()` re-resolve** — `.first()` grabs hidden menu items,
  `.last()` re-resolves to a window the click just created. Pin by index.
- **`locator.count()` does not auto-wait**; `click()`/`expect()` do.
- **The repo's "server routes don't run under `vite preview`" note is WRONG** —
  CI output contained wiby.me's real HTML fetched through `/api/browse`. Worth
  correcting in `CLAUDE.md`; the user was told and has not decided.
- **Stale ESLint cache**: `npm run lint` can pass while the pre-commit hook and
  CI (fresh runs) fail. Trust the hook.
- **Run `diff-cover` locally before pushing** — the gate rejected a push at 63%.
  `npx vitest run --coverage && diff-cover coverage/lcov.info --compare-branch origin/dev --fail-under 80`
- **Never sweep with a DOTALL regex** — a `console.log` cleanup ate whole
  functions (100 type errors). Match single lines only.
- Playwright specs live under E2E ownership; `.svelte` is exempt from
  diff-coverage, `.ts` is not — but extract *pure* logic to `.ts` and test it
  rather than hiding logic in components to dodge the gate.

---

## 7. GATE CHAIN (all green at handoff)

```
npm run check        # 0 errors / 128 warnings  (baseline 131 — do not grow)
npm run lint
npm run format:check
npx vitest run       # 306 tests
npm run build
npx playwright test  # 92 (CI ~3 min; ~1 local flake per 2-3 runs, see §8)
```

---

## 8. RULES THAT CAME OUT OF RED-TEAMING #93/#94/#95 (do not undo)

A four-lens red team on the View-menu work found 1 regression on shipped data,
6 HIGH and 9 MEDIUM — **none caught by CI**. The fixes are in #95. These four
are the ones most likely to be "helpfully" reverted later:

1. **XP's Details Size column is ALWAYS KB with thousands separators.** The
   status bar is the only surface that picks a unit ("13.01 MB"). They are not
   two drifted copies of one rule — they are XP's two DIFFERENT rules.
   Unifying them onto `format_size` re-spelled five shipped Desktop items and
   was reverted. `size_label` and `format_size` must stay separate.
2. **Escape must NOT close the Explorer Bar.** That was invented, not ported
   (XP uses the bar's ✕ or a Ctrl+E/I/H re-toggle). Because four
   `svelte:window` listeners each decide in isolation, it reached through an
   open dialog, collapsed the menu bar with the bar, and destroyed a typed
   Search query. `Dialog.svelte` owns Escape now: Escape IS Cancel, topmost
   dialog only.
3. **`fs.copy`/`cut` take a REQUIRED scope, and an empty narrowing leaves the
   clipboard alone.** Three surfaces bind window keydown, so one Ctrl+C can
   reach two handlers; blanking on empty destroyed what the other just copied.
4. **The F5 modal guard searches the whole document and fails CLOSED.** A
   subtree query missed the no-association dialog, which mounts into
   `#desktop`, and `undefined == null` let it refresh before mount.

5. **A redirect REPLACES the current history entry; it never appends** —
   `src/lib/nav_history.ts`. `/api/browse` follows redirects and the injected
   reporter announces where it LANDED, so appending made one visit two entries
   and Back returned to the URL that redirects, which redirected again. IE's
   Back button was dead on every redirecting site (#96). The reporter announces
   the REQUESTED url alongside the final one precisely so the parent can tell a
   redirect of the current page from a stale message sent by a page the user
   already left. `<base>` stays on the FINAL url — subresources must resolve
   against where the document really came from.
   `sync_url_from_iframe` still APPENDS on purpose: same-origin pages carry no
   reporter, so that is the only way an in-page link click is recorded.

**Known suite instability — measured, and NOT worker count (#98).** The e2e
suite flakes roughly one spec per two or three LOCAL runs, always green in
isolation. CI, on a dedicated runner, has never flaked.

The obvious hypothesis — too many workers on a 16-core box — was tested and is
WRONG. Full suite, per run:

```
8 workers + full boot   1 failure          2.9-4.4 min
8 workers + skip        4 failures         3.6 min
4 workers + skip        2 in 4 runs        2.6-4.0 min
2 workers + skip        1 in 3 runs        4.5-5.2 min   <- CI's exact config
```

Two workers still flaked, and `page.goto` ITSELF times out, so the failures
track overall machine load against the single `vite preview` process. Don't
"fix" it by tuning workers again — `workers: 4` locally is a SPEED choice
(fastest measured) and the config comment says so.

**What DID pay off:** `bootToDesktop` skips the 3-10s startup through the app's
own affordance (the boot screen skips on any click/keypress once the VFS seed
lands — `data-boot-skippable` mirrors that state). CI e2e went **5.4 min ->
2.9 min** with one more test. `smoke.spec` keeps `{ skip: false }` for the full
startup, and a test covers the skip path itself, because the whole suite now
depends on it.

**A full red team of everything after Phase 2 ran and its findings are FIXED
(#100-#104).** Read `docs/redteam-post-phase-2.md` before touching this code —
it records 43 findings across five lenses (code, security, visual, tests,
state), what was fixed, and the four things deliberately left undone with
reasons. The recurring root cause it names, now at SEVEN instances, is a rule
applied at one call site while its siblings are left alone.

**A finding that was REJECTED — do not "fix" it again.** The `rename_cancelled`
latch was reported as sticking across renames (premise: no blur fires for an
element removed while focused). It does not reproduce: removing the reset
leaves every rename test green, and forcing the latch to stick turns two red.
The reset in `rename()` is defensive only.

**Known coverage gap, deliberate.** The KB-vs-adaptive column rule has no E2E:
every file reachable in Explorer is under 1 MB, because the larger ones live in
the Desktop folder, which is in `hidden_items`. Both rules print "61 KB" there.
`details_columns.test.ts` covers it instead; the e2e comment says so.

**The test lesson, third time now.** Three of #95's claims were carried by tests
that could not fail — they drove a path that was ALREADY correct, or set up a
scenario where the guard degenerated to the identity function. Making the
cross-window delete genuinely load-bearing took three attempts: the second one
still passed because the chosen desktop item was PROTECTED, so `plan_delete`
dropped it regardless. Always revert the fix and watch the test go red.
