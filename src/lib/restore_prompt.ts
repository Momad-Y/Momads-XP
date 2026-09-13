/**
 * Wording for the one case where Restore has to ask before it acts.
 *
 * A bin entry recycled BEFORE restore breadcrumbs shipped carries no record of
 * where it came from — `recycle_fs` did not exist, so the delete was a plain
 * clone into the bin. That origin is unrecoverable: nothing on the item, and
 * nothing anywhere else in the drive, says which folder it used to live in.
 * The seed would know, but it is only fetched when the version changes, so it
 * is not in memory to consult.
 *
 * Restoring such an entry has to put it SOMEWHERE, and the Desktop is the only
 * folder guaranteed to exist. Doing that silently is what made this read as a
 * bug — a file deleted from a folder reappearing on the Desktop looks broken
 * even though nothing was lost. So it is stated and made cancellable instead.
 *
 * Kept beside `delete_prompt.ts` and reusing its two helpers: the counting and
 * truncation rules are XP's, shared across every confirmation, and a second
 * copy of them would drift the way those three inlined copies did.
 */
import { other_items_suffix, truncate_name } from './delete_prompt';

/**
 * True when the visitor has to be asked before restoring `ids`.
 *
 * A mixed selection asks, because the batch as a whole cannot be honoured
 * exactly — some of it lands where it belongs and the rest does not.
 */
export function needs_restore_prompt(
    ids: readonly string[],
    origin_known: (id: string) => boolean,
): boolean {
    return ids.some((id) => !origin_known(id));
}

/**
 * XP's phrasing for "I do not know where this goes".
 *
 * Names the first item and counts the rest, exactly as the delete prompt does,
 * so the two read as the same dialog family.
 */
export function restore_prompt_message(
    first_name: string,
    count: number,
): string {
    const name = truncate_name(first_name);
    const suffix = other_items_suffix(count);
    return (
        `Windows cannot determine the original location of ${name}${suffix}. ` +
        'Restore to the Desktop instead?'
    );
}
