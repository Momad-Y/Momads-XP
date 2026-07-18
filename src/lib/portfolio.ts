/**
 * Resolves a generator-stamped PortfolioRef into a normalized, render-ready
 * detail (Phase 2 spec D1: section-aware — every schema field is mapped;
 * optional fields collapse to empty).
 */
import { profile } from './profile';
import type { ProfileImage } from './profile';
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
        case 'awards': {
            if (typeof ref.key !== 'number') return null;
            const a = profile.awards[ref.key];
            if (a == null) return null;
            return {
                heading: a.title,
                meta_lines: non_empty([a.year]),
                bullets: [],
                chips: [],
                images: a.images,
            };
        }
        case 'certifications': {
            if (typeof ref.key !== 'number') return null;
            const c = profile.certifications[ref.key];
            if (c == null) return null;
            return {
                heading: c.title,
                meta_lines: [],
                bullets: [],
                chips: [],
                images: c.images,
            };
        }
    }
}
