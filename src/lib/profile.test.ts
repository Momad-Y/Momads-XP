import { describe, expect, it } from 'vitest';
import { profile } from './profile';

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
