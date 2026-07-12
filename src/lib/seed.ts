/**
 * VFS seed versioning (SPECIFICATION.md §6.7).
 *
 * The base repo fetched `static/json/hard_drive.json` once, stored it in
 * IndexedDB, and never refreshed it — so seed edits (pruned programs, new
 * portfolio content) would never reach returning visitors. The boot path
 * compares the stored version with SEED_VERSION and re-seeds on mismatch.
 *
 * SEED_VERSION is the sha256 (hex, first 32 chars) of static/json/hard_drive.json.
 * Recompute after ANY seed edit:
 *     sha256sum static/json/hard_drive.json | cut -c1-32
 * (Phase 2 replaces this hand stamp with the generate-vfs build step.)
 */
export const SEED_VERSION = 'da245617202ea60c5a32c74f4a5e9df3';

export function shouldReseed(stored: string | null | undefined): boolean {
    return stored !== SEED_VERSION;
}
