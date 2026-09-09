import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { copy, fill_copy, profile, to_beat, to_tone } from './profile';

describe('profile integrity', () => {
    it('has complete meta with the Phase-1 asset paths', () => {
        expect(profile.meta.name).toBe('Mohamed Abdelnasser');
        expect(profile.meta.shortName).toBe('Momad');
        expect(profile.meta.title).toBe('AI Engineer');
        expect(profile.meta.email).toMatch(/^[^@\s]+@[^@\s]+\.[^@\s]+$/);
        expect(profile.meta.avatar).toBe('/assets/images/avatar.png');
        expect(profile.meta.resumePdf).toBe(
            '/assets/Mohamed_Abdelnasser_Resume.pdf',
        );
    });

    it('has the three social links with the real URLs', () => {
        const by_platform = Object.fromEntries(
            profile.social.map((s) => [s.platform, s.url]),
        );
        expect(by_platform['GitHub']).toBe('https://github.com/Momad-Y');
        expect(by_platform['LinkedIn']).toBe(
            'https://www.linkedin.com/in/mohamed-y-abdelnasser/',
        );
        expect(by_platform['Instagram']).toBe('https://instagram.com/7.zsjj');
    });

    it('has six experience entries, each with at least one bullet', () => {
        expect(profile.experience).toHaveLength(6);
        for (const entry of profile.experience) {
            expect(entry.company.length).toBeGreaterThan(0);
            expect(entry.role.length).toBeGreaterThan(0);
            expect(entry.period.length).toBeGreaterThan(0);
            expect(entry.description.length).toBeGreaterThan(0);
        }
        expect(profile.experience[0]?.company).toBe('Printerpix');
        expect(profile.experience[0]?.description).toHaveLength(4);
    });

    it('education includes the GPA honors line', () => {
        expect(profile.education).toHaveLength(2);
        expect(profile.education[0]?.honors).toBe(
            'GPA 3.94 — Excellent with Honors',
        );
    });

    it('has five non-empty skill groups', () => {
        const groups = Object.values(profile.skills);
        expect(groups).toHaveLength(5);
        for (const group of groups) {
            expect(group.length).toBeGreaterThan(0);
        }
    });

    it('has two bio paragraphs', () => {
        expect(profile.about.bio).toHaveLength(2);
    });

    it('projects are populated and well-formed (Phase 2)', () => {
        expect(profile.projects.length).toBeGreaterThanOrEqual(4);
        for (const project of profile.projects) {
            expect(project.name.length).toBeGreaterThan(0);
            expect(project.description.length).toBeGreaterThan(0);
            expect(project.tech.length).toBeGreaterThan(0);
        }
    });

    // These three blocks drive the XP property-sheet dialogs and are meant to be
    // edited by hand. TypeScript only catches a MISSING required key at compile
    // time — it cannot catch an emptied array or a wrong-shaped element, and
    // `npm run build` strips types entirely. These assertions are the only gate
    // that a hand-edit doesn't ship a dialog that renders blank or throws.
    it('systemProperties has content for every tab', () => {
        const sp = profile.systemProperties;
        expect(sp.general.system.length).toBeGreaterThan(0);
        expect(sp.general.computer.length).toBeGreaterThan(0);
        expect(sp.general.footer.length).toBeGreaterThan(0);
        expect(sp.computerName.fullName.length).toBeGreaterThan(0);
        expect(sp.hardware.devices.length).toBeGreaterThan(0);
        expect(sp.advanced.sections.length).toBeGreaterThan(0);
        for (const section of sp.advanced.sections) {
            expect(section.title.length).toBeGreaterThan(0);
            expect(section.note.length).toBeGreaterThan(0);
        }
    });

    it('folderOptions has content for every tab', () => {
        const fo = profile.folderOptions;
        expect(fo.general.sections.length).toBeGreaterThan(0);
        for (const section of fo.general.sections) {
            expect(section.title.length).toBeGreaterThan(0);
            expect(section.lines.length).toBeGreaterThan(0);
        }
        expect(fo.view.settings.length).toBeGreaterThan(0);
        expect(fo.fileTypes.types.length).toBeGreaterThan(0);
        for (const type of fo.fileTypes.types) {
            expect(type.ext.startsWith('.')).toBe(true);
            expect(type.desc.length).toBeGreaterThan(0);
        }
    });

    it('internetOptions has content for every tab', () => {
        const io = profile.internetOptions;
        expect(io.general.sections.length).toBeGreaterThan(0);
        for (const section of io.general.sections) {
            expect(section.title.length).toBeGreaterThan(0);
            expect(section.lines.length).toBeGreaterThan(0);
        }
        expect(io.security.zones.length).toBeGreaterThan(0);
        expect(io.advanced.settings.length).toBeGreaterThan(0);
    });

    it('is deeply frozen', () => {
        expect(Object.isFrozen(profile)).toBe(true);
        expect(Object.isFrozen(profile.meta)).toBe(true);
        expect(Object.isFrozen(profile.experience)).toBe(true);
        expect(Object.isFrozen(profile.experience[0])).toBe(true);
    });
});

