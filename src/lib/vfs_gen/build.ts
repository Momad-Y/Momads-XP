/** Pure portfolio→VFS tree builder. No I/O, no Date.now(), no randomness. */
import type { Profile } from '../profile';
import type { PortfolioRef, PortfolioSection, VfsItem } from '../types';
import { entry_id, slug } from './ids';
import { SECTION_LABELS } from '../portfolio_sections';

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
    /** Section folders to hang under `My Pictures`, in display order. */
    picture_section_ids: string[];
    /** Section folders to hang under `My Documents`, in display order. */
    document_section_ids: string[];
}

/** Where the asset trees are rooted. Injected so this module names no ids. */
export interface AssetRoots {
    pictures: string;
    documents: string;
}

/**
 * The portfolio folders, in `C:\` order.
 *
 * `id` and `picture_id` are EXPLICIT and never derived from `name`. The My
 * Pictures section id used to be `pic${slug(folder.name)}`, which made a
 * display rename mint a new id — and a new id is not a rename, it is a
 * migration: `merge_on_reseed` reaps the old container, and a visitor's own
 * files inside it go with it. `profile.ts`'s `MusicGenre` already argues this
 * exact point for `dir` vs `name`. So when Certifications and Awards became
 * one "Certificates & Awards", the surviving folder kept all three of its ids
 * (`p2FolderCertifications`, `picCertifications`, `docCertifications`) and
 * only its NAME changed — which is also what lets `user_edits` do the right
 * thing in both directions: a visitor who never renamed it gets the new name,
 * one who did keeps theirs.
 *
 * Names come from `SECTION_LABELS`, the single place a section is named.
 */
const FOLDERS: {
    id: string;
    picture_id: string;
    section: PortfolioSection;
}[] = [
    {
        id: 'p2FolderExperience',
        picture_id: 'picExperience',
        section: 'experience',
    },
    {
        id: 'p2FolderProjects',
        picture_id: 'picProjects',
        section: 'projects',
    },
    {
        id: 'p2FolderEducation',
        picture_id: 'picEducation',
        section: 'education',
    },
    { id: 'p2FolderSkills', picture_id: 'picSkills', section: 'skills' },
    {
        // was `Certifications`; `Awards` (`p2FolderAwards`) merged into it
        id: 'p2FolderCertifications',
        picture_id: 'picCertifications',
        section: 'certificatesAndAwards',
    },
];

/** A folder's display name — never an id input. */
const folder_name = (folder: { section: PortfolioSection }): string =>
    SECTION_LABELS[folder.section];

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

/**
 * The extension of an asset URL, lowercased.
 *
 * Query and fragment stripped for the reason `file_name_from_url` documents:
 * `ext` picks the icon, prints the Type cell and selects the double-click
 * handler, so `.pdf?v=2` would silently unbind the PDF viewer.
 */
function extname_of(url: string): string {
    const clean = (url.split('?')[0] ?? url).split('#')[0] ?? url;
    const dot = clean.lastIndexOf('.');
    const slash = clean.lastIndexOf('/');
    return dot > slash && dot >= 0 ? clean.slice(dot).toLowerCase() : '';
}

