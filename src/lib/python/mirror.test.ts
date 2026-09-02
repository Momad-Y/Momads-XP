import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { build_mirror, entry_text, OUTBOX_PATH } from './mirror';
import { PYTHON_WORKER_SOURCE } from './worker_source';
import { profile } from '../profile';
import { build_portfolio } from '../vfs_gen/build';

const mirror = build_mirror();
const paths = mirror.map((e) => e.path);

describe('build_mirror', () => {
    it('names every folder and file exactly as the seed does', () => {
        // Derived from build_portfolio, the same pure function the seed
        // generator uses, so `/c` and CMD's `ls` cannot disagree. Duplicating
        // the naming here is the drift this repo keeps paying for.
        const built = build_portfolio(profile);
        for (const folder_id of built.folder_ids) {
            const folder = built.items[folder_id];
            if (folder == null) continue;
            expect(paths).toContain(folder.name);
            for (const child_id of folder.children) {
                const child = built.items[child_id];
                if (child == null) continue;
                expect(paths).toContain(`${folder.name}/${child.name}`);
            }
        }
    });

    it('carries the real portfolio text, not a placeholder', () => {
        const entry = mirror.find((e) =>
            e.path.startsWith('Experience/Printerpix'),
        );
        expect(entry?.text).toContain('AI Engineer');
        expect(entry?.text).toContain('Printerpix');
    });

    it('handles both dashes the seed ships', () => {
        // 7 em (U+2014) in Experience, 8 en (U+2013) in Awards and
        // Certifications. A fixture written from one proves nothing about the
        // other.
        expect(paths.some((p) => p.includes('—'))).toBe(true);
        expect(paths.some((p) => p.includes('–'))).toBe(true);
    });

    it('contains NOTHING of the visitor — no wallpapers, music or uploads', () => {
        // The whole reason the mirror is synthesised rather than read from the
        // VFS: the sandbox may reach cdn.jsdelivr.net, whose edge logs URLs,
        // so shipping the visitor's own files in would make a pasted script an
        // exfiltration tool.
        const all_text = mirror.map((e) => e.text ?? '').join('\n');
        for (const forbidden of [
            'Wallpapers',
            'My Music',
            'My Pictures',
            'Desktop',
            'Recycle Bin',
            '.jpg',
            '.mp3',
            '.pdf',
            '.exe',
        ]) {
            expect(paths.join('\n'), forbidden).not.toContain(forbidden);
            // The claim is about CONTENT as much as names — checking paths
            // alone would pass on a mirror that embedded a visitor's file.
            expect(all_text, forbidden).not.toContain(forbidden);
        }
    });

    it('ships exactly one writable directory, and it is empty', () => {
        const writable = mirror.filter((e) => e.writable === true);
        expect(writable.map((e) => e.path)).toEqual([OUTBOX_PATH]);
        expect(paths.filter((p) => p.startsWith(`${OUTBOX_PATH}/`))).toEqual(
            [],
        );
    });

    it('lists a directory before anything inside it', () => {
        // The worker creates them in order; a file before its folder throws.
        for (const [i, entry] of mirror.entries()) {
            const parent = entry.path.split('/').slice(0, -1).join('/');
            if (parent === '') continue;
            expect(paths.indexOf(parent), entry.path).toBeLessThan(i);
        }
    });

    it('gives every file text and every directory none', () => {
        for (const entry of mirror) {
            const is_file = entry.path.endsWith('.txt');
            expect(typeof entry.text === 'string', entry.path).toBe(is_file);
        }
    });
});

describe('entry_text', () => {
    it('is plain prose, not the terminal rendering', () => {
        // `cat` hard-wraps at 68 columns and signs off with "open this file in
        // My Computer" — terminal artefacts that have no business in a file
        // read with open().read().
        const text = entry_text({
            heading: 'Role',
            subheading: 'Company',
            meta_lines: ['2025', 'Dubai'],
            bullets: ['a'.repeat(120)],
            chips: ['x', 'y'],
            link: { label: 'Visit', url: 'https://e.example' },
            images: [],
        });
        expect(text).toContain('Role\n\nCompany · 2025 · Dubai');
        expect(text).toContain(`- ${'a'.repeat(120)}`);
        expect(text).toContain('Tech: x, y');
        expect(text).toContain('Visit: https://e.example');
        expect(text).not.toContain('My Computer');
        expect(text.endsWith('\n')).toBe(true);
    });

    it('omits sections an entry does not have', () => {
        const text = entry_text({
            heading: 'Only',
            meta_lines: [],
            bullets: [],
            chips: [],
            images: [],
        });
        expect(text).toBe('Only\n');
    });
});

describe('the worker source', () => {
    it('is valid JavaScript', () => {
        // It is a String.raw template, so an escaped backtick inside it
        // survives as a literal backslash and the emitted worker stops
        // parsing. That happened while building this feature; the Python
        // block is now hoisted out and interpolated with JSON.stringify.
        // `new vm.Script` COMPILES without running, which is exactly the
        // question, and unlike `new Function` it is not implied-eval.
        expect(() => new Script(PYTHON_WORKER_SOURCE)).not.toThrow();
        expect(PYTHON_WORKER_SOURCE).not.toContain('\\`');
    });

    it('builds /c before it reports ready', () => {
        // A prompt over a directory that does not exist yet is the failure
        // this ordering prevents.
        const build_at = PYTHON_WORKER_SOURCE.indexOf("os.chdir('/c')");
        const ready_at = PYTHON_WORKER_SOURCE.indexOf("kind: 'ready'");
        expect(build_at).toBeGreaterThan(-1);
        expect(ready_at).toBeGreaterThan(-1);
        expect(build_at).toBeLessThan(ready_at);
    });

    it('cleans up by NAME, so an empty tree cannot raise NameError', () => {
        // `del _entry, _f, ...` referenced loop variables that do not exist
        // when the loop never ran — an empty mirror, or one whose entries all
        // failed to resolve, killed the session before the banner.
        expect(PYTHON_WORKER_SOURCE).toContain('globals().pop');
        expect(PYTHON_WORKER_SOURCE).not.toMatch(/del _tree, _writable/);
    });

    it('does not commit a saved name until the host acknowledges it', () => {
        // Committing inside the scan made every refusal permanent: the file
        // is unchanged, so it never appears in a later scan.
        expect(PYTHON_WORKER_SOURCE).toContain('_xp_pending');
        expect(PYTHON_WORKER_SOURCE).toContain('_xp_settle');
    });

    it('crosses the JS/Python boundary without interpolating names', () => {
        // The shipped names carry an apostrophe (Momad's XP.txt), an em dash,
        // an en dash and a middle dot. Generated source would break on all of
        // them.
        expect(PYTHON_WORKER_SOURCE).toContain('globals.set');
        expect(PYTHON_WORKER_SOURCE).toContain('to_py()');
    });
});
