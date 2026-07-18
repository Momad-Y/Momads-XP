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

export function build_portfolio(profile: Profile): PortfolioBuild {
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

    for (const folder of FOLDERS) {
        const children = per_section[folder.section];
        add({
            // parent stamped by the generator script (C: drive id)
            ...base_item(folder.id, ''),
            type: 'folder',
            basename: folder.name,
            name: folder.name,
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

    const resume_file_id = 'p2FileResumePdf';
    add({
        // parent stamped by the generator script
        ...base_item(resume_file_id, ''),
        type: 'file',
        basename: 'Mohamed_Abdelnasser_Resume',
        name: 'Mohamed_Abdelnasser_Resume.pdf',
        ext: '.pdf',
        storage_type: 'remote',
        url: profile.meta.resumePdf,
        size: 61,
    });

    return {
        items,
        folder_ids: FOLDERS.map((f) => f.id),
        entry_ids,
        projects_folder_id: 'p2FolderProjects',
        resume_file_id,
    };
}
