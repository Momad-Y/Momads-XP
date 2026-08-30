/**
 * `ls`, `dir`, `cd`, `pwd` and `cat` — SPECIFICATION.md §3.2's filesystem
 * navigation, over the real drive (see `path.ts` for the path model).
 *
 * Pure, like the rest of the command layer: the drive and the working
 * directory are passed IN and a new working directory is passed back, so the
 * whole surface is unit-testable without a browser. It is dispatched from
 * `cmd.svelte` rather than from `registry.ts` because it needs host state,
 * which is the same reason `color`, `clear`, `python`, `matrix`, `hack` and
 * `exit` are dispatched there — and it keeps `registry.ts` pure
 * `(args, profile) => string[]`, the property that whole file is built around.
 */
import { resolve_portfolio_ref } from '../portfolio';
import type { HardDrive, VfsItem } from '../types';
import {
    accent,
    BLANK,
    dim,
    heading,
    indent,
    label,
    MAX_COLS,
    wrap,
    wrap_items,
} from './format';
import {
    children_of,
    display_path,
    home_id,
    is_dir,
    posix_path,
    resolve,
    ROOT,
} from './path';

export const FS_COMMANDS = ['ls', 'dir', 'cd', 'pwd', 'cat'] as const;

export interface ShellContext {
    /** `null` until the boot screen seeds it (`store.ts:22`). */
    drive: HardDrive | null;
    /** VFS id, or `path.ROOT`. */
    cwd: string;
}

export interface FsResult {
    lines: string[];
    /** Set ONLY by `cd`, and only when it succeeded. */
    cwd?: string;
    blank_after?: boolean;
}

/** Answer for anything asked before the drive exists. */
const NO_DRIVE: FsResult = {
    lines: [dim('the filesystem is still starting up — try again in a moment')],
};

/**
 * `dir`'s rib.
 *
 * The startup banner now tells visitors outright that this is a Linux shell in
 * a Command Prompt window, which makes `dir` the first thing a Windows-minded
 * visitor reaches for. Answering `command not found` is the one reply that
 * makes that joke land badly, so it lands here instead and then does the
 * useful thing anyway.
 */
const DIR_ASIDE =
    "dir: this shell only speaks Linux. Showing you 'ls' instead.";

/** Peel a leading `-a` / `--all`; everything after it is the path. */
function take_all_flag(rest: string): { all: boolean; path: string } {
    const match = /^\s*(-a|--all)(\s+|$)/.exec(rest);
    if (match == null) return { all: false, path: rest.trim() };
    return { all: true, path: rest.slice(match[0].length).trim() };
}

/** A directory entry as `ls` prints it: folders accented and slash-suffixed. */
function entry_label(item: VfsItem): string {
    return is_dir(item) ? accent(`${item.name}/`) : item.name;
}

function run_ls(rest: string, drive: HardDrive, cwd: string): FsResult {
    const { all, path } = take_all_flag(rest);
    const target = path === '' ? { id: cwd } : resolve(path, cwd, drive);
    if ('missing' in target) {
        return { lines: [`ls: ${target.missing}: No such file or directory`] };
    }

    // `ls <file>` names the file, as bash does, rather than printing nothing.
    const item = drive[target.id];
    if (item != null && !is_dir(item)) return { lines: [item.name] };

    const entries = children_of(target.id, drive, all).map(entry_label);
    // An empty directory prints NOTHING, which is what bash does. D: and F:
    // have no children, so this is reachable from the first `ls /`.
    return { lines: wrap_items(entries, MAX_COLS, '  ') };
}

function run_cd(rest: string, drive: HardDrive, cwd: string): FsResult {
    const path = rest.trim();
    // Bare `cd` goes home, as it does in any shell.
    if (path === '') return { lines: [], cwd: home_id(drive) };

    const target = resolve(path, cwd, drive);
    if ('missing' in target) {
        return { lines: [`cd: ${target.missing}: No such file or directory`] };
    }
    const item = drive[target.id];
    if (target.id !== ROOT && (item == null || !is_dir(item))) {
        return { lines: [`cd: ${path}: Not a directory`] };
    }
    return { lines: [], cwd: target.id };
}

