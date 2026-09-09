import { statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { profile } from '../profile';
import { SEED_EPOCH, build_portfolio, file_name_from_url, slug } from './build';

describe('slug', () => {
    it('strips non-alphanumerics and PascalCases words', () => {
        expect(slug('Robotics Club — AASTMT')).toBe('RoboticsClubAASTMT');
        expect(slug('NLP & LLMs')).toBe('NLPLLMs');
    });
});

describe('build_portfolio', () => {
    const built = build_portfolio(profile);

    it('emits the six §3.1 folders in order', () => {
        expect(built.folder_ids).toEqual([
            'p2FolderExperience',
            'p2FolderProjects',
            'p2FolderEducation',
            'p2FolderSkills',
            'p2FolderCertifications',
            'p2FolderAwards',
        ]);
        for (const id of built.folder_ids) {
            expect(built.items[id]?.type).toBe('folder');
            expect(built.items[id]?.starting_point).toBe(true);
        }
    });

    it('creates one entry file per profile item with a stamped ref and icon', () => {
        const exp_folder = built.items['p2FolderExperience'];
        expect(exp_folder?.children).toHaveLength(profile.experience.length);
        const first = built.items[exp_folder?.children[0] ?? ''];
        expect(first?.ext).toBe('.txt');
        expect(first?.portfolio_ref).toEqual({ section: 'experience', key: 0 });
        expect(first?.icon).toBe('/images/xp/icons/TXT.png');
        const exp0 = profile.experience[0];
        if (exp0 == null) throw new Error('profile has no experience entries');
        expect(first?.name).toBe(`${exp0.company} — ${exp0.role}.txt`);
    });

    it('keys skills entries by category name', () => {
        const skills_folder = built.items['p2FolderSkills'];
        const refs = (skills_folder?.children ?? []).map(
            (id) => built.items[id]?.portfolio_ref,
        );
        expect(refs.map((r) => r?.key)).toEqual(Object.keys(profile.skills));
    });

    it('is deterministic: same input, byte-identical output', () => {
        expect(JSON.stringify(build_portfolio(profile))).toBe(
            JSON.stringify(built),
        );
        for (const item of Object.values(built.items)) {
            expect(item.date_created).toBe(SEED_EPOCH);
            expect(item.date_modified).toBe(SEED_EPOCH);
        }
    });

    it('names the resume from the URL, not a second hand-written spelling', () => {
        // Spelling the filename twice meant swapping in a differently-named
        // PDF left Explorer showing the old name beside the new file. Asserted
        // as INVARIANTS, not by re-running the production expression as the
        // expectation — that version could only fail if the code differed from
        // itself, and would have passed with ext '.pdf?v=2'.
        const pdf = built.items[built.resume_file_id];
        expect(pdf?.ext).toBe('.pdf');
        expect(pdf?.name).toBe(`${String(pdf?.basename)}${String(pdf?.ext)}`);
        expect(pdf?.name).not.toContain('/');
        expect(pdf?.name).not.toContain('?');
        expect(pdf?.basename).not.toBe('');
        // and it is the file the URL actually points at — statSync in the
        // size test below is what proves that URL resolves to real bytes
        expect(profile.meta.resumePdf).toContain(String(pdf?.name));
    });

    it('declares the resume size the committed file actually has, CEILED', () => {
        // This module is imported CLIENT-side by python/mirror.ts, so it
        // cannot statSync; the value is hand-written and this keeps it honest.
        // CEIL, not round: `size_label` (details_columns.ts:72) ceils, fs.ts's
        // upload paths ceil, and XP ceils. Rounding here would make the seed
        // the only size in the drive that disagrees with the column rendering
        // it — 138,780 bytes is 135.5 KB, which XP shows as 136 KB.
        const bytes = statSync(`static${profile.meta.resumePdf}`).size;
        expect(built.items[built.resume_file_id]?.size).toBe(
            Math.ceil(bytes / 1024),
        );
    });

    it('seeds the resume pdf as a remote file', () => {
        const pdf = built.items[built.resume_file_id];
        expect(pdf?.ext).toBe('.pdf');
        expect(pdf?.storage_type).toBe('remote');
        expect(pdf?.url).toBe(profile.meta.resumePdf);
    });

    it('duplicate titles within a section get distinct ids (gate-6 L1)', () => {
        const doubled = {
            ...profile,
            awards: [...profile.awards, ...profile.awards],
        };
        const b = build_portfolio(doubled);
        const awards_folder = b.items['p2FolderAwards'];
        expect(awards_folder?.children).toHaveLength(profile.awards.length * 2);
        expect(new Set(awards_folder?.children).size).toBe(
            profile.awards.length * 2,
        );
    });
});

describe('file_name_from_url', () => {
    it('takes the last path segment', () => {
        expect(file_name_from_url('/assets/CV.pdf')).toBe('CV.pdf');
        expect(file_name_from_url('CV.pdf')).toBe('CV.pdf');
    });

    it('strips a query string and a fragment', () => {
        // `ext` selects the icon, the Type cell AND the double-click handler,
        // so '.pdf?v=2' would silently unbind the PDF viewer
        expect(file_name_from_url('/assets/CV.pdf?v=2')).toBe('CV.pdf');
        expect(file_name_from_url('/assets/CV.pdf#page=2')).toBe('CV.pdf');
    });

    it('keeps dots inside the name', () => {
        expect(file_name_from_url('/a/My.CV.v2.pdf')).toBe('My.CV.v2.pdf');
    });

    it('decodes percent-encoding so Explorer shows a space, not %20', () => {
        expect(file_name_from_url('/a/my%20cv.pdf')).toBe('my cv.pdf');
    });

    it('falls back to the raw segment when the encoding is malformed', () => {
        // a stray `%` makes decodeURIComponent throw; this runs in the browser
        // through python/mirror.ts, so it must not take the REPL down with it
        expect(file_name_from_url('/a/100%CV.pdf')).toBe('100%CV.pdf');
    });

    it('refuses a URL with no filename', () => {
        expect(() => file_name_from_url('/assets/')).toThrow(/no filename/);
    });

    it('refuses a name that decodes to a path separator', () => {
        // cmd/path.ts splits names on '/', so such a file is unaddressable
        expect(() => file_name_from_url('/a/x%2Fy.pdf')).toThrow(
            /path separator/,
        );
    });
});