describe('fill_copy', () => {
    it('substitutes named placeholders', () => {
        expect(fill_copy('{a} and {b}', { a: 'x', b: 'y' })).toBe('x and y');
    });

    it('leaves an unknown placeholder visible rather than printing undefined', () => {
        // a typo in profile.json should show as braces in the UI, not as a
        // broken sentence with `undefined` in it
        expect(fill_copy('hi {nope}', { a: 'x' })).toBe('hi {nope}');
    });

    it('is a no-op for copy with no placeholders', () => {
        expect(fill_copy('plain text', {})).toBe('plain text');
    });
});

describe('copy', () => {
    it('gives every hack step real dots and a tag', () => {
        // `to_beat` only checks these are present, so a `dots: 0` beat parses
        // and would render as a step with no animation
        for (const beat of copy.hackScript) {
            if (beat.kind !== 'step') continue;
            expect(beat.dots).toBeGreaterThan(0);
            expect(beat.tag).not.toBe('');
        }
    });

    it('carries the placeholders its consumers fill', () => {
        // a renamed placeholder would render as literal braces in the About
        // dialog and the sudoers line, which is quiet but wrong
        expect(copy.aboutDialog.message).toContain('{name}');
        expect(copy.sudo.sudoers).toContain('{user}');
    });

    it('is frozen, like the rest of the profile', () => {
        expect(Object.isFrozen(copy)).toBe(true);
    });
});

/*
 * The validators, tested DIRECTLY.
 *
 * Asserting "every tone in copy.terminalWelcome is known" cannot fail: a bad
 * tone throws while this file is being imported, so the assertion never runs.
 * Reaching for the functions is the only way to exercise the rejecting half —
 * which is also the half that has no other coverage.
 */
describe('to_tone', () => {
    it('accepts the three slots the terminal can render', () => {
        expect(to_tone('accent')).toBe('accent');
        expect(to_tone('plain')).toBe('plain');
        expect(to_tone('dim')).toBe('dim');
    });

    it('names the offending value when it refuses', () => {
        expect(() => to_tone('acccent')).toThrow(/copy tone "acccent"/);
        expect(() => to_tone('')).toThrow(/must be accent, plain or dim/);
    });
});

describe('to_beat', () => {
    it('narrows each beat kind to its own shape', () => {
        expect(
            to_beat({ kind: 'step', text: 'a', dots: 3, tag: 'OK' }),
        ).toEqual({
            kind: 'step',
            text: 'a',
            dots: 3,
            tag: 'OK',
        });
        expect(to_beat({ kind: 'progress', label: 'l' })).toEqual({
            kind: 'progress',
            label: 'l',
        });
        expect(to_beat({ kind: 'aside', text: 'a' })).toEqual({
            kind: 'aside',
            text: 'a',
        });
    });

    it('refuses a beat missing the fields its kind needs', () => {
        expect(() => to_beat({ kind: 'step', text: 'a' })).toThrow(
            /needs text, dots and tag/,
        );
        expect(() => to_beat({ kind: 'progress' })).toThrow(/needs a label/);
        expect(() => to_beat({ kind: 'line' })).toThrow(/line beat needs text/);
    });

    it('refuses a kind the renderer has no branch for', () => {
        expect(() => to_beat({ kind: 'explosion', text: 'x' })).toThrow(
            /unknown hack beat kind "explosion"/,
        );
    });
});

describe('static/help.html is filled from profile.json', () => {
    /*
     * The Help page is served as a plain file — outside the bundle, so it
     * cannot import profile.json. It used to spell the owner's name and their
     * repository URL a second time, free to drift the day either changed.
     * `generate:vfs` now fills it from `scripts/help.template.html`, and CI
     * diffs the result; these assert the values actually landed, which a
     * freshness gate alone cannot tell you.
     */
    const html = readFileSync('static/help.html', 'utf8');
    const flat = html.replace(/\s+/g, ' ');

    it('carries the owner name from profile.meta', () => {
        expect(flat).toContain(profile.meta.name);
    });

    it('links the repository from profile.projects', () => {
        const url = profile.projects[0]?.url;
        expect(url).toBeTruthy();
        expect(flat).toContain(`${String(url)}#readme`);
    });

    it('repeats the login screen hint verbatim', () => {
        expect(flat).toContain(copy.loginHints.accounts.join(' '));
    });

    it('has no unfilled placeholders and says it is generated', () => {
        expect(html).toMatch(/^<!-- GENERATED by scripts\/generate-vfs\.ts/);
        // CSS braces are fine; a `{word}` is a placeholder that never got a value
        expect(html.replace(/^<!--[\s\S]*?-->/, '')).not.toMatch(
            /\{[a-z]\w*\}/i,
        );
    });
});
