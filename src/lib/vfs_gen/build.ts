/** Pure portfolio→VFS tree builder. No I/O, no Date.now(), no randomness. */
import type { Profile } from '../profile';
import type { PortfolioRef, PortfolioSection, VfsItem } from '../types';
import { entry_id, slug } from './ids';

export { slug };

export const SEED_EPOCH = 1676799354180;

// Full path — the icons map in system.ts stores the bare 'TXT.png', but
// per-item `icon` is consumed verbatim as url(${item.icon}) (viewer.svelte,
// title bars); a bare filename would render a broken image.
const TXT_ICON = '/images/xp/icons/TXT.png';

export interface PortfolioBuild {
    items: Record<string, VfsItem>;
    folder_ids: string[];
    entry_ids: string[];
    projects_folder_id: string;
    resume_file_id: string;
}

const FOLDERS: { id: string; name: string; section: PortfolioSection }[] = [
    { id: 'p2FolderExperience', name: 'Experience', section: 'experience' },
    { id: 'p2FolderProjects', name: 'Projects', section: 'projects' },
    { id: 'p2FolderEducation', name: 'Education', section: 'education' },
    { id: 'p2FolderSkills', name: 'Skills', section: 'skills' },
    {
        id: 'p2FolderCertifications',
        name: 'Certifications',
        section: 'certifications',
    },
    { id: 'p2FolderAwards', name: 'Awards', section: 'awards' },
];

function base_item(
    id: string,
    parent: string,
): Omit<VfsItem, 'type' | 'name' | 'basename' | 'ext'> {
    return {
        id,
        parent,
        children: [],
        date_created: SEED_EPOCH,
        date_modified: SEED_EPOCH,
        sort_option: 0,
        sort_order: 0,
    };
}

function entry_file(
    section: PortfolioSection,
    basename: string,
    key: PortfolioRef['key'],
    folder_id: string,
    id_suffix = '',
): VfsItem {
    return {
        // suffix disambiguates duplicate titles within a section (gate-6 L1:
        // e.g. two degrees at one institution would otherwise collide/throw)
        ...base_item(entry_id(section, basename) + id_suffix, folder_id),
        type: 'file',
        basename,
        name: `${basename}.txt`,
        ext: '.txt',
        size: 1,
        icon: TXT_ICON,
        portfolio_ref: { section, key },
    };
}

/**
 * The display filename for an asset URL — used so a file's name is not spelled
 * a second time beside the URL that already contains it.
 *
 * `ext` derived from this is NOT cosmetic: it picks the icon (`file_icon.ts`),
 * prints the Type cell (`details_columns.ts`) and selects the double-click
 * handler (`system.ts` doctypes). So a query string or fragment must be
 * stripped — `.pdf?v=2` would silently unbind the PDF viewer — and a decoded
 * `/` must be refused, because `cmd/path.ts` splits names on it.
 *
 * Throws rather than degrading. This runs at generation time AND, through
 * `python/mirror.ts`, in the browser; but a bad value cannot reach production
 * because `npm run generate:vfs` runs in CI, so failing loudly here surfaces an
 * authoring mistake at the only moment anyone can act on it. Same stance as the
 * duplicate-id throw above.
 */
