import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolve_portfolio_ref } from './portfolio';
import { profile } from './profile';
import { to_hard_drive } from './types';

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

    it('lists a credential year as a meta line, and omits an empty one', () => {
        /*
         * This used to hunt profile.awards for an entry with `year: ''` and
         * assert the empty case — so it silently stopped testing anything the
         * moment every award got a year, and `findIndex` returning -1 made it
         * fail rather than skip. Asserted per entry instead: whatever the data
         * holds, the rule is the same.
         */
        expect(profile.certificatesAndAwards.length).toBeGreaterThan(0);
        profile.certificatesAndAwards.forEach((credential, i) => {
            const d = resolve_portfolio_ref({
                section: 'certificatesAndAwards',
                key: i,
            });
            expect(d, credential.title).not.toBeNull();
            expect(d?.meta_lines[0] ?? '').toBe(credential.year);
        });
    });

    /*
     * The `.txt` must SAY where the document is. The four certificates that
     * merged into this section had no meta lines at all and no way to mention
     * their PDF, so the certificate itself — sitting under My Documents — was
     * undiscoverable from the text that described it.
     *
     * Resolved against the generated drive rather than compared to a string:
     * that is the only way the printed path and the file's real location
     * cannot drift apart, which is the failure this repo keeps paying for.
     */
    it('prints a path that really resolves, for every credential with a PDF', () => {
        // `to_hard_drive` narrows rather than asserts — the same way
        // `cmd/path.test.ts` loads the shipped seed
        const drive = to_hard_drive(
            JSON.parse(readFileSync('static/json/hard_drive.json', 'utf-8')),
        );
        const full_path = (id: string): string => {
            const parts: string[] = [];
            let cur = drive[id];
            while (cur != null) {
                parts.unshift(cur.name);
                cur = cur.parent == null ? undefined : drive[cur.parent];
            }
            // `C:\` is the drive root; the printed path starts below it
            return parts.slice(1).join('\\');
        };
        const paths = new Set(Object.keys(drive).map(full_path));

        const with_pdf = profile.certificatesAndAwards.filter(
            (c) => c.pdf != null && c.pdf !== '',
        );
        expect(with_pdf.length).toBeGreaterThan(0);
        for (const [i, credential] of profile.certificatesAndAwards.entries()) {
            const d = resolve_portfolio_ref({
                section: 'certificatesAndAwards',
                key: i,
            });
            const printed = (d?.meta_lines ?? []).filter((l) =>
                l.endsWith('.pdf'),
            );
            if (credential.pdf == null || credential.pdf === '') {
                expect(printed, `${credential.title} has no PDF`).toEqual([]);
                continue;
            }
            expect(
                printed,
                `${credential.title} names no document`,
            ).toHaveLength(1);
            expect(
                paths.has(printed[0] ?? ''),
                `${printed[0] ?? ''} is not in the drive`,
            ).toBe(true);
        }
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
