# CMD filesystem navigation — `ls`, `cd`, `pwd`, `cat` (pulled forward from Phase 6)

**Status:** plan, pending gate-2 red team.
**Scope:** the four `DEFERRED_COMMANDS` in `src/lib/cmd/registry.ts:59`, the
banner line §3.2 reserves for them, and the Tab completion they need.

Pulled out of Phase 6 because every prerequisite already shipped: the folder
tree exists in `static/json/hard_drive.json`, `resolve_portfolio_ref()` already
renders an entry, and `complete.ts` already has the `word_at` /
`candidates_for` split path completion drops into. Owner approved the pull and
chose path style **A** (Linux paths over the real drive).

---

## D1 — Which tree do the commands walk?

**Option A — the live `hardDrive` store (the drive Explorer shows).**
For: it *is* "the File Explorer folder tree from `profile.json`" that §3.2 asks
for, already generated and CI-freshness-gated; a file the visitor creates in
Explorer appears in `ls` a second later, which is the single thing that makes
the terminal and the desktop feel like one machine; `cat` gets its text from
the `portfolio_ref` the generator already stamps on every entry file.
Against: the commands can no longer be pure `(args, profile) => string[]` —
they need the drive passed in; folder names are Windows-shaped (`My Music`,
`Printerpix — AI Engineer.txt`), so paths are full of spaces and em dashes.

**Option B — a synthetic lowercase portfolio tree from `profile.json`.**
For: matches §3.2's literal examples (`/home/momad/experience`, `cat
printerpix`); single-word lowercase names are pleasant to type.
Against: a second filesystem that knows nothing about anything the visitor
creates, deletes or renames in Explorer — the desktop and the terminal would
disagree about what exists; duplicates a generated tree for no gain.

**Verdict: A.** Deciding factor: B forfeits live agreement with Explorer, which
is the whole illusion. The spaces-in-paths cost is real and D4 pays it.

## D2 — Path style

Settled by the owner: **Linux paths over the real drive** (`/c/Experience`),
git-bash style. `~` is the C: drive root, so `cd experience` works from the
first prompt — which is exactly what the banner promises. `pwd` prints the real
absolute path (`/c`), never `~`, as bash's does. Alternatives (Windows
`C:\Experience`; a synthetic `/home/momad`) were weighed with the owner before
the choice; see the session record.

## D3 — Where do the four commands dispatch from?

**Option A — extend `execute()` to take a context and return `{lines, cwd}`.**
For: one dispatcher; `submit()` in `cmd.svelte` does not grow.
Against: falsifies the registry's documented purity (`registry.ts:1-12`, the
property that keeps the whole command surface testable without a browser and
inside the diff-coverage gate), and rewrites ~20 passing `execute(...)`
assertions in `registry.test.ts` for no behavioural gain.

**Option B — a separate `src/lib/cmd/fs_commands.ts`, dispatched in the
component like `color`, `clear`, `python`, `matrix`, `hack` and `exit`
already are.**
For: the registry stays pure; `fs_commands` is itself pure
(`(args, ctx) => ShellResult`) and unit-testable against a fixture drive;
zero edits to existing tests; the component already owns exactly this
"command needs host state" pattern six times over.
Against: the component's `submit()` gains a branch, and "which commands are
host-aware" stays split between the registry's comments and the component.

**Verdict: B.** Deciding factor: the registry's purity is load-bearing and
documented three times; A would break it for four commands and churn 20 green
assertions to do so. B's one added branch is mitigated by dispatching the four
through a single `FS_COMMANDS.includes(name)` test rather than four `if`s.

## D4 — How are paths with spaces parsed?

**Option A — a quote- and escape-aware tokeniser replacing `parse()`.**
For: real bash semantics; `cat "My Music"` and `cat My\ Music` both work.
Against: it changes the shared parser every existing command already passes
through (`echo` most visibly); and the actual filenames here contain
apostrophes (`Momad's XP.txt`), ampersands (`AI & Machine Learning.txt`) and em
dashes, so a faithful tokeniser would *reject* names Tab completion offers
unless completion also emits escapes — a large surface for a portfolio toy.

