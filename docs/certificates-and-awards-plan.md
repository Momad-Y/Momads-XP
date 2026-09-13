# Plan — one section: "Certificates & Awards"

**Owner request:** "combine certificates and awards into one thing, making
Certificates & Awards, make sure to cover everything, file explorer, images,
documents, cmd, python, etc"

Supersedes the two-section layout described in `docs/phase-2-guide.md` and
`docs/SPECIFICATION.md` §3.2.

---

## Why this is more than a rename

`profile.json` holds the same two credentials **twice**:

| `certifications[]` | `awards[]` | same? |
| --- | --- | --- |
| Certificate of Excellence – Graduation Honors (AAST, 2025) — pdf + scan | Certificate of Excellence – Graduation Honors, 2025 — same scan + 2 ceremony photos | yes |
| Certificate of Excellence (AAST, 2022) — pdf + scan | Certificate of Excellence, 2022 — the **same** scan, nothing else | yes |
| IELTS Academic – Band 7.5 (2025) | — | cert only |
| Certificate of Achievement – Mentorness ML Internship (2024) | — | cert only |
| — | 1st Place – RoboCup @Home Education (Egypt), 2024 | award only |
| — | 3rd Place – RoboCup @Home Education Major (Netherlands), 2024 | award only |
| — | Honorary Award – Smart White Cane (AISC) | award only |

