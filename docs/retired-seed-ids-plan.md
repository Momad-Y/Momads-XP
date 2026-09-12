# Plan — reaping dropped seed items on a drive with no snapshot

**Owner request:** fix the limitation reported in chat — a visitor whose drive
predates the seed-fields snapshot (2026-08-23, `0361781`) has nothing reaped,
so every item a later seed dropped is carried forever: stale music tracks
pointing at 404 URLs, and after the Certificates & Awards merge a ghost
`C:\Awards` folder whose `.txt` files render "This file cannot be displayed."

## The mechanism today

`merge_on_reseed` must separate *the visitor's own item* (keep) from *an item
an older seed of ours gave them that the new seed dropped* (reap). It answers
that with `hard_drive_seed_fields`, a per-visitor snapshot of every id the seed
they received contained. With no snapshot, `is_dropped_seed_item` returns
`false` on purpose (`seed.ts`) — guessing would delete their files.

So provenance is currently *inferred from what the visitor happens to have
stored*. The fix is to make it *a fact we declare*, because we know exactly
which ids we have ever shipped.

Worse than merely stale: the ghosts are permanent. After that boot the app
persists a snapshot of the NEW seed, which does not contain the ghost ids, so
on every future re-seed they look authored by the visitor.

---

## Sub-decisions

### E1 — Where the truth about "this id was ours" lives