export function file_name_from_url(url: string): string {
    const path = url.split(/[?#]/)[0] ?? '';
    const last = path.slice(path.lastIndexOf('/') + 1);
    let decoded: string;
    try {
        decoded = decodeURIComponent(last);
    } catch {
        // a stray `%` is not valid percent-encoding; the raw segment is the
        // honest reading and the checks below still apply to it
        decoded = last;
    }
    if (decoded === '') {
        throw new Error(`vfs_gen: no filename in asset URL "${url}"`);
    }
    if (decoded.includes('/') || decoded.includes('\\')) {
        throw new Error(
            `vfs_gen: asset URL "${url}" decodes to a name containing a path ` +
                `separator ("${decoded}") — it would be unaddressable from CMD`,
        );
    }
    return decoded;
}

export function build_portfolio(
    profile: Profile,
    /**
     * Size in KB of an asset under `static/`, injected so this module stays
     * pure and node-free. The CV hardcodes 136 and has been free to drift
     * since; a certificate reports what it actually weighs.
     */
    asset_size_kb: (url: string) => number = () => 1,
): PortfolioBuild {
    const items: Record<string, VfsItem> = {};
    const entry_ids: string[] = [];

    const add = (item: VfsItem): void => {
        if (items[item.id] != null) {
            throw new Error(`vfs_gen id collision: ${item.id}`);
        }
        items[item.id] = item;
    };

    const per_section: Record<PortfolioSection, VfsItem[]> = {
        experience: profile.experience.map((e, i) =>
            entry_file(
                'experience',
                `${e.company} — ${e.role}`,
                i,
                'p2FolderExperience',
                String(i),
            ),
        ),
        projects: profile.projects.map((p, i) =>
            entry_file('projects', p.name, i, 'p2FolderProjects', String(i)),
        ),
        education: profile.education.map((e, i) =>
            entry_file(
                'education',
                e.institution,
                i,
                'p2FolderEducation',
                String(i),
            ),
        ),
        skills: Object.keys(profile.skills).map((category) =>
            entry_file('skills', category, category, 'p2FolderSkills'),
        ),
        certifications: profile.certifications.map((c, i) =>
            entry_file(
                'certifications',
                c.title,
                i,
                'p2FolderCertifications',
                String(i),
            ),
        ),
        awards: profile.awards.map((a, i) =>
            entry_file('awards', a.title, i, 'p2FolderAwards', String(i)),
        ),
    };

    /*
     * Files a section ships that are NOT portfolio entries — today, the
     * certificate PDFs, one per certification that has one, named from the
     * same title so each lands beside its own `.txt`: the text is the summary,
     * the PDF is the credential. `.pdf` picks up the PDF viewer through
     * `doctypes`, so a double-click reads it.
     *
     * Kept out of `entry_ids` deliberately. That list becomes
     * `PORTFOLIO_ENTRY_IDS`, which `protected_items` uses to make the entries
     * undeletable, and it is also what `portfolio_ref` lookups walk — a PDF
     * carries no ref and, like `CV.pdf`, is the visitor's to delete.
     */
    const extras: Partial<Record<PortfolioSection, VfsItem[]>> = {
        certifications: profile.certifications.flatMap((cert, i) => {
            const url = cert.pdf;
            if (url == null || url === '') return [];
            return [
                {
                    ...base_item(
                        `${entry_id('certifications', cert.title) + String(i)}Pdf`,
                        'p2FolderCertifications',
                    ),
                    type: 'file' as const,
                    basename: cert.title,
                    name: `${cert.title}.pdf`,
                    ext: '.pdf',
                    storage_type: 'remote' as const,
                    url,
                    size: asset_size_kb(url),
                },
            ];
        }),
    };

    for (const folder of FOLDERS) {
        const children = per_section[folder.section];
        const extra = extras[folder.section] ?? [];
        add({
            // parent stamped by the generator script (C: drive id)
            ...base_item(folder.id, ''),
            type: 'folder',
            basename: folder.name,
            name: folder.name,
            ext: '',
            icon: '/images/xp/icons/FolderClosed.png',
            starting_point: true,
            children: [...children, ...extra].map((c) => c.id),
        });
        for (const child of children) {
            add(child);
            entry_ids.push(child.id);
        }
        for (const child of extra) add(child);
    }

    const resume_file_id = 'p2FileResumePdf';
    const resume_url = profile.meta.resumePdf;
    const resume_filename = file_name_from_url(resume_url);
    const resume_dot = resume_filename.lastIndexOf('.');
    add({
        // parent stamped by the generator script
        ...base_item(resume_file_id, ''),
        type: 'file',
        basename:
            resume_dot > 0
                ? resume_filename.slice(0, resume_dot)
                : resume_filename,
        name: resume_filename,
        ext: resume_dot > 0 ? resume_filename.slice(resume_dot) : '',
        storage_type: 'remote',
        url: resume_url,
        size: 136,
    });

    return {
        items,
        folder_ids: FOLDERS.map((f) => f.id),
        entry_ids,
        projects_folder_id: 'p2FolderProjects',
        resume_file_id,
    };
}
