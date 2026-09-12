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

describe('My Documents — the credentials', () => {
    /*
     * A certificate nobody can read is not a credential. LinkedIn only serves
     * uploaded documents as per-page images — the PDFs came from the Drive
     * links behind "Show credential" — and they live under My Documents, where
     * anyone would look for a document, rather than beside the portfolio text.
     */
    const built = build_portfolio(profile, () => 42);
    const items = Object.values(built.items);
    const certs = profile.certifications.filter(
        (c) => c.pdf != null && c.pdf !== '',
    );
    const pdfs = items.filter(
        (i) => i.ext === '.pdf' && i.parent === 'docCertifications',
    );

    it('seeds one .pdf per certification that has one', () => {
        expect(certs.length).toBeGreaterThan(0);
        expect(pdfs).toHaveLength(certs.length);
    });

    it('names each PDF after its certification', () => {
        for (const cert of certs) {
            const pdf = pdfs.find((i) => i.name === `${cert.title}.pdf`);
            expect(pdf, `no seeded PDF for ${cert.title}`).toBeDefined();
            expect(pdf?.url).toBe(cert.pdf);
            expect(pdf?.storage_type).toBe('remote');
        }
    });

    it('hangs the section off My Documents, not the C: root', () => {
        expect(built.document_section_ids).toEqual(['docCertifications']);
        const section = built.items['docCertifications'];
        expect(section?.parent).toBe('MyDocuments'); // the injected default
        expect(section?.children).toHaveLength(pdfs.length);
    });

    it('leaves the portfolio Certifications folder holding only its entries', () => {
        const folder = built.items['p2FolderCertifications'];
        expect(folder?.children).toHaveLength(profile.certifications.length);
        for (const id of folder?.children ?? []) {
            expect(built.items[id]?.ext).toBe('.txt');
        }
    });

    /*
     * They are NOT portfolio entries: `entry_ids` becomes
     * `PORTFOLIO_ENTRY_IDS`, which makes an item undeletable and is what
     * `portfolio_ref` lookups walk. A PDF carries no ref.
     */
    it('does not count them as portfolio entries', () => {
        for (const pdf of pdfs) {
            expect(built.entry_ids).not.toContain(pdf.id);
        }
    });

    it('reports the size it was given rather than a guess', () => {
        expect(pdfs[0]?.size).toBe(42);
    });
});

describe('My Pictures — the galleries as real files', () => {
    const built = build_portfolio(profile, () => 7);
    const items = Object.values(built.items);
    const section_of = (name: string) =>
        built.picture_section_ids
            .map((id) => built.items[id])
            .find((f) => f?.name === name);

    it('groups by section, then by item, then the files', () => {
        const projects = section_of('Projects');
        expect(projects).toBeDefined();
        expect(projects?.parent).toBe('MyPictures'); // the injected default

        // the example the owner asked for: My Pictures/Projects/EUC RAG Agent
        const euc = (projects?.children ?? [])
            .map((id) => built.items[id])
            .find((f) => f?.name === 'EUC RAG Agent');
        expect(euc, 'no EUC RAG Agent folder').toBeDefined();
        expect(euc?.type).toBe('folder');
        const files = (euc?.children ?? []).map((id) => built.items[id]);
        expect(files.length).toBeGreaterThan(0);
        for (const f of files) {
            expect(f?.type).toBe('file');
            expect(f?.storage_type).toBe('remote');
            expect(f?.url?.startsWith('/assets/')).toBe(true);
        }
    });

    it('gives every item with pictures a folder, and no others one', () => {
        const withImages = profile.projects.filter((p) => p.images.length > 0);
        const projects = section_of('Projects');
        expect(projects?.children).toHaveLength(withImages.length);
        // Printerpix has no media on LinkedIn; an empty folder would promise
        // what the drive cannot deliver.
        const experience = section_of('Experience');
        const names = (experience?.children ?? []).map(
            (id) => built.items[id]?.name,
        );
        expect(names.some((n) => n?.startsWith('Printerpix'))).toBe(false);
    });

    it('skips sections that have no pictures at all', () => {
        // education/awards/certifications carry no images today
        expect(built.picture_section_ids).toEqual([
            'picExperience',
            'picProjects',
        ]);
    });

    it('names files from the alt text, numbering repeats', () => {
        const bemo = items.find(
            (i) => i.type === 'folder' && i.name.startsWith('BeMo'),
        );
        const names = (bemo?.children ?? []).map((id) => built.items[id]?.name);
        // three images share the caption "BeMo at the 2025 project discussion"
        expect(names).toContain('BeMo at the 2025 project discussion.jpg');
        expect(names).toContain('BeMo at the 2025 project discussion (2).jpg');
        // a duplicate sibling name breaks clone_fs/create_shortcut's
        // unique-name assumption, so there must be none
        expect(new Set(names).size).toBe(names.length);
    });

    it('points at the same static files the galleries render, duplicating no bytes', () => {
        const urls = new Set(
            items.filter((i) => i.parent?.startsWith('pic')).map((i) => i.url),
        );
        for (const p of profile.projects) {
            for (const img of p.images) expect(urls).toContain(img.src);
        }
    });

    it('reports the size it was given', () => {
        const file = items.find((i) => i.ext === '.jpg');
        expect(file?.size).toBe(7);
    });

    it('adds no picture file to the portfolio entry ids', () => {
        for (const i of items.filter((x) => x.ext === '.jpg')) {
            expect(built.entry_ids).not.toContain(i.id);
        }
    });
});

describe('the certificate files actually exist', () => {
    /*
     * The seed points at `static/`, so a typo'd path ships a certification
     * whose double-click opens the PDF viewer on a 404 — which `pdf_viewer`
     * renders as a connection error, blaming the network for a missing file.
     */
    it('has a real PDF on disk behind every reference', () => {
        for (const cert of profile.certifications) {
            if (cert.pdf == null || cert.pdf === '') continue;
            const path = 'static' + cert.pdf;
            const size = statSync(path).size;
            expect(size, `${path} is empty`).toBeGreaterThan(10_000);
        }
    });

    it('seeds the size the file really is, ceiled', () => {
        const real = build_portfolio(profile, (url) =>
            Math.ceil(statSync('static' + url).size / 1024),
        );
        for (const cert of profile.certifications) {
            if (cert.pdf == null || cert.pdf === '') continue;
            const pdf = Object.values(real.items).find(
                (i) => i.name === `${cert.title}.pdf`,
            );
            expect(pdf?.size).toBe(
                Math.ceil(statSync('static' + cert.pdf).size / 1024),
            );
        }
    });
});
