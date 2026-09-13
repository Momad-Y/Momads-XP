/**
 * What each portfolio section is CALLED — the one place it is written.
 *
 * WHY THIS EXISTS: "Certificates & Awards" has to be the same string in five
 * places at once — the `C:\` folder, the My Pictures section folder, the My
 * Documents section folder, the path the detail view prints for a credential's
 * PDF, and the mobile accordion. Four of those are generated from `build.ts`
 * and would have shared a literal by accident; the other two would have been
 * copies, and this repo's scar tissue is a list of one rule applied at one of
 * two call sites (`term/render.ts` says the same thing about redraw).
 *
 * Keyed by `PortfolioSection`, so adding a section without naming it is a type
 * error rather than an empty label.
 */
import type { HardDrive, PortfolioSection } from './types';

/*
 * `as const satisfies`, not a type annotation: the annotation widens every
 * value to `string`, and the mobile layout needs the LITERAL type to put the
 * label in its own `SectionName` union without a cast (`no-unsafe-type-
 * assertion` is an error in this repo). `satisfies` still fails the build if a
 * section is missing or misspelled.
 */
export const SECTION_LABELS = {
    experience: 'Experience',
    projects: 'Projects',
    education: 'Education',
    skills: 'Skills',
    certificatesAndAwards: 'Certificates & Awards',
} as const satisfies Record<PortfolioSection, string>;

/**
 * The shell folder the credential documents hang under, as `vfs-base.json`
 * names it. Written here rather than imported because that file is the
 * generator's input and never ships to the client — `portfolio.test.ts` pins
 * the composed path against the generated drive, so a rename there fails a
 * test instead of printing a path that goes nowhere.
 */
const MY_DOCUMENTS = 'My Documents';

/**
 * The My Documents folder the credential PDFs live in.
 *
 * An ID, deliberately, and owned HERE rather than in `vfs_gen/build.ts` where
 * it used to be a bare literal: identity and display name belong together and
 * neither belongs to the generator. `build.ts` imports both from this module,
 * so a folder rename cannot mint a new id (the whole lesson of the
 * Certifications → Certificates & Awards merge) and a lookup cannot go
 * looking for a folder by a name the visitor may have changed.
 */
export const DOCUMENTS_FOLDER_ID = 'docCertifications';

/**
 * The live id of a credential's seeded PDF, or null if it is not there.
 *
 * By FOLDER ID and file name, not by path string: a visitor can rename that
 * folder (it is not protected), and asking the drive means the answer follows
 * them. Returns null once the file is gone — which is the point, see
 * `portfolio.ts`.
 */
export function find_document(
    drive: HardDrive,
    file_name: string,
): string | null {
    const folder = drive[DOCUMENTS_FOLDER_ID];
    if (folder == null) return null;
    for (const id of folder.children) {
        if (drive[id]?.name === file_name) return id;
    }
    return null;
}

/**
 * Where a credential's PDF actually sits, in the drive's own terms.
 *
 * The detail view had no way to say that the document exists: `profile.ts`
 * carries the `pdf` field but only `vfs_gen/build.ts` ever read it, so a
 * visitor reading a certificate's `.txt` got no hint that the certificate
 * itself was two folders away. Printing an in-world path keeps that inside the
 * illusion — an `href` to `/assets/…` would have opened a real browser tab and
 * bypassed the PDF viewer this desktop ships.
 */
export function document_path(file_name: string): string {
    return `${MY_DOCUMENTS}\\${SECTION_LABELS.certificatesAndAwards}\\${file_name}`;
}

/**
 * Where a credential's PDF is RIGHT NOW, in the idiom of the surface asking —
 * or null if the visitor has deleted it.
 *
 * `resolve_portfolio_ref` takes one of these instead of composing the path
 * itself, because it is pure over `profile.json` and cannot see the drive.
 * Explorer passes `finder.to_url` (`C:\…`), CMD passes `display_path`
 * (`~/…`), and the Python mirror passes nothing at all — it describes the
 * pristine seed, where the file is always present.
 */
export type DocumentLocator = (file_name: string) => string | null;
