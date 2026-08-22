# Red team — everything after Phase 2

Range `a7dd589..dev` (63 commits, 131 files, +10967/−650). `a7dd589` is
"gate-6 review fixes + phase-2 guide (#34)", the commit that closed Phase 2.
Deliberately includes the ~34 commits already on `main` as well as the
undeployed pile: those shipped per-PR and were never gate-6'd as a body.

Run per SPECIFICATION.md §11 gate 6 (code review + security review) plus the
§11 visual parity standard. Five fresh-context lenses, each instructed to find
problems rather than validate, each given the prior findings in
`session-handoff.md` §8 so it could not re-report them. Every finding below was
independently reproduced before being written down; the visual ones were
confirmed by looking at the screenshots, as §11 requires.

**Nothing here is deployed.** Production is on the 26 Jul bundle.

---

## The pattern, named for the sixth time

Three lenses independently arrived at the same root cause, and it is the one
this project keeps hitting: **a rule is applied at one call site and its
siblings are left alone.**

| Rule | Applied to | Left alone |
| --- | --- | --- |
| Narrow the global selection | `copy`, `cut`, delete, rename | `paste` |
| Re-validate a URL from an untrusted page | meta-refresh hops | HTTP redirects |
| Branch on shell-vs-web favourite | the Favorites **menu** | the Favorites **sidebar** |
| Filter `hidden_items` | viewer, search panel | folders tree |
| Use the shared icon resolver | 5 surfaces | IE sidebar, search panel |
| Skip dangling child ids | `folder_size`, `create_shortcut`, viewer | `properties.svelte` |

The counter-measure is not another review pass. It is making the wrong thing
unrepresentable — a single typed entry point per operation, so a missed call
site is a type error rather than a runtime hang.

---

## A. Security — external attacker (`/api/browse`)

**A1 · CRITICAL — the SSRF guard is blind to IPv6 and to trailing dots.**
`src/lib/server/browse/url_guard.ts:16-40`. `is_blocked_ip` returns early
unless the hostname matches dotted-quad IPv4. Reproduced by replicating the
guard:

```
ALLOWED  [::ffff:a9fe:a9fe]          http://[::ffff:169.254.169.254]/   (metadata)
ALLOWED  [::ffff:7f00:1]             http://[::ffff:127.0.0.1]:9001/    (Lambda runtime API)
ALLOWED  localhost.                  ALLOWED  metadata.google.internal.
ALLOWED  [::]  [fd00::1]  [fe80::1]  100.64.0.1
BLOCKED  169.254.169.254  2130706433  0177.0.0.1  evil.com@169.254.169.254
```

The decimal/octal/userinfo forms ARE blocked — WHATWG normalises them before
the check. The guard is correct for what it parses; IPv6 is simply invisible.

