/**
 * A POSIX path model over the REAL virtual filesystem — the same drive the
 * Explorer window shows (spec §3.2, "directory structure mirrors the File
 * Explorer folder tree").
 *
 * The terminal speaks bash (§3.2 line 1) while the filesystem underneath it is
 * a Windows drive, so `C:\Experience` is addressed as `/c/Experience`,
 * git-bash style, and `~` is the C: drive — which is what makes the banner's
 * `cd experience` work from the very first prompt.
 *
 * Pure: the drive is passed IN. It deliberately does not use `finder.ts`,
 * which takes a module-level snapshot at first import (`finder.ts:17`) and so
 * would freeze the terminal's view at boot — the exact opposite of the point,
 * which is that a folder created in Explorer shows up in the next `ls`.
 */
import { hidden_items, my_computer } from '../system';
import type { HardDrive, VfsItem } from '../types';

/**
 * The My Computer level, above the drives.
 *
 * It has no `VfsItem` — `my_computer` is a plain `string[]` (`system.ts:102`)
 * — so `/`, `ls /` and `cd ..` from `/c` need an id that stands for it. VFS
 * ids are short-uuid alphanumerics, so a slash can never collide with one.
 */
export const ROOT = '/';

/**
 * Ancestor walks are bounded. A drive restored from an old IndexedDB cache can
 * carry a `parent` cycle, and an unbounded `do/while` on `parent` (the shape
 * in `finder.ts:33-42`) hangs the tab rather than printing an error.
 */
const MAX_DEPTH = 64;

export function is_dir(item: VfsItem): boolean {
    return (
        item.type === 'folder' ||
        item.type === 'drive' ||
        item.type === 'removable_storage'
    );
}

/**
 * The path segment for a drive: `C:` -> `c`, `F:` -> `f`.
 *
 * Keyed off `name`, NOT `letter`: the removable drive ships without a `letter`
 * field at all, and a letter-keyed lookup would silently lose `/f`.
 */
export function drive_segment(item: VfsItem): string {
    return item.name.replace(/:$/, '').toLowerCase();
}

/** The drives, in the order My Computer lists them. */
export function roots(drive: HardDrive): VfsItem[] {
    return my_computer.flatMap((id) => {
        const item = drive[id];
        if (item == null) return [];
        return item.type === 'drive' || item.type === 'removable_storage'
            ? [item]
            : [];
    });
}

/** `~`. The C: drive, so the portfolio folders are one `cd` from the prompt. */
export function home_id(drive: HardDrive): string {
    return roots(drive).find((item) => drive_segment(item) === 'c')?.id ?? ROOT;
}

/** Follow a shortcut to its target, as opening one in Explorer does. */
export function deref(id: string, drive: HardDrive): string {
    const target = drive[id]?.shortcut_target;
    if (target == null) return id;
    return drive[target] == null ? id : target;
}

function parent_of(id: string, drive: HardDrive): string {
    if (id === ROOT) return ROOT;
    const parent = drive[id]?.parent;
    return parent == null || parent.length === 0 ? ROOT : parent;
}

/**
 * The absolute path, or `null` if it cannot be built.
 *
 * `null` rather than a throw on a dangling ancestor. `del_fs` unlinks a parent
 * and deletes its children across SEPARATE store updates (`fs.ts:99-134`), so
 * an item whose ancestor has already gone is an observable intermediate state
 * — and `finder.to_url` answers it with `required(...)`, which throws out of
 * whatever reactive statement asked.
 */
export function posix_path(id: string, drive: HardDrive): string | null {
    if (id === ROOT) return '/';

    const segments: string[] = [];
    let current_id = id;
    for (let depth = 0; depth <= MAX_DEPTH; depth++) {
        const item: VfsItem | undefined = drive[current_id];
        // Covers both the unknown id and the ancestor deleted mid-walk.
        if (item == null) return null;
        const parent_id = item.parent;
        if (parent_id == null || parent_id.length === 0) {
            return `/${[drive_segment(item), ...segments].join('/')}`;
        }
        segments.unshift(item.name);
        current_id = parent_id;
    }
    return null;
}

/** The path as the PROMPT shows it: `~` inside home, absolute outside it. */
export function display_path(id: string, drive: HardDrive): string {
    const home = home_id(drive);
    if (id === home) return '~';
    const path = posix_path(id, drive);
    if (path == null) return '~';
    const home_path = posix_path(home, drive);
    if (home_path != null && path.startsWith(`${home_path}/`)) {
        return `~${path.slice(home_path.length)}`;
    }
    return path;
}