**Option B — join `args` with one space; strip one layer of matching
surrounding quotes.**
For: `cd My Music`, `cd "My Music"` and `cat Momad's XP.txt` all just work,
including the apostrophe a real bash would choke on; no change to the shared
parser, so `echo` is untouched.
Against: gives up multi-argument forms — `cat a b` and any future `ls -l dir`
combination become impossible without revisiting this.

**Verdict: B.** Deciding factor: every portfolio filename in the seed contains
a character bash would require escaping, so A's correctness buys a worse
experience on the exact paths the feature exists to reach. The lost
multi-argument form is not in §3.2 and `ls -a` is handled as a flag before the
join (D6).

## D5 — Name matching within a segment

Three tiers, tried in order: exact, then case-insensitive, then
case-insensitive ignoring the extension (`cat Printerpix — AI Engineer`).

For: §3.2's own example is `cd experience` against a folder named `Experience`,
so case-insensitivity is required, not a nicety; the underlying filesystem is a
Windows drive, where case-insensitive *is* the correct semantic.
Against: it diverges from `find_command`, which is deliberately case-SENSITIVE
so the shell cannot accept `HELP` while `help` is what it advertises.
**Deciding factor:** the two are different namespaces with different real-world
semantics — commands are bash (case-sensitive), paths are NTFS (case-
insensitive) — and getting each right is more honest than making them agree.
Rejected: prefix matching (`cat printerpix`), because it makes `cd P`
ambiguous between `Projects` and `My Pictures` and drags in an ambiguity-
reporting surface Tab completion already covers better.

## D6 — Hidden items

`ls` hides the three ids in `system.ts:hidden_items` (Recycle Bin, Desktop,
Wallpapers); `ls -a` shows them.
For: it reuses the Explorer's own hidden set, so the two views agree; it gives
`-a` a real meaning rather than a decorative flag.
Against: `Desktop` being hidden is surprising in a shell.
**Deciding factor:** disagreeing with Explorer about what is hidden would be a
worse surprise than agreeing with it, and `-a` is one keystroke away.

## D7 — What `cat` prints

Portfolio entry (`portfolio_ref` present) → `resolve_portfolio_ref()` rendered
through `format.ts`: heading, subheading, meta lines, `- ` bullets, chips, link.
Folder → `cat: <name>: Is a directory`. Missing → `No such file or directory`.
Any other file → one dim line naming it as binary, with its KB size.

For: the portfolio path is the reason the command exists and its content is
already resolved and tested; the binary line is honest and needs no async read.
Against: a text file the visitor creates in Explorer reads as "binary", which
is a small lie.
**Deciding factor:** local files live as IndexedDB blobs behind an async read,
and the command layer is synchronous by design (D3); an async `cat` would
change the shape of every command for a file type no shipped app can even
create text in (Notepad is unbuilt, listed under Stretch).

## D8 — `dir`

`dir` runs `ls` after one dim line ribbing the visitor for reaching for cmd.exe.
For: it pays off the banner joke the owner asked for instead of answering
`dir: command not found`, which is the one reply that makes the gag land badly.
Against: a command not in §3.2's list; ~6 lines and one test of new surface.
**Deciding factor:** the banner now explicitly tells visitors this is a Linux
shell in a Command Prompt, so `dir` is the first thing a Windows-minded visitor
will try, and the joke is only complete if that lands somewhere.

## D9 — Prompt and window title

The prompt becomes `momad@xp:<display>$`, where display is `~` at home,
`~/Experience` below it, and the absolute path (`/d`) elsewhere. The window
title follows the same string, as a real terminal retitles itself.
For: `pwd` should not be the only way to know where you are; every existing
E2E assertion is against `momad@xp:~$`, which is unchanged at home.
Against: the title now changes as you navigate, so a taskbar button's label
moves.
**Deciding factor:** the prompt already claims `~` today and would be lying the
moment `cd` exists.