**A2 · CRITICAL — no post-resolution check, so DNS defeats the guard entirely.**
The check runs on a *string*. `?url=http://ssrf.attacker.tld/` whose A record
is `169.254.169.254` passes, as does classic rebinding (the guard's lookup and
`fetch`'s lookup are separate resolutions). No blocklist can close this.

**A3 · CRITICAL — `redirect: 'follow'` re-validates nothing.**
`src/routes/api/browse/+server.ts:54`. The guard runs once, on the caller's
string; up to 20 redirects are then followed unchecked. The meta-refresh hops
directly below DO re-validate every hop, with a comment explaining why — the
HTTP sibling never got the same treatment.

**A4 · HIGH — the "not an open relay" gate is a client-supplied header.**
`+server.ts:81-97` falls back `Sec-Fetch-Site` → `Origin` → `Referer`.
Browsers are genuinely constrained (`Sec-Fetch-Site` is unforgeable);
scripted clients are not constrained at all, which is exactly the SSRF
attacker's tooling. This is what makes A1–A3 zero-victim attacks.

**A5 · HIGH — a proxied page can spoof the address bar into Favorites and shortcuts.**
`internet_explorer.svelte:434-458`. The `navigated` guard requires
`data.requested === nav_history[page_index]` — but the page can read its own
`location.search` to recover exactly that value. It can then announce
`url: 'https://www.paypal.com/signin'` while its own HTML stays on screen.
Add to Favorites and Create Desktop Shortcut both read `address_text`, so the
lie is persisted to localStorage and into the VFS.

*Note: anything the frame can read, the page can read. A nonce does not fix
this. The fix is to stop trusting the frame for the landing URL — e.g. only
accept a redirect announcement within the same registrable domain.*

**A6 · HIGH — the size cap runs after the body is already buffered.**
`+server.ts:133`. `await upstream.arrayBuffer()` completes first; `MAX_BYTES`
then rejects. An attacker streaming gigabytes of `text/html` for the full 10s
window is paid for in full, up to 4× per request with the hop budget.

**A7 · MEDIUM — the daily spend cap is dead code.**
`+server.ts:29-32` configures `global_per_day: 5000`, but only
`limiter.allow(ip, …)` is called at `:105`. `allow_send()` — the layer that
implements the daily cap, and which `/api/email` does call — is never invoked.
Per-IP buckets also reset per cold start and are per-container.

**A8 · MEDIUM-HIGH — the same-origin sandbox rule is a defeatable prefix test.**
`internet_explorer.svelte:285-295`. `startsWith('/') && !startsWith('/api/browse')`
is satisfied by `/api/./browse?url=…` and `//host/api/browse?url=…`, both of
which resolve back to our proxy — granting `allow-same-origin` to third-party
HTML. No remote trigger found (both message types are gated on `^https?://`),
so it needs the user to type or open a crafted address.

**A9 · MEDIUM — upstream headers pass through a denylist, not an allowlist.**
`+server.ts:194-199`. `set-cookie`/CSP/XFO/HSTS are stripped; `clear-site-data`,
`content-disposition`, `refresh`, `link` and `access-control-allow-origin` are
not. `Clear-Site-Data: "storage"` on a response served from our origin would
wipe the visitor's localStorage and the whole IndexedDB VFS. *Flagged as
needing a browser check that this pass could not run.*

**A10 · LOW — the non-HTML branch is an open redirect and an SSRF status oracle.**
`+server.ts:126-131` emits `302 Location: upstream.url`. A multiplier on A1–A3.

### Could NOT be broken (with the reason)
Reporter `</script>` breakout — every string reaching `JSON.stringify` is a
WHATWG-serialised URL, so `<`/`>` are percent-encoded and `\` normalises.
`javascript:`/`data:` via postMessage — rejected by `^https?://`. Cross-window
message forgery — `event.source !== iframe.contentWindow` is object identity.
Cross-site browser access — `Sec-Fetch-Site` plus `referrerpolicy="no-referrer"`.
`raw=1` — forced `text/plain` + `nosniff`, and it builds its own headers so A9
does not reach it. Stored XSS from the VFS — no `{@html}`/`innerHTML`/`srcdoc`
anywhere; user `.html` opens via `blob:`, which never gets `allow-same-origin`.
Rate-limit key forgery — `context.ip`, not `X-Forwarded-For`. `/api/email`.

---

## B. Data loss and corruption — no attacker required

**B1 · HIGH — every user-created shortcut is destroyed by the next deploy.**
`fs.ts:156` mints `storage_type: 'fake'`; `seed.ts:30` carries only
`storage_type === 'local'`. `create_shortcut` is new in this range;
`merge_on_reseed` predates it and its own test asserts the opposite behaviour.
The visitor's uploads survive and their shortcuts vanish — the worst possible
signal. **Fix by provenance, not by `storage_type`**: that field says where the
bytes live, never who authored the item, so the same hole reopens for the next
item kind.

**B2 · HIGH — `fs.paste()` was left unscoped when `copy`/`cut` were fixed.**
`desktop_folder.svelte:347`, `viewer.svelte:493`. The desktop's `is_focus`
survives a `.context-menu` click (`click_outside` exempts it) and right-click
fires no `click`, so one Ctrl+V reaches both handlers: the file lands in the
Explorer folder AND on the desktop. With Cut the second handler then throws on
the already-deleted id.

**B3 · HIGH — the clipboard is never cleared after a cut.**
`fs.ts:69-70` — `clipboard.set([])` is commented out and `clipboard_op` is
downgraded to `'copy'`. After a cut+paste the clipboard still holds a deleted
id and Paste stays enabled; clicking it throws `required()` out of the menu
handler. Every new surface in this range reads that same store.

**B4 · HIGH — IndexedDB blobs are never deleted, and the failure is silent.**
`del_fs` never calls `idb.del` (`del` is not imported anywhere in `src/`), and
`desktop.svelte:24` does `void set('hard_drive', …)` with no `.catch`. Deleted
uploads leak their bytes forever; once quota is hit, every subsequent write
rejects into a `void` and the user's files vanish on reload with no error.

**B5 · HIGH — a corrupt or unreadable drive bricks the boot with no recovery.**
`starting.svelte:178-179` and `:218` sit *outside* the try. Blocked site data
(private browsing) or one malformed cached item throws in `onMount` →
`core_ready` never set → `data-boot-skippable="false"` → permanent black screen,
and the skip affordance is dead because `skip_boot` returns early. Only DevTools
can recover it.

**B6 · MEDIUM — Ctrl+X on a protected item duplicates the portfolio tree.**
The right-click menu hides Cut for protected items; `clip()` applies no such
filter, and `del_fs` silently no-ops on protected ids. Keyboard cut+paste
therefore clones `Experience` and all six entries, once per repeat.

**B7 · MEDIUM — async item creation orphans items and blobs.**
`fs.ts:271-315`, `copier.svelte:52-60`. The item is inserted by one store
update and linked into its parent by a second, with an `await` between. Delete
the destination mid-copy and `required()` throws: the item persists with a
parent that does not list it, its blob is leaked, and the Copying window is
stuck on screen because `destroy()` never runs.

**B8 · MEDIUM — `favorites.ts` touches localStorage unguarded.**
`:79`, `:82`, `:97`. The `typeof localStorage === 'undefined'` guard misses the
case that matters: with site data blocked the *getter itself* throws, so
opening My Computer evaluates the module and the window never appears.

**B9 · MEDIUM — Explorer `up()` and the void menu throw when another window
deletes the current folder.** `my_computer.svelte:808-814`, `CMFSVoid.ts:30-34`.

**B10 · LOW — `migrate_files_format` runs after `merge_on_reseed`**, which
reads `.children` on raw cached items; the merge's own catch falls back to the
plain seed, i.e. total loss of the visitor's files, behind a `console.error`.
Latent today, a live trap for the next field the migration must backfill.

---

## C. Regressions introduced by earlier fixes in this same range

**C1 · MEDIUM-HIGH — `Dialog.svelte:35-36` uses document order as a proxy for
stacking.** Dialogs mount into their own window's node (or `document.body`);
windows stack by CSS `z-index` and never reorder the DOM. So Escape can cancel
a dialog buried behind the one on screen. This failure mode did not exist
before the fix — previously Escape simply fell through.

**C2 · MEDIUM — the F5 modal guard went global.** `my_computer.svelte:157`
queries `document.querySelector('.dialog')`. It was changed from a window
subtree query to catch the `#desktop`-mounted no-association dialog; it now
lets a dialog in ANY window kill F5 in the focused one — including the
once-per-visit File Transfer guide sitting unacknowledged in a background
Explorer.

**C3 · the empty-narrowing rule left the clipboard with no writer that clears
it** — see B3.

Both C1 and C2 are the same mistake: reaching for a global query to fix a
scoping miss, where the right answer is a real ownership/z-order check.

---

## D. Correctness

**D1 · HIGH — IE's Favorites *sidebar* opens shell favourites as URLs.**
`internet_explorer.svelte:911` calls `load_page(fav.url)` unconditionally while
the Favorites *menu* branches on `is_shell_favorite`. Clicking a favourited
folder sends `C:\Experience` down the URL path, `fs.get_file` on a folder
throws inside an unawaited promise, and the window is left on a blank frame
with the throbber stuck on and no escape but Back.

**D2 · MEDIUM — IE's window shortcuts fire in every IE window regardless of
focus.** `:616` → `:376` has no `z_index` guard, while every other keyboard
surface in the app has one. Ctrl+L in Contact Me yanks focus into a buried IE
window; Alt+←/→ and F5 hit every open IE.

**D3 · MEDIUM — folder Properties throws during mount** and leaves a permanent
wait cursor over the desktop. `properties.svelte:105` iterates a snapshot's
`children` through the throwing `drive_item`; three sibling call sites filter
dangling ids for exactly this reason.

**D4 · MEDIUM — File > Create Shortcut at the My Computer root writes the
`.lnk` where the user cannot see it** (`C:\`, which the root view does not
render). Nothing changes on screen; repeat it and copies accumulate silently.

**D5 · MEDIUM — IE's `refresh()` timer is outside the `nav_seq` guard**
(`:264-271`), so a refresh started within 50ms of a navigation resurrects the
previous page while the address bar and history say otherwise.

**D6 · LOW — two icon call sites never converted** (`internet_explorer.svelte:916`
hardcodes `URL.png`; `search_panel.svelte:100` rolls its own fallback), so the
"favourited files show their own icon" fix is undone on those two surfaces.

---

## E. Tests that cannot fail

The sixth, seventh… instances of a documented pattern. Each is stated with the
broken implementation that would still pass.

**E1 · HIGH — the SECURITY sandbox test asserts from a state that already
satisfies it.** `ie_url_sync.spec.ts:47`. IE's homepage is external, so the
frame is already proxied and already lacks `allow-same-origin` when IE opens.
Make `go_to_address` a no-op for external URLs and the test still passes. Only
the *granting* direction is load-bearing.

**E2 · HIGH — the boot-skip test's budget exceeds the sleep it skips.**
`smoke.spec.ts:63-73` allows 10s; the unskipped boot shows login at ~3s. Delete
the skip handlers entirely and it stays green — while all 91 specs silently pay
the cost again. §8 claims this test guards the affordance; it does not.

**E3 · HIGH — the "greyed means inert" tests never click.**
`file_menu_safety.spec.ts:28-51` (and three siblings) assert `text-slate-400`
and that an item still exists — but Delete was never clicked. Hardcode the
class while leaving the action live and the test passes while File > Delete
still destroys the desktop icon.

**E4 · HIGH — an assertion that can never match.** `file_menu_safety.spec.ts:70`
uses `input[value*=".txt"]`, an *attribute* selector; Svelte assigns the
`value` *property* and never calls `setAttribute`, so the count is 0
unconditionally.

**E5 · HIGH — the window-rect clamp test cannot distinguish "clamped" from
"never restored".** `window_rect.spec.ts:45-48`.

**E6 · MEDIUM — all three Go-arrow tests pass with a hardcoded destination**
(`explorer_go.spec.ts`), and test 3 asserts a string that was already on screen
before the click, with no wait.

**E7 · MEDIUM — `rename_latch.spec.ts` is the one file the `fill()` audit
missed** — every `fill()` is un-preceded by a `.click()`, the exact trap §6
records as having hidden a live bug.

**E8 · MEDIUM — the rewritten cross-window delete still never asserts its
precondition** (that the selection holds two ids at right-click time).

**E9 · MEDIUM — live third-party network in the e2e suite.** Every IE spec but
one loads `wiby.me` through the real `/api/browse`; one also fetches
`example.com`. A plausible contributor to the flake §8 attributes to machine
load.

**E10 · MEDIUM — `xp_chrome_d.spec.ts:109` uses `toContainText('')`**, true of
every element — a no-op wait.

*Genuinely well covered (verified): the #96 redirect-replaces-append rule, the
right-click Delete scoping and mixed-batch permanence, the KB-vs-adaptive Size
split, the TZ pin, the meta-refresh hop tests including per-hop SSRF
re-validation, `scoped_ids`, `visible_trail`, the favourite-icon resolver.*

---

## F. Visual parity (§11 standard, ~45 screenshots at 1280×800)

Evidence under the session scratchpad `shots/`. The lens declared one
limitation up front: headless Chromium uses overlay scrollbars, so no
screenshot in this pass can show a scrollbar, and no "missing scrollbar"
finding was reported.

**F1 · HIGH — Details collapses the Name column to a single letter when the
window is narrowed.** `viewer.svelte:65` (`Details: 'w-full …'`) — the row can
never exceed the scroller, so the flexible name cell absorbs all the loss.
Verified in `71-window-small.png`: nine filenames rendered as `N M E P E S C A M`
while Size/Type/Date keep full width and the header reads "Date Modifiec". XP
keeps column widths and scrolls horizontally.

**F2 · HIGH — Thumbnails clips a long name at BOTH ends with no ellipsis.**
Verified in `80-zoom-thumb-longname.png`: `Mohamed_Abdelnasser_Resume.pdf`
renders as `med_Abdelnasser_Resun`. Thumbnails is the only column-flex box, so
the label sizes to `max-content` and the parent `overflow-hidden` cuts it
symmetrically. The same label wraps correctly in Icons.

**F3 · HIGH — the Folders bar lists the three folders every other surface
hides.** `folders_tree.svelte:14-26` does not filter `hidden_items`, so
Desktop, Recycle Bin and Wallpapers appear in the tree while the pane beside it
shows none of them.

**F4 · HIGH — every folder shows the *drive's* task pane, clipped to a
half-height stub.** `sidebar.svelte:25-60`. XP shows File and Folder Tasks
first in a folder; here System Tasks is shown and "File and Folder Tasks" is
third, so its caption is sliced by the status bar and all its links are
off-screen. Present in every folder screenshot.

**F5 · MEDIUM — three of the five view modes are the wrong shape.** XP Tiles is
a 48px icon with bold name plus two subtext lines; here it is a smaller Icons.
XP Icons is label-below; here that is what Thumbnails renders.

**F6 · MEDIUM — the Folders-tree expander is unreadable on the selected row**
(1.47:1, `text-slate-600` on `bg-blue-600`) — the only control that toggles the
tree, invisible while the row is selected.

**F7 · MEDIUM — menu separators are invisible** (1.09:1), so the View menu
reads as one flat 11-row list instead of XP's four groups. Same menu: ✓ where
XP uses a radio bullet, no icon gutter, no accelerator column, 24px rows
against XP's 19px.

**F8 · MEDIUM — List view flows row-major; XP flows column-major.**

**F9/F10 · LOW — IE and Explorer use two different menu idioms**, and dialog
group boxes are inconsistent between Internet Options and System Properties.

### Parity estimate against the ≥95% bar

| Surface | Est. | Passes |
| --- | --- | --- |
| Boot / login / welcome / desktop / taskbar / Start menu | 96-98% | yes |
| Window frames, title bars, tabbed dialogs | 95-96% | borderline |
| Explorer Bars (Search/Favorites/History) | 94% | borderline |
| Folders bar | 85% | **no** |
| Menus + context menus | 90% | **no** |
| Explorer task pane | 82% | **no** |
| Details, default window | 95% | yes |
| Details, narrowed window | 70% | **no** |
| Thumbnails / Tiles / Icons / List | 75-80% | **no** |
| IE chrome + Internet Options | 90% | borderline |

Inherited surfaces (boot, desktop, taskbar, Start menu) show **no drift** —
the §11 "do not regress" requirement is met. The failures are all on surfaces
this work created or touched.
