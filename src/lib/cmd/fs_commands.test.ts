import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FS_COMMANDS, remainder, run_fs } from './fs_commands';
import { ROOT } from './path';
import { strip_ansi } from '../term/ansi';
import { required, to_hard_drive } from '../types';
import type { HardDrive } from '../types';

/** The SHIPPED seed, narrowed rather than asserted into shape. */
function load_seed(): HardDrive {
    return to_hard_drive(
        JSON.parse(readFileSync('static/json/hard_drive.json', 'utf-8')),
    );
}

const drive = load_seed();
const C = 'cTbkbrM4qjwF3UfmCoFkEK';
const EXPERIENCE = 'p2FolderExperience';
const PRINTERPIX = 'p2ExpPrinterpixAIEngineer0';

function out(name: string, rest = '', cwd = C): string {
    return run_fs(name, rest, { drive, cwd }).lines.map(strip_ansi).join('\n');
}

describe('ls', () => {
    it('lists the working directory, hiding what Explorer hides', () => {
        const text = out('ls');
        expect(text).toContain('Experience/');
        expect(text).toContain('Mohamed_Abdelnasser_Resume.pdf');
        expect(text).not.toContain('Recycle Bin');
    });

    it('marks directories with a trailing slash and files without', () => {
        const text = out('ls', '', EXPERIENCE);
        expect(text).toContain('Printerpix — AI Engineer.txt');
        expect(text).not.toContain('Printerpix — AI Engineer.txt/');
    });

    it('shows hidden entries with -a', () => {
        expect(out('ls', '-a')).toContain('Wallpapers/');
        expect(out('ls', '--all')).toContain('Recycle Bin/');
    });

    it('takes a path, absolute or relative, after the flag', () => {
        expect(out('ls', 'Experience')).toContain('Udacity');
        expect(out('ls', '/c/Projects')).toContain("Momad's XP.txt");
        expect(out('ls', '-a /c')).toContain('Desktop/');
    });

    it('names a file rather than printing nothing', () => {
        expect(out('ls', 'Experience/Printerpix — AI Engineer.txt')).toBe(
            'Printerpix — AI Engineer.txt',
        );
    });

    it('prints nothing for an empty directory, as bash does', () => {
        expect(run_fs('ls', '/d', { drive, cwd: C }).lines).toEqual([]);
    });

    it('reports the missing segment', () => {
        expect(out('ls', 'nope')).toBe('ls: nope: No such file or directory');
    });

    it('lists the drives at the root', () => {
        expect(out('ls', '/')).toContain('C:/');
        expect(out('ls', '/')).toContain('F:/');
    });
});

describe('dir', () => {
    it('ribs the visitor and then lists anyway', () => {
        const text = out('dir');
        expect(text).toContain('this shell only speaks Linux');
        expect(text).toContain('Experience/');
    });
});

describe('cd', () => {
    it('changes directory and reports nothing, as a shell does', () => {
        const result = run_fs('cd', 'experience', { drive, cwd: C });
        expect(result.cwd).toBe(EXPERIENCE);
        expect(result.lines).toEqual([]);
    });

    it('goes home when given nothing', () => {
        expect(run_fs('cd', '', { drive, cwd: EXPERIENCE }).cwd).toBe(C);
    });

    it('goes up, and to the My Computer level above the drives', () => {
        expect(run_fs('cd', '..', { drive, cwd: EXPERIENCE }).cwd).toBe(C);
        expect(run_fs('cd', '..', { drive, cwd: C }).cwd).toBe(ROOT);
        expect(run_fs('cd', '/', { drive, cwd: C }).cwd).toBe(ROOT);
    });

    it('enters a hidden directory, which `ls` would not have shown', () => {
        // bash hides dotfiles from `ls` but still lets you cd into them.
        expect(run_fs('cd', 'Wallpapers', { drive, cwd: C }).cwd).toBeDefined();
    });

    it('refuses a file, and says why', () => {
        const result = run_fs('cd', 'Printerpix — AI Engineer.txt', {
            drive,
            cwd: EXPERIENCE,
        });
        expect(result.cwd).toBeUndefined();
        expect(result.lines.map(strip_ansi)).toEqual([
            'cd: Printerpix — AI Engineer.txt: Not a directory',
        ]);
    });

    it('leaves the working directory alone when the path is missing', () => {
        const result = run_fs('cd', 'nope', { drive, cwd: EXPERIENCE });
        expect(result.cwd).toBeUndefined();
        expect(result.lines[0]).toBe('cd: nope: No such file or directory');
    });
});

