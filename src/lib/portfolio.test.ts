import { describe, expect, it } from 'vitest';
import { resolve_portfolio_ref } from './portfolio';
import { profile } from './profile';

describe('resolve_portfolio_ref', () => {
    it('maps an experience entry to a full detail', () => {
        const d = resolve_portfolio_ref({ section: 'experience', key: 0 });
        expect(d?.heading).toBe(profile.experience[0]?.role);
        expect(d?.subheading).toBe(profile.experience[0]?.company);
        expect(d?.meta_lines).toEqual([
            profile.experience[0]?.period,
            profile.experience[0]?.location,
        ]);
        expect(d?.bullets).toEqual(profile.experience[0]?.description);
    });

    it('maps a project with tech chips and link', () => {
        const p = profile.projects[0];
        const d = resolve_portfolio_ref({ section: 'projects', key: 0 });
        expect(d?.heading).toBe(p?.name);
        expect(d?.bullets).toEqual([p?.description]);
        expect(d?.chips).toEqual(p?.tech);
        expect(d?.link?.url).toBe(p?.url);
    });

    it('maps a skills category via string key', () => {
        const d = resolve_portfolio_ref({
            section: 'skills',
            key: 'NLP & LLMs',
        });
        expect(d?.heading).toBe('NLP & LLMs');
        expect(d?.bullets).toEqual(profile.skills['NLP & LLMs']);
    });

    it('maps education with honors as a meta line', () => {
        const d = resolve_portfolio_ref({ section: 'education', key: 0 });
        expect(d?.heading).toBe(profile.education[0]?.degree);
        expect(d?.subheading).toBe(profile.education[0]?.institution);
        expect(d?.meta_lines).toContain(profile.education[0]?.honors);
    });

    it('tolerates an award with empty year', () => {
        const idx = profile.awards.findIndex((a) => a.year === '');
        const d = resolve_portfolio_ref({ section: 'awards', key: idx });
        expect(d).not.toBeNull();
        expect(d?.meta_lines).toEqual([]);
    });

    it('returns null on out-of-range or unknown keys', () => {
        expect(
            resolve_portfolio_ref({ section: 'experience', key: 999 }),
        ).toBeNull();
        expect(
            resolve_portfolio_ref({ section: 'skills', key: 'Nope' }),
        ).toBeNull();
        expect(resolve_portfolio_ref({ section: 'skills', key: 3 })).toBeNull();
    });
});