**Option A: a generated ledger of RETIRED ids** — ids we have shipped and no
longer ship, committed in `src/lib/generated/`.
For: provenance becomes a build-time fact, correct for every visitor including
ones with no snapshot and ones whose snapshot is older than the id in question;
fixes the music ghosts and the Awards ghost with one mechanism; small (138 ids
today, ~4 KB gzipped) because the *current* ids are already known at runtime
from the seed itself.
Against: a generated file that must stay correct forever — if it is ever lost
or regenerated from an empty state, history is lost silently (mitigated: the
generator only ever unions, and CI's freshness gate diffs it).

**Option B: ship the full historical field snapshot** (every id we ever
shipped, with its `name`/`url`/`storage_type`/…).
For: lets the legacy path apply *exactly* the same user-edit comparison the
snapshot path applies, so a visitor who painted over a since-removed wallpaper
is provably protected.
Against: 341 historical ids × 9 fields is tens of KB in every visitor's bundle
forever, to serve a population of maybe zero; and the comparison is
approximate anyway — we do not know *which* historical seed a given visitor
received, so the "seed value" it compares against may be from a different one.

**Option C: treat a snapshot-less drive as a first visit** (discard and reseed).
For: two lines; no new artefact.
Against: deletes their uploads, wallpapers and shortcuts. Unacceptable — the
whole reason the snapshot-less path infers nothing is to not do this.

**Verdict: A.** Deciding factor: it is the only option that fixes the actual
problem without either shipping a historical archive to every visitor forever
(B) or deleting the data we are trying to protect (C). B's extra precision buys
protection for a case A also covers by a cheaper rule (E5).

### E2 — What a ledger entry holds

**Ids only**, not id → fields.
For: smallest artefact; nothing to keep in sync; the guards that matter (E5)
read the *cached item*, not a historical baseline.
Against: cannot distinguish "seed item the visitor overwrote" from "seed item
untouched" — handled by E5's conservative rule instead.
**Verdict: ids only.** Deciding factor: the one thing the fields would buy is
covered by refusing to reap anything holding local bytes, which needs no
history at all.

### E3 — How the ledger is maintained

`retired_new = (retired_old ∪ ids(hard_drive.json ON DISK)) ∖ ids(new seed)`

The on-disk `hard_drive.json` at generate time IS the previous seed, so the
generator learns what was retired without being told. Properties that matter:

- **Idempotent** — a second `generate:vfs` produces the same file
  (`(retired ∪ new) ∖ new = retired`), which CI's freshness gate requires.
- **Monotone** — ids only leave the ledger by coming *back* into the seed.
- **No new storage** — no extra input file to keep, no manual step.

Plus a **one-time backfill** from git: every version of
`static/json/hard_drive.json` reachable from `origin/main` and `origin/dev`,
unioned, minus the current seed. Verified: 22 commits, 341 historical ids, 138
retired — including all 31 `p2Cert*`/`p2Award*` entry ids, `p2FolderAwards`,
the 60 old `picCertifications*`/`picAwards*` ids, the 5 `docCertifications*`
ids, and the old music ids (`p3MusicAscentTrack00001`, `b31b2f03b7d6c50f`, …).
Without the backfill the ledger would start empty and the two ghosts we are
fixing would not be in it.

Alternative considered: keep a hand-maintained list. Rejected — the whole class
of bug this repo keeps paying for is one rule applied at one of two call sites;
a list someone must remember to append to is that shape exactly.

### E4 — Does it apply always, or only when there is no snapshot?

**Always.**
For: the ledger is authoritative about our own ids, so it is strictly more
complete than any single visitor's snapshot — it also catches an id from a seed
*older* than the one they received, which the snapshot path misses today.
Against: it reaps in a path that currently works, so a bug in the ledger would
have a wider blast radius than a legacy-only branch.
**Verdict: always.** Deciding factor: two code paths for one question is how
the two halves drift; the blast radius is contained by E5's guards and by the
fact that the ledger is generated from the seed rather than hand-written.

### E5 — What it must never reap

1. `authored === true` — the visitor's own item (as today).
2. **Anything whose `storage_type` is `'local'`** — their bytes are in it.
   This is the conservative replacement for the snapshot path's "did
   `storage_type` change" comparison, and it is deliberately blunter: the seed
   does ship one local item (`my drawing.png`, whose bytes exist only if you
   saved from Paint), so if such an item is ever retired it will be carried
   forever rather than risk deleting a drawing. Carrying one stale icon is a
   cosmetic cost; deleting someone's painting is not.
3. An id the ledger does not contain — i.e. anything we never shipped.

Not a guard, deliberately: a *rename*. A visitor who renamed a folder we later
retired still loses it, exactly as on the snapshot path today.

### E6 — Where it plugs in

Inside `is_dropped_seed_item`, as a second way of answering the same question,
rather than a new predicate at the `candidates` filter.
For: one function owns "did this come from a seed we no longer ship", so the
two answers cannot disagree; every caller gets it; the existing tests keep
covering the shared guards.
Against: the function's name says "dropped seed item" and it now has two
sources of evidence — needs its docblock rewritten rather than extended.
**Verdict: inside it.** Deciding factor: the alternative puts a second
reap rule next to the first, which is precisely the drift shape above.

### E7 — Backfill scope: `main` + `dev`, not `--all`

For: those are the branches that shipped or are about to; a feature branch's
seed reached nobody.
Against: an id that shipped only from a since-deleted branch would be missed.
**Verdict: main + dev.** Deciding factor: reaping an id that never shipped is
harmless *except* for collision risk, so there is no reason to widen the set
beyond what was actually served.

### E8 — Collision risk, examined rather than assumed

A ledger entry that matched a *user's* item id would delete their file. User
ids come from `short.generate()` — 22 characters of flickrBase58. Of the 138
retired ids, 3 are that shape (`8zbKRcb6rGUW9QUoMdtUHY`,
`mPStWjybAjUKtMyKhgtAag`, `rugcCBKHiSYK5RFdud7m3p` — retired inherited shell
items). For one of those to collide, a visitor's `short.generate()` would have
to return that exact 22-character string: 1 in 58²² ≈ 10⁻³⁸. The existing
snapshot path already stakes the same assumption on the same id space.

No mitigation. A filter excluding base58-shaped ids was considered and rejected:
it would permanently exempt every inherited shell item from reaping to buy a
10⁻³⁸ improvement.

---

## Tests

- The ledger and the current seed are **disjoint** — the invariant that makes
  "in the ledger" mean "not shipped any more".
- The ledger **contains ids we know we retired** (`p2FolderAwards`, a
  `p2Award*` entry, an old music track id), so a backfill that silently
  produced an empty file fails.
- `generate:vfs` is **idempotent** on the ledger (run twice, no diff) — the CI
  freshness gate depends on it.
- Legacy path (**no snapshot**): a retired folder and its retired children are
  reaped; the visitor's own item in that folder is re-homed, not deleted (the
  orphan rule shipped in #217); an item with `storage_type: 'local'` on a
  retired id is KEPT; an id in neither the seed nor the ledger is KEPT.
- Mutation: emptying the ledger must turn the reaping tests red.
- **Real browser**, the actual reported scenario: a drive seeded from the
  production build with `hard_drive_seed_fields` DELETED — the ghost
  `C:\Awards` and the stale tracks must be gone, uploads must survive, no
  console errors.

---

# Red-team dispositions

Graded **Acceptable**. It confirmed the two structural claims I was least sure
of and found two gaps outside my sub-decision inventory. Every finding below
was checked against the code before being accepted.

## Confirmed, not changed

- **Ledger ↔ tombstone disjointness is structural, not lucky.** The tombstone
  block only touches ids absent from the visitor's drive but present in the new
  seed; the reap only sees candidates absent from the new seed. `∖ ids(new)`
  makes those sets disjoint by construction, and `is_dropped_seed_item` is only
  reachable from the `candidates` filter, which already requires
  `seed[id] == null` — so even a stale ledger cannot reap a shipped id.
- **The orphan trace is right.** A retired folder holding a visitor's file:
  folder and entries leave via the ledger, the file re-homes to the nearest
  surviving ancestor and is relinked there.
- **`storage_type === 'local'` really is the complete set of items holding the
  visitor's bytes** — `get_file`/`get_url`/`free_blob` dereference idb only for
  `'local'`; `'remote'` fetches a URL and `'fake'` has no bytes at all.

## Accepted — the implementation hazard it predicted

It called out the single easiest way to get E4 wrong: adding the ledger check
*after* the existing `if (previous == null) return false`, which would leave
legacy drives with exactly the bug being fixed and still pass a careless
review. The ledger check is now the first evidence in the function, above that
return — **and that specific slip is mutation-tested**: moving the early return
above it turns three tests red.

## Accepted — E5's guard list was under-described

`clone_fs` stamps `authored: true` on every copy (`fs.ts:255`), which covers
pastes, duplicated icons and Recycle Bin clones whatever their `storage_type`.
But two user-created item kinds carry **no** `authored` and are not `'local'`:

- `.lnk` shortcuts from `create_shortcut` — `storage_type: 'fake'`
- `.url` shortcuts from IE's "Create desktop shortcut" — `storage_type: 'remote'`

Neither is reachable by the reap, because their ids come from
`short.generate()` and are therefore not in the ledger — but E5 reasoned only
about `my drawing.png`, and E8's collision argument was written about inherited
shell items. Both are now named, and a test asserts the ledger touches nothing
whose id we never shipped.

## Accepted — the plan's motivation claim was too broad

A ghost the visitor **recycled before it was retired** is never reaped: the bin
entry is a `clone_fs` copy, so it is `authored`. Restoring it resurrects an
item whose URL 404s.

Left as is, deliberately. Reaping items out of someone's Recycle Bin is the
opposite side of the line this whole module defends — the bin is where the
visitor's own deletions live, and `clone_fs` marks those copies theirs on
purpose. What changed is the claim: this fixes ghosts in the live drive, not
copies the visitor has already moved to the bin, where they are visible only in
the bin and removable with Empty Recycle Bin.

## Accepted as real, deliberately OUT OF SCOPE

**Retire-then-return silently discards a visitor's in-place local edit and
leaks the blob.** If an id leaves the seed and comes back while a visitor is
away: at the boot after it left, their snapshot is refreshed to a seed that
does not contain it, so `previous[id]` is gone forever. When it returns,
`{ ...seed }` replaces the record wholesale and `user_edits(cached, undefined)`
returns `{}` (`seed.ts:129`), so a Paint-saved override on that id is dropped —
and because no `del_fs` runs, `free_blob` never frees the idb blob either.

Verified reachable, not theoretical: ids *have* left and returned — two of them
in `d5b2ff3` (the Mentorness picture ids, when the array reindexed). Both were
remote files, so nothing was lost that time.

Not caused by this change, and not made more likely by it: the loss happens at
the *return*, through the snapshot's own semantics, and is identical with or
without the ledger. The fix is ~10 lines in the carry-edits block — when
`previous != null`, `previous[id] == null` and `cached[id]` exists with
`storage_type: 'local'`, treat it as a user divergence instead of overwriting
it — but it is a separate defect in a module whose diff is already large, so it
goes to the owner as a decision rather than riding along here.

## Rejected

Nothing.
