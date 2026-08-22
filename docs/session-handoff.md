# Session handoff — post-Phase-2 chrome work

Written at the end of a long session so the next one can resume without
re-deriving anything. Read this first, then `docs/phase-2-guide.md`.

---

## 1. DONE — the View menu has no dead entries left (PR #93)

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

## 2. DEPLOY — check this first, the block may have lifted

Production has been stuck on the **26 Jul** bundle. Netlify's "Momad's team"
(Free, slug `momady`, site `73331ef4-01f7-4fc4-9848-f22261cc9dab`) returned:

> 403 — Account credit usage exceeded — new deploys are blocked until credits
> are added

The user chose to wait until **~10 Aug 2026**. That date has now passed, so:

1. Check <https://app.netlify.com/teams/momady/usage> — did credits reset, or is
   a payment method still required?
2. If unblocked, deploy the **prebuilt** output (already logged in via
   `npx netlify login`):
   ```
   npm run build && npx netlify deploy --prod --dir=build --no-build \
     --site 73331ef4-01f7-4fc4-9848-f22261cc9dab
   ```
3. Verify prod: `help.html` → 200, index bundle hash changed from
   `start.2JH2ogIg.js`, security headers present.

`dev` is **25 commits ahead of `main`** and all of it is unreleased. The user
chose to hold a single cutover PR (`dev` → `main`) until just before deploying.

Netlify build settings were set to `allowed_branches:["main"]` + `skip_prs:true`
to stop PR previews burning credits — so **no deploy previews exist**; verify
locally.

---

## 3. WHAT SHIPPED THIS SESSION (all merged to `dev`, none deployed)

PRs #77–#97. Highlights:

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
npx vitest run       # 252 tests
npm run build
npx playwright test  # 90 (~1 boot flake per run under parallel load)
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

**Known suite instability, not a product bug.** The e2e suite now flakes about
one spec per full run — always `bootToDesktop` timing out at 30s, never the same
spec twice, always green in isolation. Boot is ≥3s by design plus asset
preloading and 8 workers contend. It will eventually redden CI on an unrelated
change; the options are a CI retry, fewer workers, or a shorter boot under test.
The user has not chosen one, so nothing was changed.

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