## D10 — Stale cwd

If the folder the terminal sits in is deleted in Explorer, the cwd id no longer
resolves. On the next command the shell falls back to home rather than erroring.
For: the drive is live and shared (D1), so this is reachable, not theoretical.
Against: a silent relocation.
**Deciding factor:** the alternative is a terminal permanently stuck in a
directory that no longer exists, which no command could recover from.

---

## Tasks

1. `src/lib/system.ts` — extract `export const c_drive_id`, use it in
   `my_computer` (no duplicate literal).
2. `src/lib/types.ts` — no change expected; confirm `VfsItem` needs nothing new.
3. `src/lib/cmd/path.ts` (new, pure) — `posix_path(id, drive)`,
   `display_path(id, drive)`, `resolve(input, cwd, drive)` returning
   `{ id } | { error }`, `list_children(id, drive, { all })`, segment matching
   per D5, `~` / `.` / `..` / `/` / trailing-slash handling.
4. `src/lib/cmd/fs_commands.ts` (new, pure) — `run_ls`, `run_cd`, `run_pwd`,
   `run_cat`, `run_dir`, plus `FS_COMMANDS` and one `run_fs(name, args, ctx)`
   entry point returning `{ lines, cwd? }`.
5. `src/lib/cmd/registry.ts` — delete `DEFERRED_COMMANDS` and its `execute`
   branch; add the five commands as `run: () => []` entries with summaries, in
   the same "handled by the component" idiom `color`/`python`/`exit` use.
6. `src/lib/cmd/complete.ts` — path completion for `cd`, `ls`, `cat`, `dir`:
   candidates from the drive, directories only for `cd`.
7. `src/routes/xp/programs/cmd.svelte` — `$hardDrive` subscription, `cwd`
   state, cwd-aware `PROMPT` and title, the `FS_COMMANDS` branch in `submit()`,
   the restored + joking banner.
8. Tests: `path.test.ts`, `fs_commands.test.ts`, additions to
   `complete.test.ts` and `registry.test.ts`; `e2e/cmd.spec.ts` — replace the
   two "deferred" assertions (lines 76-77, 118) with real navigation.
9. `docs/SPECIFICATION.md` — §3.2 banner note (the phase-dependency paragraph
   is now spent), §3.2 command list moves the four out of "Phase 6", Phase 6
   checklist item ticked with a pointer here.

## Gates

`npm run check` && `npm run lint` && `npm run format:check` &&
`npx vitest run --coverage` && `npm run build` && `npx playwright test`,
then a fresh-context implementation review before the PR.

---

# Gate-2 corrections (fresh-context red team)

The review's factual corrections are accepted in full. Recorded here rather
than silently patched above, because several were errors in what the plan
CLAIMED about the shipped code:

- `DEFERRED_COMMANDS` is `registry.ts:57`, not `:59`, and deleting it touches
  **five** further sites, not one: the `help` footer (`registry.ts:98`, which
  would otherwise print an empty "coming later" list), `command_names()`
  (`:287`, which would double-list once they are real entries), plus
  `complete.test.ts:3,91,104` and `registry.test.ts:4,169,178`.
- The seed ships **two** dashes — em (U+2014) in the 6 Experience files, en
  (U+2013) in the 9 Awards/Certifications files. The plan named only the em
  dash; a fixture or E2E typed from it matches nothing.
- `F:` has no `letter` field. Drive segments key off `name`, not `letter`.
- `complete.ts` canNOT already do this. `word_at` (`:76`) splits on the last
  space, so `cd My Mu<Tab>` filters `'My Music'.startsWith('Mu')` → false, and
  `cd My<Tab>` inserts `'My '` and then the NEXT Tab lists the whole directory
  with nothing on screen saying the first Tab ate `My`. The plan's claim that
  completion "drops into" the existing split was its load-bearing error.

## Corrected sub-decisions

