/**
 * Resolving the thumbnail behind a file icon, without letting a missing file
 * take anything down.
 *
 * WHY THIS IS NOT JUST `await fs.get_url(id)` AT THE CALL SITE: `get_url`
 * deliberately fails fast. It `required()`s the idb payload, so an item whose
 * bytes are not there throws — and the thumbnail loader called it bare inside
 * a `void load_preview()`, which turns that throw into an UNHANDLED PROMISE
 * REJECTION. The icon still drew (it falls back to its default), so the only
 * symptom was a red console error nobody could trace, sitting there masking
 * real ones.
 *
 * An item CAN lose its bytes, and not only through developer error:
 *   - the blob write failed on a full origin while the drive record still
 *     landed — `fs.ts` documents exactly this quota failure mode;
 *   - the drive was carried across a seed change from an older version of the
 *     site, where the item came from a seed that no longer ships it;
 *   - `save_file` mints a fresh blob key and never deletes the old one, so a
 *     stale key can outlive what it pointed at.
 *
 * `pdf_viewer` and `portfolio_viewer` both already wrap this call in a
 * try/catch, and `pdf_viewer` revokes its object URLs too. The thumbnail
 * loader had neither — the same "a rule applied at one call site while its
 * siblings were left alone" shape `CMFSItem.ts` keeps a tally of.
 *
 * Kept here rather than inlined in the component so the behaviour is unit
 * testable: the mounting stays in Svelte, the decision lives in TypeScript.
 */

/** Resolves an fs id to something renderable. Matches `fs.get_url`. */
export type UrlResolver = (id: string) => Promise<string | undefined>;

/**
 * A thumbnail URL, or null when there is nothing to show.
 *
 * NEVER REJECTS. Null covers every "no picture here" case — no id, a resolver
 * that returned nothing, and a resolver that threw — because the caller does
 * the same thing in all three: leave the default icon alone.
 */
export async function resolve_preview(
    fs_id: string | null,
    get_url: UrlResolver,
): Promise<string | null> {
    if (fs_id == null) return null;
    try {
        return (await get_url(fs_id)) ?? null;
    } catch {
        // Deliberately swallowed, and deliberately not logged: a file whose
        // bytes are gone is a drawable state, not an error the visitor can do
        // anything about, and this runs once per icon on screen.
        return null;
    }
}

/**
 * Whether this URL is ours to release.
 *
 * `get_url` hands back the item's own path for a `remote` file and a FRESH
 * object URL for a local one. Revoking the former does nothing; failing to
 * revoke the latter leaks the blob for as long as the page lives, which is
 * what the thumbnail loader was doing once per previewed image.
 */
export function is_object_url(url: string | null): boolean {
    return url != null && url.startsWith('blob:');
}