describe('pwd', () => {
    it('prints the real path, never the ~ the prompt shows', () => {
        expect(out('pwd')).toBe('/c');
        expect(out('pwd', '', EXPERIENCE)).toBe('/c/Experience');
        expect(out('pwd', '', ROOT)).toBe('/');
    });

    it('answers even from a directory that has been deleted underneath it', () => {
        expect(out('pwd', '', 'deleted-id')).toBe('~');
    });
});

describe('cat', () => {
    it('renders a portfolio entry from the ref the generator stamped', () => {
        const text = out('cat', 'Printerpix — AI Engineer.txt', EXPERIENCE);
        expect(text).toContain('AI Engineer');
        expect(text).toContain('Printerpix');
    });

    it('names the images it cannot show instead of dropping them', () => {
        const text = out('cat', 'Printerpix — AI Engineer.txt', EXPERIENCE);
        expect(text).toMatch(/\[\d+ images? — open this file in My Computer/);
    });

    it('reaches an en-dash name, not just the em-dash ones', () => {
        const text = out(
            'cat',
            '/c/Awards/1st Place – RoboCup @Home Education Competition (Egypt).txt',
        );
        expect(text).toContain('RoboCup');
        expect(text).not.toContain('No such file');
    });

    it('describes a file it has no text for, with its size', () => {
        const text = out('cat', 'Mohamed_Abdelnasser_Resume.pdf');
        expect(text).toContain('PDF file');
        expect(text).toContain('KB');
        expect(text).toContain('open it from My Computer');
    });

    it('refuses a directory and a missing file in bash wording', () => {
        expect(out('cat', 'Experience')).toBe(
            'cat: Experience: Is a directory',
        );
        expect(out('cat', 'nope')).toBe('cat: nope: No such file or directory');
        expect(out('cat', '')).toBe('cat: missing operand');
    });

    it('falls back to a description when the ref cannot be resolved', () => {
        const drifted: HardDrive = {
            ...drive,
            [PRINTERPIX]: {
                ...required(drive[PRINTERPIX], 'seed entry'),
                portfolio_ref: { section: 'experience', key: 999 },
            },
        };
        const lines = run_fs('cat', 'Printerpix — AI Engineer.txt', {
            drive: drifted,
            cwd: EXPERIENCE,
        }).lines.map(strip_ansi);
        expect(lines[0]).toContain('TXT file');
    });
});

describe('run_fs', () => {
    it('answers every command it claims before the drive is seeded', () => {
        for (const name of FS_COMMANDS) {
            const lines = run_fs(name, '', { drive: null, cwd: C }).lines;
            expect(lines.map(strip_ansi), name).toEqual([
                'the filesystem is still starting up — try again in a moment',
            ]);
        }
    });
});

describe('remainder', () => {
    it('preserves spacing a re-join would destroy', () => {
        // `My  Notes` is creatable through Explorer's rename, which validates
        // nothing; args.join(' ') would make it unreachable.
        expect(remainder('cd My  Notes')).toBe('My  Notes');
        expect(remainder('ls')).toBe('');
        expect(remainder('  cat   a b  ')).toBe('a b');
    });

    it('lets quotes rescue a name with a trailing space', () => {
        // Creatable through Explorer's rename. The outer trim makes the bare
        // form unreachable — exactly as it is in a real shell — and quoting is
        // the same escape hatch bash offers.
        const root = required(drive[C], 'seed root');
        const odd: HardDrive = {
            ...drive,
            [C]: { ...root, children: [...root.children, 'odd'] },
            odd: {
                ...required(drive[EXPERIENCE], 'seed folder'),
                id: 'odd',
                name: 'Notes ',
                basename: 'Notes ',
                parent: C,
                children: [],
            },
        };
        expect(
            run_fs('cd', remainder('cd "Notes "'), { drive: odd, cwd: C }).cwd,
        ).toBe('odd');
        expect(
            run_fs('cd', remainder('cd Notes '), { drive: odd, cwd: C }).cwd,
        ).toBeUndefined();
    });
});