**D2a — what `/` is (missing).** There is no `VfsItem` for My Computer;
`my_computer` is a plain `string[]` (`system.ts:102`). `path.ts` uses the
sentinel cwd id `'/'` — VFS ids are short-uuid alphanumerics so it cannot
collide — meaning `/`, `ls /`, and `cd ..` from `/c` all have a representable
answer. Rejected: erroring on `cd /` in a shell whose `pwd` prints `/c`.

**D4 (revised) — the path argument is the RAW REMAINDER of the line**, not
`args.join(' ')`. Explorer's rename accepts arbitrary strings and `seed.ts`
carries renames across re-seeds, so `My  Notes` (two spaces) is creatable;
join-args would list it in `ls` and never reach it in `cd` — the exact
terminal/Explorer disagreement D1 exists to prevent. Slicing the line after the
command name preserves internal spacing exactly and costs nothing.

**D4b — the completer must be path-aware and terminate directories with `/`,
not a space (missing).** `complete()` appends a space after a unique match
(`:106-108`), so `cd Experience ` + `Printerpix…` joins into one unparseable
segment. Directories complete to `Experience/`; files complete to a space.
`complete()` and `candidates_for()` therefore take the drive and cwd, and
`complete.test.ts` changes with them — D3's "zero edits to existing tests"
holds for `registry.test.ts` only.

**D9a — `redraw()` is not wrap-correct, and this feature makes overflow the
normal case (missing, and the highest-severity finding).** `cmd.svelte:220`
writes `CR + CLEAR_LINE_RIGHT`, which is column 0 of the CURRENT row and clears
only that row. The longest seed name is 71 chars; at the `momad@xp:~/Certifications$ `
prompt that is a 102-column line in a ~78-column default window. The row
arithmetic moves to a pure `src/lib/term/render.ts` and lands as its own commit
with its own E2E, ahead of the feature. It is a pre-existing bug (`echo` with
long text reaches it today), not scaffolding.

**M4 — `ls` uses `children` ORDER, not alphabetical.** The review flagged this
as spending D1's Explorer-agreement on a convention. The stronger reason it did
not give: seed order is reverse-chronological, so alphabetical would open a CV
with "Corporatica, Mentorness, Printerpix, RoboCup, Robotics Club, Udacity".
`wrap_items` (`format.ts:90`) measures `candidate.length` including escape
bytes, so it is fixed to use `visible_length` (`ansi.ts:70`) — the hazard
`columns()` already documents at `format.ts:110-112` — before colour is applied.

**M11 — no sizes in `ls`.** Every portfolio `.txt` is `size: 1`, so a size
column prints "1 KB" 28 times: a lie in the one place the feature must be
honest.

**M7 — an empty directory prints nothing**, as bash does. `D:` and `F:` have
no children.

**M2 — cwd is PER WINDOW**, like `accent` (`cmd.svelte:156-160`), and survives
`clear` and a `python` session, as a real shell's does. `prompt()` recomputes
rather than closing over a `const`.

**M8 — `.lnk` shortcuts are dereferenced** via `shortcut_target` when traversed
and when `cat`/`cd` name them, matching Explorer's open.

**M10 — `resolve_portfolio_ref` returning `null` falls through** to the generic
file line, and entries WITH images get a dim line saying how many, rather than
silently showing less than the portfolio viewer.

**M14 — the parent walk gets a depth guard and returns `null` on a dangling
ancestor** rather than `finder.to_url`'s `required(...)`, which THROWS
(`finder.ts:34-38`) — reachable because `del_fs` (`fs.ts:99-134`) unlinks
across separate store updates.

**D1a — `path.ts` must not use `finder.ts`.** It takes a module-level drive
snapshot at first import (`finder.ts:17`), which is a drive frozen at boot —
the exact opposite of D1.

Accepted without change: D1, D3, D6, D8, and the M-list items folded above.

---

# Implementation findings