export function build_portfolio(
    profile: Profile,
    /**
     * Size in KB of an asset under `static/`, injected so this module stays
     * pure and node-free. The CV hardcodes 136 and has been free to drift
     * since; a certificate reports what it actually weighs.
     */
    asset_size_kb: (url: string) => number = () => 1,
    roots: AssetRoots = { pictures: 'MyPictures', documents: 'MyDocuments' },
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
        certificatesAndAwards: profile.certificatesAndAwards.map((c, i) =>
            entry_file(
                'certificatesAndAwards',
                c.title,
                i,
                'p2FolderCertifications',
                String(i),
            ),
        ),
    };

    for (const folder of FOLDERS) {
        const children = per_section[folder.section];
        const name = folder_name(folder);
        add({
            // parent stamped by the generator script (C: drive id)
            ...base_item(folder.id, ''),
            type: 'folder',
            basename: name,
            name,
            ext: '',
            icon: '/images/xp/icons/FolderClosed.png',
            starting_point: true,
            children: children.map((c) => c.id),
        });
        for (const child of children) {
            add(child);
            entry_ids.push(child.id);
        }
    }

    /*
     * MY PICTURES and MY DOCUMENTS — the galleries and credentials as real
     * files, organised type / item / file, the way anyone would expect to find
     * them: `My Pictures/Projects/EUC RAG Agent/…`.
     *
     * NO BYTES ARE DUPLICATED. Like the music tree, these entries point at the
     * SAME `static/` URLs the portfolio viewer already renders from
     * `profile.json` — only metadata is added, and `profile.json` stays the
     * source of truth for what exists.
     *
     * Only items that HAVE assets get a folder: an empty "Printerpix" folder
     * under My Pictures would be a promise the drive cannot keep (its work is
     * proprietary and there are no pictures of it).
     */
    const gallery: {
        section: PortfolioSection;
        basename: string;
        images: readonly { src: string; alt: string }[];
    }[] = [
        ...profile.experience.map((e) => ({
            section: 'experience' as const,
            basename: `${e.company} — ${e.role}`,
            images: e.images,
        })),
        ...profile.projects.map((p) => ({
            section: 'projects' as const,
            basename: p.name,
            images: p.images,
        })),
        ...profile.education.map((e) => ({
            section: 'education' as const,
            basename: e.institution,
            images: e.images,
        })),
        ...profile.certificatesAndAwards.map((c) => ({
            section: 'certificatesAndAwards' as const,
            basename: c.title,
            images: c.images,
        })),
    ];

    const picture_section_ids: string[] = [];
    for (const folder of FOLDERS) {
        const owners = gallery.filter(
            (g) => g.section === folder.section && g.images.length > 0,
        );
        if (owners.length === 0) continue;

        const section_id = folder.picture_id;
        const item_ids: string[] = [];
        for (const [i, owner] of owners.entries()) {
            const item_id = `${section_id}${slug(owner.basename)}${String(i)}`;
            const file_ids: string[] = [];
            /*
             * Names come from the ALT TEXT, which is the owner's own caption —
             * "BeMo at the 2025 project discussion.jpg" reads in Explorer where
             * "bemo-discussion-2.jpg" does not. Captions repeat, though, so
             * duplicates are numbered rather than allowed to collide: two files
             * of one name in one folder breaks the unique-sibling assumption
             * `clone_fs` and `create_shortcut` both rely on.
             */
            const used = new Map<string, number>();
            for (const [j, image] of owner.images.entries()) {
                const ext = extname_of(image.src);
                const wanted =
                    image.alt === '' ? `Image ${String(j + 1)}` : image.alt;
                const seen = used.get(wanted) ?? 0;
                used.set(wanted, seen + 1);
                const basename =
                    seen === 0 ? wanted : `${wanted} (${String(seen + 1)})`;
                const file_id = `${item_id}F${String(j)}`;
                add({
                    ...base_item(file_id, item_id),
                    type: 'file',
                    basename,
                    name: `${basename}${ext}`,
                    ext,
                    storage_type: 'remote',
                    url: image.src,
                    size: asset_size_kb(image.src),
                });
                file_ids.push(file_id);
            }
            add({
                ...base_item(item_id, section_id),
                type: 'folder',
                basename: owner.basename,
                name: owner.basename,
                ext: '',
                icon: '/images/xp/icons/MyPictures.png',
                children: file_ids,
            });
            item_ids.push(item_id);
        }
        add({
            ...base_item(section_id, roots.pictures),
            type: 'folder',
            basename: folder_name(folder),
            name: folder_name(folder),
            ext: '',
            icon: '/images/xp/icons/MyPictures.png',
            children: item_ids,
        });
        picture_section_ids.push(section_id);
    }

    /*
     * The credential documents, under `My Documents/Certificates & Awards/`.
     * One folder per SECTION but not per item: an entry carries at most ONE
     * document, so a per-item folder would hold a single file of the same
     * name. The per-item level exists for pictures because galleries hold
     * many. Entries with no document — four of the seven, and any award that
     * never came with paper — simply contribute nothing here.
     *
     * The id stays `docCertifications` across the rename; see `FOLDERS`.
     */
    const document_section_ids: string[] = [];
    const with_pdf = profile.certificatesAndAwards.filter(
        (c) => c.pdf != null && c.pdf !== '',
    );
    if (with_pdf.length > 0) {
        const section_id = 'docCertifications';
        const file_ids: string[] = [];
        for (const [i, cert] of with_pdf.entries()) {
            const url = cert.pdf ?? '';
            const ext = extname_of(url);
            const file_id = `${section_id}${slug(cert.title)}${String(i)}`;
            add({
                ...base_item(file_id, section_id),
                type: 'file',
                basename: cert.title,
                name: `${cert.title}${ext}`,
                ext,
                storage_type: 'remote',
                url,
                size: asset_size_kb(url),
            });
            file_ids.push(file_id);
        }
        add({
            ...base_item(section_id, roots.documents),
            type: 'folder',
            basename: SECTION_LABELS.certificatesAndAwards,
            name: SECTION_LABELS.certificatesAndAwards,
            ext: '',
            icon: '/images/xp/icons/FolderClosed.png',
            children: file_ids,
        });
        document_section_ids.push(section_id);
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
        picture_section_ids,
        document_section_ids,
    };
}
