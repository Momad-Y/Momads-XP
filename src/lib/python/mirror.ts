/**
 * The read-only `/c` the Python REPL sees.
 *
 * SYNTHESISED from `profile.json`, not mirrored from the VFS, for two reasons
 * the spec records (`docs/python-fs-spec.md` D-F1):
 *
 *  1. There is nothing to mirror. The 28 portfolio `.txt` items in the seed
 *     carry no `storage_type` and no `url` — they are pointers into
 *     `profile.json`, not files with bytes.
 *  2. Mirroring the whole drive would ship the VISITOR's own uploads into a
 *     context they fully control, while the sandbox's CSP permits
 *     `connect-src https://cdn.jsdelivr.net` — whose edge logs URLs. That
 *     turns a pasted "try this in the XP Python!" script into an exfiltration
 *     tool. Everything below is already published on the website.
 *
 * The tree is derived from `build_portfolio`, the same pure function the seed
 * generator uses, so folder and file NAMES cannot drift from what Explorer and
 * CMD's `ls` show. Reimplementing the naming here is exactly the drift this
 * repo keeps paying for.
 *
 * The TEXT is deliberately NOT `cat`'s rendering. `cat` hard-wraps at 68
 * columns and signs off with "open this file in My Computer to see them" —
 * terminal artefacts. A file read with `open().read()` should have neither.
 */
import { profile } from '../profile';
import { resolve_portfolio_ref } from '../portfolio';
import { build_portfolio } from '../vfs_gen/build';
import type { PortfolioDetail } from '../portfolio';

/** One node of the tree handed to the worker. Directories have no `text`. */
export interface MirrorEntry {
    /** Path under `/c`, e.g. `Experience/Printerpix — AI Engineer.txt`. */
    path: string;
    /** Present for files, absent for directories. */
    text?: string;
    /** Directories only: whether Python may write into it. */
    writable?: boolean;
}

/** `My Documents\Python`, the one place the REPL may write. */
export const OUTBOX_PATH = 'My Documents/Python';

/** Plain, unwrapped text for one portfolio entry. */
export function entry_text(detail: PortfolioDetail): string {
    const meta = [
        ...(detail.subheading == null ? [] : [detail.subheading]),
        ...detail.meta_lines,
    ];
    const blocks: string[] = [detail.heading];
    if (meta.length > 0) blocks.push(meta.join(' · '));
    if (detail.bullets.length > 0) {
        blocks.push(detail.bullets.map((b) => `- ${b}`).join('\n'));
    }
    if (detail.chips.length > 0)
        blocks.push(`Tech: ${detail.chips.join(', ')}`);
    if (detail.link != null)
        blocks.push(`${detail.link.label}: ${detail.link.url}`);
    return `${blocks.join('\n\n')}\n`;
}

/**
 * The whole tree, as a flat list. Directories come before their contents so a
 * consumer can create them in order without sorting.
 */
export function build_mirror(): MirrorEntry[] {
    const built = build_portfolio(profile);
    const entries: MirrorEntry[] = [];

    for (const folder_id of built.folder_ids) {
        const folder = built.items[folder_id];
        if (folder == null) continue;
        entries.push({ path: folder.name });

        for (const child_id of folder.children) {
            const child = built.items[child_id];
            if (child?.portfolio_ref == null) continue;
            const detail = resolve_portfolio_ref(child.portfolio_ref);
            // Null when profile.json and the generated tree have drifted; skip
            // rather than write a file whose content is a lie.
            if (detail == null) continue;
            entries.push({
                path: `${folder.name}/${child.name}`,
                text: entry_text(detail),
            });
        }
    }

    // The outbox. Empty on purpose: a returning visitor's saved files live in
    // the VFS and are visible to CMD's `ls`, but the mirror never reads the
    // drive, so Python does not see them until it saves again. Stated in the
    // guide rather than papered over.
    entries.push({ path: 'My Documents' });
    entries.push({ path: OUTBOX_PATH, writable: true });

    return entries;
}