**A reactive prompt is one flush too late.** `cd` assigns `cwd` and calls
`prompt()` in the same synchronous block; a Svelte `$:` statement does not run
until the flush AFTER that, so the first implementation printed the directory
the shell had just LEFT. Every unit test passed — only a real component has a
flush to be late for, and only the E2E could see it. `shell_prompt()`,
`location()` and `current_dir()` are therefore functions. The window TITLE
stays reactive on purpose: a taskbar label updating one tick late is
unobservable, and the reactive form is the simpler one.

**Mutation testing found a hole the suite had papered over.** Dropping
`path.ts`'s case-folded-name tier broke no test, because the extension-less
tier was answering for it — but it cannot answer a lowercased name that still
carries its extension (`printerpix — ai engineer.txt`). A test for that was
added and the mutation now fails as it should.

## Deviations from the task list

- **Task 1 (`c_drive_id`) was not done.** `path.ts:home_id` finds home by
  `drive_segment(item) === 'c'` over the drives My Computer lists, so no new
  constant was needed and the id literal was not moved. The plan's claim that
  extracting it would remove the duplicate was wrong anyway —
  `scripts/generate-vfs.ts:20` and `scripts/vfs-base.json` keep their own
  copies, so one of three would have moved.
- **Task 2 said "types.ts — no change expected"**; it gained `to_hard_drive`.
  The strict lint set forbids asserting parsed JSON into `HardDrive`
  (`no-unsafe-type-assertion`), so the test fixtures needed a real narrowing
  boundary. It sits beside `required` and `full_vfs_item`, which exist for the
  same reason at other boundaries.

# Gate-6 corrections (fresh-context implementation red team)

Four defects found, all reproduced before fixing:

1. **The bell re-armed the wrapped-redraw bug.** `write()` was documented as
   "every write resets the cursor row", but the bell is a ZERO-MOTION write:
   Tab with no match, or Ctrl+D mid-line, zeroed the row while the cursor
   stayed on a wrapped line's second row, and the next keystroke reprinted the
   prompt there — the exact failure the preceding commit fixed. `bell()` now
   writes the byte without touching the offsets.
2. **Every other write assumed the cursor was at the line's END.** After Home
   or a left-arrow it is not, so `write(CRLF)` on submit, `^C`, and the
   candidate listing all landed in the middle of what the visitor had typed.
   `render_line` now returns `end_offset` as well, and `leave_input_line()`
   steps down to it before any non-redraw write.
3. **A resize mid-edit invalidated the stored row.** The window is resizable
   and xterm reflows the wrapped line, so a row measured at the old width made
   the next redraw climb into the previous output. The state is now a column
   OFFSET, which survives the reflow — the row is `row_of(offset, cols)`.
4. **D10 was half-implemented.** The stale-cwd fallback lived only inside
   `resolve()`, so with a deleted working directory `cd` recovered while `ls`
   printed nothing and `pwd` claimed `~` — verified by execution. Worse, a
   test asserted `'~'` as correct and locked it in. There is now one fallback
   at the top of `run_fs`.

Also fixed: `ls /` and Tab printed `C:` while `pwd` printed `/c` (the shell
teaching the wrong vocabulary for its own path model); `cd <Tab>` hid
shortcuts-to-folders that `cd` accepts; `dir nope` answered `ls: nope: ...`;
`strip_quotes('"')` returned an empty string; and `complete.ts`'s doc block
still claimed the whole module matched case-sensitively.

**Tests that could not fail, replaced:** the `cat` E2E asserted `'AI Engineer'`,
a substring of the filename `ls` had printed two commands earlier and left on
screen — it passed whether or not `cat` ran. `complete.test.ts`'s "only
completes to a real command" compared two expressions that became the same
array once `DEFERRED_COMMANDS` was deleted; it now compares Tab's offers against
what `help` independently prints. `registry.test.ts`'s `toContain('ls')` was
satisfied by the `ls` inside "skills". A test named "survives a python session"
never started python; the real round-trip now lives in `e2e/python.spec.ts`,
where a runtime exists.