4 + 5 = 9 entries describing **7** things. The duplication is why the owner
found the two folders confusing in the first place (the earlier "confusing and
weird overlap" report), and it is the reason a presentation-only merge is not
enough: dropping both lists into one folder would put "Certificate of
Excellence (AAST, 2022)" next to "Certificate of Excellence" — the same
certificate, twice, with different text.

---

## Sub-decisions

### D1 — Merge the data, or only the folder?

**Option A: one merged array + one `PortfolioSection`.**
For: the duplicate pairs collapse, so the folder reads as 7 real things; one
section value means one folder everywhere it is derived — `C:\`, My Pictures,
My Documents, CMD, the Python mirror — with no special-casing; the graduation
certificate finally shows its PDF *and* its ceremony photos in one entry.
Against: schema change rippling through `profile.ts`, `types.ts`, `ids.ts`,
`build.ts`, `portfolio.ts` and six test files; loses the certificate/award
distinction in the data model.

**Option B: keep both arrays, render one folder.**
For: much smaller diff; no content reconciliation to get wrong.
Against: the duplicates survive and become *more* visible, side by side in one
folder; two sections mapping to one folder breaks the 1:1 `FOLDERS` ↔ section
invariant `build.ts` is built on, and My Pictures would still show two section
folders, so "one thing" would be a lie on exactly the surface the owner named.

**Verdict: A.** Deciding factor: the two lists describe the same two
credentials twice, so a folder-only merge would display that duplication rather
than resolve it. The lost distinction was already fiction — those two items
were both at once.

### D2 — What the section is called

**"Certificates & Awards"** (owner's words) vs **"Certificates and Awards"**
(XP's own house style — "Documents and Settings", "Add or Remove Programs") vs
**"Certifications & Awards"** (matches today's folder).

For "&": it is what the owner asked for, twice, and it is shorter in a
16px-tall Explorer label.
Against "&": XP spells "and" in its own shell folders, and `&` is a command
separator in a real `cmd.exe`, so `cd C:\Certificates & Awards` would be a
syntax error on a real machine.

**Verdict: "Certificates & Awards".** Deciding factor: the owner named it. The
`cmd.exe` objection does not apply here — verified: nothing in `src/lib/cmd/`
gives `&` any meaning, and `cd`/`cat`/`ls` consume the raw remainder of the
line (`fs_commands.ts` `run_cd`: `rest.trim()`), not whitespace-split tokens,
so `&` is exactly as safe as the spaces already in `My Pictures`. "Certificates"
over "Certifications" because a 1st-place trophy is not a certification.

### D3 — The code identifier

`PortfolioSection` gains a value that is also the `profile.json` key.

- `'certificatesAndAwards'` — verbose, but unambiguous, and camelCase already
  matches `resumePdf` / `systemProperties` in that file.
- `'credentials'` — short, but excludes awards: a competition placement is not
  a credential, and the name would mislead the next reader.
- reuse `'certifications'` — smallest diff, but every award would be filed
  under a section named for the half it is not.

**Verdict: `certificatesAndAwards`.** Deciding factor: this string is the
section label in code for every downstream consumer, so being wrong about half
the contents is worse than being long.

Id prefix (`pascal_section`): `'CertAward'`, not `'Cert'`. Keeping `'Cert'`
would preserve the four existing `p2Cert…` ids — but only their *prefix*: the
index suffix changes for every entry once the arrays merge, so id stability is
lost either way. Given that, the prefix should read true: `p2CertAward1stPlace…`
rather than `p2Cert1stPlace…` calling a trophy a certificate.

### D4 — The merged record

```ts
export interface CertificateOrAward {
    title: string;
    /** Empty for a credential with no date — the honorary award has none. */
    year: string;
    images: ProfileImage[];
    /** The document itself, when there is one. */
    pdf?: string;
}
```

`year: string` required-but-empty-allowed, inherited from `Award`, rather than
`year?: string`: `portfolio.ts` already collapses `''` through `non_empty`, and
a required field makes every entry state whether it has a date. `pdf?:`
optional, inherited from `Certification` — four of the seven have no document.

### D5 — How the duplicate pairs reconcile

Rule, applied to all seven: **title says what it is and who issued it; `year`
carries the date; `pdf` the document; `images` the union, deduped by `src`,
document scan first.**

So the year comes OUT of the four certification titles it was baked into:

| was | becomes | year |
| --- | --- | --- |
| Certificate of Excellence – Graduation Honors (AAST, 2025) | Certificate of Excellence – Graduation Honors (AAST) | 2025 |
| Certificate of Excellence (AAST, 2022) | Certificate of Excellence (AAST) | 2022 |
| IELTS Academic – Band 7.5 (IELTS Official, 2025) | IELTS Academic – Band 7.5 (IELTS Official) | 2025 |
| Certificate of Achievement – Mentorness ML Internship (2024) | Certificate of Achievement – Mentorness ML Internship | 2024 |

For: one shape for all seven, and no entry whose `.txt` prints "2025" under a
heading that already says 2025.
Against: it renames four files in the drive, and it edits titles.
**Verdict: apply it.** Deciding factor: those titles were composed in an
earlier session from the CV — they are not the documents' legal names — and the
two merged pairs would otherwise inherit a year in the title *and* in the
field. The award titles are unchanged.

The merged pairs take the certification's title (it names the issuer), the
award's `year`, the certification's `pdf`, and the union of images — which for
the graduation entry is [certificate scan, ceremony 1, ceremony 2] and for 2022
is the single scan both already pointed at.

### D6 — Order of the merged array

**Reverse chronological, undated last.** Alternatives: source order (certs then
awards — arbitrary once merged) or by prominence (RoboCup 1st first — my
ranking of his achievements, which is not mine to make).

For: one objective rule; newest-first is how a CV lists credentials.
Against: the headline 1st place lands third.
**Verdict: reverse chronological.** Deciding factor: Explorer sorts the folder
by name anyway, so this order is only visible in surfaces that read
`profile.json` order — a stated rule beats a taste call there.

### D7 — `My Documents/Certifications` → `My Documents/Certificates & Awards`

For: the owner named "documents" explicitly; one section should have one name
on every surface; if an award ever gains a PDF it has a home already.
Against: today only certificates carry PDFs, so the "& Awards" half of the name
promises something the folder does not currently hold.
**Verdict: rename.** Deciding factor: My Pictures has exactly the same
property (it holds pictures for both kinds under one name) and nobody would
expect the documents folder to be named for a subset of its section. Id:
`docCertifications` → `docCertificatesAwards`.

### D8 — My Pictures

`picCertifications` + `picAwards` → one `picCertificatesAwards`, holding the
per-item folders of both kinds. Falls out of `FOLDERS` automatically — no
alternatives; forced by the loop that derives picture sections from it.

### D9 — Returning visitors' drives

The old ids (`p2FolderAwards`, `p2FolderCertifications`, every `p2Cert…` /
`p2Award…` entry, `picAwards`, `picCertifications`, `docCertifications`) vanish
from the seed. `is_dropped_seed_item` (`seed.ts`) reaps exactly this: an id the
snapshot proves came from an older seed and the new seed does not contain,
unless the visitor made it theirs. No new machinery — this is the case that
predicate was written for. Their own uploads inside those folders are carried
and relinked by `merge_on_reseed`.

### D10 — The mobile portrait layout

Mobile (`MobilePortfolio.svelte`) has five accordions — About Me, Experience,
Projects, Skills, Education — and shows **neither** certifications nor awards
today.

For adding a sixth: "cover everything"; a phone visitor currently cannot see a
single credential; it is ~20 lines in a file already shaped for it.
Against: mobile never had either section, so nothing regresses if it is left
alone — this is an addition, not part of the merge.
**Verdict: add it.** Deciding factor: the request is that this becomes one
thing across the product, and leaving the newly-unified section invisible on
the phone would be a gap I'd be choosing on purpose. Flagged to the owner as an
addition rather than a rename.

---

## Surfaces to change (the "cover everything" checklist)

| # | Surface | Change |
| --- | --- | --- |
| 1 | `src/lib/data/profile.json` | two arrays → `certificatesAndAwards`, 7 entries, deduped, D5 titles, D6 order |
| 2 | `src/lib/profile.ts` | `Award` + `Certification` → `CertificateOrAward`; `Profile` field |
| 3 | `src/lib/types.ts` | `PortfolioSection` union |
| 4 | `src/lib/vfs_gen/ids.ts` | `pascal_section` → `CertAward` |
| 5 | `src/lib/vfs_gen/build.ts` | `FOLDERS` (6 → 5 folders), `per_section`, `gallery`, documents section name + id |
| 6 | `src/lib/portfolio.ts` | one resolver case: heading, year meta line, images |
| 7 | generated | `hard_drive.json`, `vfs_ids.ts`, `seed_version.ts` via `npm run generate:vfs` |
| 8 | `scripts/help.template.html` → `static/help.html` | the portfolio sentence, `&` written as `&amp;` |
| 9 | `src/routes/xp/mobile/MobilePortfolio.svelte` | sixth accordion (D10) |
| 10 | `src/lib/vfs_gen/build.test.ts` | folder ids, per-section counts, pictures, PDF↔picture parity |
| 11 | `src/lib/portfolio.test.ts` | award/cert cases → one |
| 12 | `src/lib/profile.test.ts` | the name-safety list |
| 13 | `src/lib/python/mirror.test.ts` | the `Certifications/` PDF-exclusion path |
| 14 | `src/lib/cmd/path.test.ts` | `/c/Awards/…` → `/c/Certificates & Awards/…`, incl. the en-dash case |
| 15 | `src/lib/cmd/fs_commands.test.ts` | same path |
| 16 | `e2e/my_computer.spec.ts` | the six-folder assertion → five |
| 17 | `docs/SPECIFICATION.md` | §3.2 tree, the generator bullet, the Phase 2 checklist line, the image examples |
| 18 | `docs/phase-2-guide.md` | superseded note pointing here |

New tests to add (not just edits):

- CMD can `cd` into and `cat` inside a folder whose name contains `&` —
  the D2 claim, asserted rather than assumed.
- The Python mirror exposes `Certificates & Awards/…` paths.
- No `.txt` in the section duplicates another's title (the defect this whole
  change exists to remove, stated as a rule so it cannot come back).
- Every entry with a `pdf` has a picture, and vice versa (existing parity rule,
  re-pointed at the merged section).

## Out of scope

- `docs/profile.md` — the owner's own CV source document, not ours to edit.
- Award descriptions from LinkedIn that the schema cannot hold (still flagged,
  still not added).

---

# Red-team dispositions

Fresh-context review, find-problems framing. It graded D6 and D9 **Wrong** and
D3 **Weak**, and it was right on all three. Every finding below was verified
against the code before being accepted or rejected.

## Accepted, verdict changed

### D6 — I dismissed the "against" on a false premise

I wrote that "Explorer sorts the folder by name anyway". It does not:
`build.ts` stamps `sort_option: 0` on every generated item, `SortOptions.NONE`
is `0` (`system.ts:97`), and `sort.js:9-12` returns the array **untouched** for
NONE. `path.ts:126-129` says so outright. So `profile.json` order *is* the
Explorer order, the `ls` order, the My Pictures order and `os.listdir` order,
and my deciding factor was fiction.

**Re-deliberated with the correct fact.** The first row of this folder is the
first credential a visitor reads.

- *Pure reverse-chronological* (my original): one rule, no category judgement —
  but it puts an IELTS band score second, above a 1st-place placement in an
  international robotics competition.
- *By prominence*: my ranking of his achievements, which is not mine to make.
- **Awards first, then certificates, each reverse-chronological, undated last.**

**New verdict: awards then certificates.** Deciding factor: it is still a
category rule rather than a personal ranking, it puts the strongest items in
the rows people actually read, and — since the two kinds now share one folder —
grouping them keeps the distinction legible without needing two folders. Order:
RoboCup 1st (2024), RoboCup 3rd (2024), Honorary Award (undated), Graduation
Honors (2025), IELTS (2025), Mentorness (2024), Excellence (2022).

### D3 / D7 / D8 — identity is not display (the highest-leverage finding)

I claimed new container ids were forced because "id stability is lost either
way". That is true of **entry** ids (`entry_file` appends the array index) and
false of the three **container** ids, which are free-standing literals:
`p2FolderCertifications` (`build.ts:39`), `docCertifications` (`build.ts:335`),
and `pic${slug(folder.name)}` (`build.ts:266`) — the last one derived from the
*display name*, which is the actual defect. `profile.ts:190-198` already argues
this exact point for `MusicGenre.dir` vs `.name`.

**Accepted in full.** The rename keeps every container id it can:

- `C:\` section: id stays `p2FolderCertifications`, only `name`/`basename` change.
- My Documents: id stays `docCertifications`.
- My Pictures: `FOLDERS` gains an explicit `picture_id` (`picCertifications`),
  so a display-name change can never mint a new id again.
- Entry-id prefix stays `CertAward` (entry ids churn regardless).

This is what turns a migration back into a rename: `user_edits` then does the
right thing in both directions for free (a visitor who never renamed the folder
gets the new name; one who did keeps theirs), favourites and window history
keep pointing at live ids, and the reaped set shrinks from 3 containers to 1.

### D9(a) — "their uploads are carried" was the opposite of the truth

`merge_on_reseed` excludes dropped seed items from `candidates`, so a dropped
folder can never enter `carried`; the carry loop then requires a parent in
`seed ∪ carried` (`seed.ts:230`). A visitor's own file inside a dropped folder
satisfies neither and is **deleted**. `seed.test.ts:593-612` asserts exactly
that, and the "KEEPS a file the visitor put there themselves" case
(`seed.test.ts:614`) only covers a surviving parent.

This contradicts the contract `is_dropped_seed_item`'s own docblock states —
"Two things it must never reap: an id `previous` never held, which is the
visitor's own item … it protects an mp3 they upload into a genre folder". The
promise is real; its implementation has a hole, and dropping `C:\Awards` walks
straight into it.

**Fix, scoped to the promise:** a candidate whose parent is gone is re-homed to
its nearest surviving ancestor instead of being dropped. Candidates are already
only items `previous` never held, so seed content still dies with its folder
(the music-genre tests are untouched) and only user-authored items are rescued.
Same "nearest surviving location" semantic as Recycle Bin restore.

## Accepted, documented, not fixed here

### D9(b) — legacy drives with no snapshot get one ghost folder

With no `hard_drive_seed_fields`, nothing is reaped (`seed.ts:185`), so a
pre-2026-08-23 drive carries `p2FolderAwards` forward as a ghost whose `.txt`
files have `portfolio_ref.section === 'awards'` — a value no longer in the
union, so `resolve_portfolio_ref` returns undefined, `get_file` throws, and the
viewer shows "This file cannot be displayed." plus a console error.

Not fixed, deliberately. The snapshot shipped to production on 2026-08-23
(`0361781`), so this population is drives untouched for three weeks — and those
same drives already carry stale music tracks pointing at 404 URLs from the
library rewrite, by this identical mechanism, which shipped as an accepted cost.
A bespoke retired-id list for this one folder would not generalise. The general
fix — generating the retired-id set by diffing the previous seed, which would
fix music too — is backlog, noted in `docs/overthinking.txt`.

A prefix rule (`id.startsWith('p2')`) was considered and **rejected as unsafe**:
user ids come from `short.generate()`, whose base58 alphabet contains `p` and
`2`, so a user item could legitimately be born `p2…`.

## Accepted — surfaces and sub-decisions I had missed

Added to the checklist: `SPECIFICATION.md` §7 data-contract sample (the schema
of record); the `with_pdf` filter (`build.ts:331`); the `e2e/my_computer.spec.ts`
test *name*; `e2e/mobile.spec.ts` accordion selectors; stale comments in
`term/render.ts:11`, `build.ts:325`, `profile.ts:76`, `generate-vfs.ts:268`,
`sidebar.svelte:28`, `mirror.test.ts:59`, `path.test.ts:29`,
`docs/cmd-filesystem-plan.md`, `phase-2-guide.md:7`; `build.test.ts:101`'s
awards duplication; and the stale item counts in `seed.ts:91` / `mirror.ts:7`.

- **(C) the `.txt` never mentions its PDF.** Adopted: an entry with a document
  gains a meta line naming its in-world path. To avoid duplicating where PDFs
  live, the section's display name becomes one exported constant that
  `build.ts`, `portfolio.ts` and mobile all read — which is also what makes
  "one name everywhere" a code fact rather than a promise.
- **(D) position in `FOLDERS`.** Fifth, where Certifications is today, so
  `C:\` reads Experience, Projects, Education, Skills, Certificates & Awards.
- **(E) a CMD command for credentials.** Declined: there has never been an
  `awards` or `certifications` command, so nothing regresses, and the folder is
  reachable with `cd`/`ls`/`cat` — which the new `&`-in-a-path test asserts.
- **(F) desktop About Me left alone** while mobile gains the section. The
  asymmetry is deliberate: mobile has no Explorer at all, so its accordions are
  the only way to see a credential on a phone; on the desktop the folder is
  sitting in My Computer.
- **(G) the same image file under two names.** The RoboCup certificate scans
  appear in both the Experience and the awards galleries with *different* alt
  text, and file names come from alt text — so one file lands in two galleries
  under two names. Adopted: one `src` gets one caption, enforced by a test.
- **(H) verify the migration in a real browser** against a drive seeded by the
  current build before the cutover, not only in unit tests.

## Rejected

Nothing. Every finding held on inspection.
