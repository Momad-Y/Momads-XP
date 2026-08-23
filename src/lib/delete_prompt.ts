/**
 * XP's delete-confirmation wording, as pure functions.
 *
 * The same rules were previously inlined in three places (CMFSItem.ts,
 * RecycleBin.ts and — added by the File-menu work — my_computer.svelte), which
 * let them drift. Keeping them here gives one source of truth AND real unit
 * coverage: the dialog *mounting* stays in the components (E2E-owned), only the
 * text/branching lives in .ts.
 */

/** XP truncates a long filename in the prompt rather than stretching the box. */
const MAX_NAME_LENGTH = 70;

export function truncate_name(name: string): string {
    return name.length > MAX_NAME_LENGTH
        ? name.slice(0, MAX_NAME_LENGTH) + '...'
        : name;
}

/** " and 1 other item" / " and N other items" / "" — XP's phrasing. */
export function other_items_suffix(count: number): string {
    if (count <= 1) return '';
    if (count === 2) return ' and 1 other item';
    return ` and ${String(count - 1)} other items`;
}

/**
 * Deleting from inside the Recycle Bin is permanent; anywhere else recycles.
 * Callers must decide this PER ITEM — a batch that mixes the two must not be
 * collapsed to one verdict, which is what permanently destroyed a live file
 * before (red-team CRITICAL).
 */
export function is_permanent_delete(
    parent_id: string | null | undefined,
    recycle_bin_id: string,
): boolean {
    return parent_id === recycle_bin_id;
}

export interface DeletePlan {
    /** Ids to actually remove, in order. */
    ids: string[];
    /** True only when EVERY item is already in the bin. */
    all_permanent: boolean;
    /** Name the prompt should lead with. */
    first_name: string;
    /** Per-item: does this one get destroyed outright? */
    permanent_ids: Set<string>;
}

/**
 * Works out what a delete should actually do, given a selection.
 *
 * Every caller previously decided this inline, and they disagreed: the
 * right-click menu applied one recycle-vs-permanent verdict to the whole batch
 * (so a batch spanning the Recycle Bin and the desktop destroyed the live file
 * outright) and did not skip protected items at all.
 */
export function plan_delete(
    selected_ids: string[],
    lookup: (id: string) => { name: string; parent?: string } | undefined,
    is_protected: (id: string) => boolean,
    recycle_bin_id: string,
): DeletePlan {
    const permanent_ids = new Set<string>();
    const ids: string[] = [];
    let first_name = '';

    for (const id of selected_ids) {
        const item = lookup(id);
        if (item == null) continue; // stale id on a cached drive
        if (is_protected(id)) continue; // e.g. portfolio entry files
        ids.push(id);
        if (first_name === '') first_name = item.name;
        if (is_permanent_delete(item.parent, recycle_bin_id)) {
            permanent_ids.add(id);
        }
    }

    return {
        ids,
        all_permanent: ids.length > 0 && permanent_ids.size === ids.length,
        first_name,
        permanent_ids,
    };
}

export function delete_prompt_icon(permanent: boolean): string {
    return permanent
        ? '/images/xp/icons/DeleteConfirmation.png'
        : '/images/xp/icons/RecycleBinempty.png';
}

/**
 * `permanent` is true only when EVERY item in the batch is already in the bin,
 * so the prompt can never promise "move to the Recycle Bin" while some item is
 * about to be destroyed outright.
 */
export function delete_prompt_message(
    first_name: string,
    count: number,
    permanent: boolean,
): string {
    const name = truncate_name(first_name);
    const suffix = other_items_suffix(count);
    return permanent
        ? `Do you want to permanently delete ${name}${suffix}? This action can't be undone?`
        : `Do you want to move ${name}${suffix} to the Recycle Bin?`;
}
