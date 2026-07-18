/** Deterministic id + slug helpers for the VFS generator (Phase 2 spec D2). */
import type { PortfolioSection } from '../types';

export function slug(text: string): string {
    return text
        .split(/[^a-zA-Z0-9]+/)
        .filter((w) => w.length > 0)
        .map((w) =>
            w === w.toUpperCase()
                ? w
                : (w[0]?.toUpperCase() ?? '') + w.slice(1),
        )
        .join('');
}

const pascal_section: Record<PortfolioSection, string> = {
    experience: 'Exp',
    projects: 'Proj',
    education: 'Edu',
    skills: 'Skill',
    awards: 'Award',
    certifications: 'Cert',
};

export function entry_id(section: PortfolioSection, key_text: string): string {
    return `p2${pascal_section[section]}${slug(key_text)}`;
}