function run_pwd(drive: HardDrive, cwd: string): FsResult {
    // The real path, never `~` — that is what `pwd` is for.
    return { lines: [posix_path(cwd, drive) ?? display_path(cwd, drive)] };
}

/**
 * The lines a portfolio entry prints.
 *
 * Deliberately the same shapes `experience` and `projects` already use in
 * `registry.ts` — heading, dim meta, indented body, dim ` · `-joined chips —
 * so `cat` and the block commands are one rendering rather than two that
 * drift.
 */
function portfolio_lines(item: VfsItem): string[] | null {
    const ref = item.portfolio_ref;
    if (ref == null) return null;
    const detail = resolve_portfolio_ref(ref);
    // Null when profile.json and the generated VFS have drifted apart; fall
    // through to the generic description rather than printing a blank.
    if (detail == null) return null;

    const meta = [
        ...(detail.subheading == null ? [] : [detail.subheading]),
        ...detail.meta_lines,
    ];
    return [
        heading(detail.heading),
        ...(meta.length === 0 ? [] : [`  ${dim(meta.join(' · '))}`]),
        ...detail.bullets.flatMap((b) => indent(wrap(b, 68))),
        ...(detail.chips.length === 0
            ? []
            : indent(wrap_items(detail.chips, 68, ' · ').map((l) => dim(l)))),
        ...(detail.link == null
            ? []
            : [`  ${label(detail.link.label)}  ${detail.link.url}`]),
        // Named rather than dropped: the portfolio viewer shows these, and a
        // terminal that silently shows less is a disagreement, not a medium.
        ...(detail.images.length === 0
            ? []
            : [
                  `  ${dim(
                      `[${String(detail.images.length)} image${
                          detail.images.length === 1 ? '' : 's'
                      } — open this file in My Computer to see ${
                          detail.images.length === 1 ? 'it' : 'them'
                      }]`,
                  )}`,
              ]),
    ];
}

/** What a file that has no text to print says about itself. */
function described(item: VfsItem): string[] {
    const kind =
        item.ext === '' ? 'file' : `${item.ext.slice(1).toUpperCase()} file`;
    const size = item.size == null ? '' : `${String(item.size)} KB `;
    return [
        dim(
            `${item.name}: ${size}${kind} — open it from My Computer to view it`,
        ),
    ];
}

function run_cat(rest: string, drive: HardDrive, cwd: string): FsResult {
    const path = rest.trim();
    if (path === '') return { lines: ['cat: missing operand'] };

    const target = resolve(path, cwd, drive);
    if ('missing' in target) {
        return { lines: [`cat: ${target.missing}: No such file or directory`] };
    }
    const item = drive[target.id];
    if (target.id === ROOT || item == null || is_dir(item)) {
        return { lines: [`cat: ${path}: Is a directory`] };
    }
    const portfolio = portfolio_lines(item);
    return portfolio == null
        ? { lines: described(item) }
        : { lines: portfolio, blank_after: true };
}

export function run_fs(
    name: string,
    rest: string,
    { drive, cwd }: ShellContext,
): FsResult {
    if (drive == null) return NO_DRIVE;

    switch (name) {
        case 'ls':
            return run_ls(rest, drive, cwd);
        case 'dir': {
            const listed = run_ls(rest, drive, cwd);
            return {
                ...listed,
                lines: [dim(DIR_ASIDE), BLANK, ...listed.lines],
            };
        }
        case 'cd':
            return run_cd(rest, drive, cwd);
        case 'pwd':
            return run_pwd(drive, cwd);
        case 'cat':
            return run_cat(rest, drive, cwd);
        default:
            return { lines: [] };
    }
}

/**
 * The remainder of a command line after its first word, spacing intact.
 *
 * NOT `parse().args.join(' ')`: Explorer's rename accepts arbitrary strings, so
 * `My  Notes` (two spaces) is creatable, and re-joining split arguments would
 * list it in `ls` and never reach it in `cd`.
 */
export function remainder(input: string): string {
    const trimmed = input.trim();
    const first_space = trimmed.search(/\s/);
    if (first_space === -1) return '';
    // Only the gap between the command and its argument is collapsed. Spacing
    // INSIDE the argument is the whole point and is left exactly as typed.
    return trimmed.slice(first_space + 1).replace(/^\s+/, '');
}
