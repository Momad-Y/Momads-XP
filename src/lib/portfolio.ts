/**
 * Resolves a generator-stamped PortfolioRef into a normalized, render-ready
 * detail (Phase 2 spec D1: section-aware — every schema field is mapped;
 * optional fields collapse to empty).
 */
import { profile } from './profile';
import type { ProfileImage } from './profile';
import { document_path } from './portfolio_sections';
import type { PortfolioRef } from './types';

export interface PortfolioDetail {
    heading: string;
    subheading?: string;
    meta_lines: string[];
    bullets: string[];
    chips: string[];
    link?: { label: string; url: string };
    images: ProfileImage[];
}

const non_empty = (lines: (string | undefined)[]): string[] =>
    lines.filter((l): l is string => l != null && l !== '');

/**
 * An asset URL's extension, `.pdf` included.
 *
 * The seeded document is named after the entry TITLE, not after its URL
 * (`vfs_gen/build.ts`), so the file name is title + this — the same two pieces
 * the generator puts together. `portfolio.test.ts` resolves the composed path
 * against the generated drive, so the two cannot drift apart in silence.
 */
const extname_of = (url: string): string => {
    const dot = url.lastIndexOf('.');
    const slash = url.lastIndexOf('/');
    return dot > slash ? url.slice(dot) : '';
};

export function resolve_portfolio_ref(
    ref: PortfolioRef,
): PortfolioDetail | null {
    switch (ref.section) {
        case 'experience': {
            if (typeof ref.key !== 'number') return null;
            const e = profile.experience[ref.key];
            if (e == null) return null;
            return {
                heading: e.role,
                subheading: e.company,
                meta_lines: non_empty([e.period, e.location]),
                bullets: e.description,
                chips: [],
                images: e.images,
            };
        }
        case 'projects': {
            if (typeof ref.key !== 'number') return null;
            const p = profile.projects[ref.key];
            if (p == null) return null;
            return {
                heading: p.name,
                meta_lines: [],
                bullets: [p.description],
                chips: p.tech,
                link:
                    p.url === ''
                        ? undefined
                        : { label: 'Visit project', url: p.url },
                images: p.images,
            };
        }
        case 'education': {
            if (typeof ref.key !== 'number') return null;
            const e = profile.education[ref.key];
            if (e == null) return null;
            return {
                heading: e.degree,
                subheading: e.institution,
                meta_lines: non_empty([e.period, e.honors]),
                bullets: [],
                chips: [],
                images: e.images,
            };
        }
        case 'skills': {
            if (typeof ref.key !== 'string') return null;
            const skills = profile.skills[ref.key];
            if (skills == null) return null;
            return {
                heading: ref.key,
                meta_lines: [],
                bullets: skills,
                chips: [],
                images: [],
            };
        }
        case 'certificatesAndAwards': {
            if (typeof ref.key !== 'number') return null;
            const c = profile.certificatesAndAwards[ref.key];
            if (c == null) return null;
            return {
                heading: c.title,
                /*
                 * The year, then where the document is — in the drive's own
                 * terms, not as a link. The four certificates that merged in
                 * here had NO meta lines before (their year was baked into the
                 * title) and no way to mention their PDF at all, so a visitor
                 * reading the text had no idea the certificate itself was
                 * sitting two folders away. `document_path` is shared with the
                 * generator's folder name so the printed path cannot drift
                 * from where the file actually lands.
                 */
                meta_lines: non_empty([
                    c.year,
                    c.pdf == null || c.pdf === ''
                        ? undefined
                        : document_path(`${c.title}${extname_of(c.pdf)}`),
                ]),
                bullets: [],
                chips: [],
                images: c.images,
            };
        }
    }
}
