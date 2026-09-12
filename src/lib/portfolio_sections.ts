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
import type { PortfolioSection } from './types';

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
