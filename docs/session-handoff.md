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
| Refresh (+F5) | `viewer.refresh()` — bumps a nonce that rides in the sort hash, because the sort worker memoises on it |

Two things worth remembering from that work:

- `data-menu` on menu-bar entries and `data-history-idx` on History rows exist
  because "Favorites"/"Search"/"Folders" now appear in BOTH the menu bar or
  toolbar and a submenu — text-only locators went ambiguous and broke four
  specs. Hidden submenus are still in the DOM, so `getByText` matches them.
- The My Computer root list is now reactive; it used to be a `const` frozen at
  mount.

**Next open question:** nothing pending on the View menu. See §2 — the deploy is
the outstanding item.

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

`dev` is **18 commits ahead of `main`** and all of it is unreleased. The user
chose to hold a single cutover PR (`dev` → `main`) until just before deploying.

Netlify build settings were set to `allowed_branches:["main"]` + `skip_prs:true`
to stop PR previews burning credits — so **no deploy previews exist**; verify
locally.

---

## 3. WHAT SHIPPED THIS SESSION (all merged to `dev`, none deployed)

PRs #77–#93. Highlights:

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
npx vitest run       # 194 tests
npm run build
npx playwright test  # 72/72
```
