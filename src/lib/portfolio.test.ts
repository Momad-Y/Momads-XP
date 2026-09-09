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
        // the group NAME is content and gets renamed whenever the CV is
        // reorganised; what this test is about is the string-key lookup
        const key = Object.keys(profile.skills)[0];
        expect(key).toBeDefined();
        const d = resolve_portfolio_ref({
            section: 'skills',
            key: String(key),
        });
        expect(d?.heading).toBe(key);
        expect(d?.bullets).toEqual(profile.skills[String(key)]);
    });

    it('maps education with honors as a meta line', () => {
        const d = resolve_portfolio_ref({ section: 'education', key: 0 });
        expect(d?.heading).toBe(profile.education[0]?.degree);
        expect(d?.subheading).toBe(profile.education[0]?.institution);
        expect(d?.meta_lines).toContain(profile.education[0]?.honors);
    });

    it('lists an award year as a meta line, and omits an empty one', () => {
        /*
         * This used to hunt profile.awards for an entry with `year: ''` and
         * assert the empty case — so it silently stopped testing anything the
         * moment every award got a year, and `findIndex` returning -1 made it
         * fail rather than skip. Asserted per entry instead: whatever the data
         * holds, the rule is the same.
         */
        expect(profile.awards.length).toBeGreaterThan(0);
        profile.awards.forEach((award, i) => {
            const d = resolve_portfolio_ref({ section: 'awards', key: i });
            expect(d, award.title).not.toBeNull();
            expect(d?.meta_lines).toEqual(
                award.year === '' ? [] : [award.year],
            );
        });
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