/**
 * A directory's entries.
 *
 * In `children` ORDER, never sorted. Explorer renders the same array
 * (`Viewer2.svelte:23-29`) so the two views agree, and the seed order is
 * reverse-chronological — alphabetising would open the CV with "Corporatica,
 * Mentorness, Printerpix" instead of the current role first.
 */
export function children_of(
    id: string,
    drive: HardDrive,
    all = false,
): VfsItem[] {
    if (id === ROOT) return roots(drive);
    const item = drive[id];
    if (item == null) return [];
    return item.children.flatMap((child_id) => {
        const child = drive[child_id];
        if (child == null) return [];
        // The Explorer's own hidden set, so `ls` and Explorer hide the same
        // three things. `-a` shows them, as bash does for dotfiles.
        if (!all && hidden_items.includes(child.id)) return [];
        return [child];
    });
}

/**
 * Match one path segment against a directory's entries.
 *
 * Case-INSENSITIVE, unlike `find_command`, and deliberately so: commands are
 * bash (case-sensitive, so the shell cannot accept `HELP` while advertising
 * `help`) but paths are an NTFS drive, where case-insensitive is the correct
 * semantic — and §3.2's own example is `cd experience` against `Experience`.
 *
 * Three tiers, so a visitor can drop the extension the Explorer shows:
 * exact name, then case-folded name, then case-folded `basename`. A tie inside
 * a tier takes the first in `children` order; ties need a rename to create and
 * Explorer resolves them the same arbitrary way.
 *
 * Hidden entries ARE matched: bash hides dotfiles from `ls` but still lets you
 * `cd` into them.
 */
function match_child(
    parent_id: string,
    segment: string,
    drive: HardDrive,
): string | null {
    const folded = segment.toLowerCase();

    if (parent_id === ROOT) {
        const found = roots(drive).find(
            (item) =>
                drive_segment(item) === folded ||
                item.name.toLowerCase() === folded,
        );
        return found?.id ?? null;
    }

    const entries = children_of(parent_id, drive, true);
    return (
        entries.find((item) => item.name === segment)?.id ??
        entries.find((item) => item.name.toLowerCase() === folded)?.id ??
        entries.find((item) => item.basename.toLowerCase() === folded)?.id ??
        null
    );
}

export type Resolved = { id: string } | { missing: string };

/**
 * Resolve a path against a working directory.
 *
 * `input` is the RAW remainder of the command line, not re-joined arguments:
 * Explorer's rename accepts arbitrary strings and `seed.ts` carries renames
 * across re-seeds, so `My  Notes` (two spaces) is creatable — and re-joining
 * split arguments with one space would list it in `ls` and never reach it in
 * `cd`, which is the terminal/Explorer disagreement this module exists to
 * prevent.
 */
export function resolve(
    input: string,
    cwd: string,
    drive: HardDrive,
): Resolved {
    const trimmed = strip_quotes(input.trim());
    const absolute = trimmed.startsWith('/');

    // A cwd whose folder was deleted in Explorer falls back home rather than
    // stranding the session somewhere no command can leave.
    let current = absolute ? ROOT : cwd;
    if (!absolute && current !== ROOT && drive[current] == null) {
        current = home_id(drive);
    }

    const segments = trimmed.split('/').filter((s) => s.length > 0);
    for (const [index, segment] of segments.entries()) {
        if (segment === '.') continue;
        if (segment === '..') {
            current = parent_of(current, drive);
            continue;
        }
        if (segment === '~' && index === 0 && !absolute) {
            current = home_id(drive);
            continue;
        }
        const next = match_child(current, segment, drive);
        if (next == null) return { missing: segment };
        current = deref(next, drive);
    }
    return { id: current };
}

/**
 * Strip ONE layer of matching surrounding quotes.
 *
 * Tab completion inserts bare names, so quotes are only ever typed by hand —
 * but a visitor reaching for them out of shell habit should not be punished
 * for it.
 */
export function strip_quotes(input: string): string {
    const first = input.at(0);
    // `length > 1` or a lone `"` is both the opening and the closing quote and
    // strips to nothing, which then reads as "no argument".
    if (
        input.length > 1 &&
        (first === '"' || first === "'") &&
        input.endsWith(first)
    ) {
        return input.slice(1, -1);
    }
    return input;
}
