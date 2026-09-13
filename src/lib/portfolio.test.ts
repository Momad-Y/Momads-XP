import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolve_portfolio_ref } from './portfolio';
import { profile } from './profile';
import { entry_text } from './python/mirror';
import { DOCUMENTS_FOLDER_ID, find_document } from './portfolio_sections';
import { required, to_hard_drive } from './types';

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

    /*
     * The descriptions the owner writes on LinkedIn — for credentials and for
     * the degree — had nowhere to live: `CertificateOrAward` was
     * `{title, year, images, pdf?}` and `EducationEntry` had no prose field at
     * all, so five awards and a four-year degree rendered as a heading, a date
     * and a gallery. Nothing needed to change in any renderer:
     * `PortfolioDetail.bullets` was already the section-agnostic channel that
     * the viewer prints as a `<ul>` and `entry_text` prints as `- ` lines —
     * these two resolvers were simply passing `[]` into it.
     */
    it('passes every credential description through as bullets', () => {
        expect(profile.certificatesAndAwards.length).toBeGreaterThan(0);
        let with_prose = 0;
        profile.certificatesAndAwards.forEach((credential, i) => {
            const d = resolve_portfolio_ref({
                section: 'certificatesAndAwards',
                key: i,
            });
            expect(d?.bullets, credential.title).toEqual(
                credential.description,
            );
            if (credential.description.length > 0) with_prose += 1;
        });
        // guards the loop from passing on an all-empty profile
        expect(with_prose).toBeGreaterThan(2);
    });

    it('passes the degree description through as bullets', () => {
        expect(profile.education.length).toBeGreaterThan(0);
        profile.education.forEach((entry, i) => {
            const d = resolve_portfolio_ref({ section: 'education', key: i });
            expect(d?.bullets, entry.institution).toEqual(entry.description);
        });
        expect(profile.education[0]?.description.length).toBeGreaterThan(3);
    });

    it('reaches CMD and the Python mirror, not just the window', () => {
        // `entry_text` is what `cat` prints and what the /c mirror carries, and
        // it renders `bullets` — so a description that never reached `bullets`
        // would be invisible in two of the three places it should appear
        const detail = resolve_portfolio_ref({
            section: 'certificatesAndAwards',
            key: profile.certificatesAndAwards.findIndex(
                (c) => c.description.length > 0,
            ),
        });
        const first = detail?.bullets[0] ?? '';
        expect(first).not.toBe('');
        expect(entry_text(required(detail, 'detail'))).toContain(`- ${first}`);
    });

    /*
     * The line naming a credential's PDF must never outlive the PDF. Those
     * files are deletable on purpose — only the entry `.txt`s and the CV are
     * protected — so an entry that keeps printing
     * "My Documents\\Certificates & Awards\\…" after the visitor binned it is
     * telling them to look somewhere empty.
     */
    describe('the document line follows the drive, not a constant', () => {
        const with_pdf = profile.certificatesAndAwards.findIndex(
            (c) => c.pdf != null && c.pdf !== '',
        );
        const ref = {
            section: 'certificatesAndAwards',
            key: with_pdf,
        } as const;

        it('names the document where the locator says it is', () => {
            const d = resolve_portfolio_ref(ref, () => '~/somewhere/else.pdf');
            expect(d?.meta_lines).toContain('~/somewhere/else.pdf');
        });

        it('says nothing at all once the document is gone', () => {
            const d = resolve_portfolio_ref(ref, () => null);
            expect(d?.meta_lines.some((l) => l.endsWith('.pdf'))).toBe(false);
            // the year is still there — losing the file must not lose the rest
            const credential = profile.certificatesAndAwards[with_pdf];
            expect(d?.meta_lines).toEqual(
                credential?.year === '' ? [] : [credential?.year],
            );
        });

        it('asks for the file name the generator actually seeds', () => {
            const asked: string[] = [];
            resolve_portfolio_ref(ref, (name) => {
                asked.push(name);
                return null;
            });
            const credential = required(
                profile.certificatesAndAwards[with_pdf],
                'credential with a pdf',
            );
            // `vfs_gen/build.ts` names the seeded PDF after the TITLE, not
            // after its URL — a locator handed the wrong name finds nothing
            // and the line silently disappears for everyone
            expect(asked).toEqual([`${credential.title}.pdf`]);
        });

        it('finds the real one in the shipped drive', () => {
            const drive = to_hard_drive(
                JSON.parse(
                    readFileSync('static/json/hard_drive.json', 'utf-8'),
                ),
            );
            const credential = required(
                profile.certificatesAndAwards[with_pdf],
                'credential with a pdf',
            );
            const found = find_document(drive, `${credential.title}.pdf`);
            expect(found, 'no seeded PDF under the documents folder').not.toBe(
                null,
            );
            expect(drive[found ?? '']?.ext).toBe('.pdf');
        });

        it('finds nothing once that folder is gone from the drive', () => {
            const drive = to_hard_drive(
                JSON.parse(
                    readFileSync('static/json/hard_drive.json', 'utf-8'),
                ),
            );
            const credential = required(
                profile.certificatesAndAwards[with_pdf],
                'credential with a pdf',
            );
            const without = Object.fromEntries(
                Object.entries(drive).filter(
                    ([id]) => id !== DOCUMENTS_FOLDER_ID,
                ),
            );
            expect(
                find_document(without, `${credential.title}.pdf`),
            ).toBeNull();
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
