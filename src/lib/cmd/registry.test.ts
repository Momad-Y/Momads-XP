import { describe, it, expect } from 'vitest';
import {
    COMMANDS,
    execute,
    find_command,
    parse,
    normalise_spacing,
} from './registry';
import { strip_ansi } from '../term/ansi';
import { profile } from '../profile';

/**
 * Output as plain text, so assertions are about CONTENT and not colour or
 * spacing. The trailing blank every command now ends with is trimmed here —
 * spacing has its own dedicated tests below, and leaving it in would make
 * every content assertion carry a `\n` that says nothing.
 */
function plain(input: string): string {
    return execute(input, profile).map(strip_ansi).join('\n').trimEnd();
}

describe('parse', () => {
    it('splits a command from its arguments', () => {
        expect(parse('echo hello world')).toEqual({
            name: 'echo',
            args: ['hello', 'world'],
        });
    });

    it('collapses repeated whitespace and trims', () => {
        expect(parse('   echo   a   b  ')).toEqual({
            name: 'echo',
            args: ['a', 'b'],
        });
    });

    it('is null for an empty line', () => {
        expect(parse('')).toBeNull();
        expect(parse('    ')).toBeNull();
    });
});

describe('lookup', () => {
    it('is case-SENSITIVE, like bash', () => {
        // §3.2 line 1: "Linux-style terminal (bash emulation, not Windows
        // cmd)". A case-insensitive lookup is a second un-Linux behaviour.
        expect(find_command('help')).toBeDefined();
        expect(find_command('HELP')).toBeUndefined();
    });

    it('answers an unknown command in bash wording', () => {
        expect(plain('nope')).toBe('nope: command not found');
        // Explicitly NOT cmd.exe's phrasing — the plan originally overrode a
        // written spec directive with a joke; reversed at gate 2.
        expect(plain('nope')).not.toContain('is not recognized');
    });

    it('says nothing for an empty line', () => {
        expect(execute('   ', profile)).toEqual([]);
    });
});

describe('content commands read from profile.json', () => {
    it('whoami ANSWERS on line one before it jokes', () => {
        // §3.2: "All command output data sourced from JSON", and CLAUDE.md
        // forbids hardcoded personal content anywhere. The joke sits UNDER the
        // answer rather than replacing it — `whoami` that does not print the
        // user is a broken command wearing a punchline.
        const lines = execute('whoami', profile).map(strip_ansi);
        expect(lines[0]).toBe(profile.meta.shortName.toLowerCase());
    });

    it("whoami's aside is the shell's voice, not Momad's", () => {
        // The name is the only thing allowed to come from profile.json; the
        // remark underneath must not smuggle personal content back in as a
        // literal.
        const aside = execute('whoami', profile)
            .slice(1)
            .map(strip_ansi)
            .join(' ');
        expect(aside.trim().length).toBeGreaterThan(0);
        expect(aside).not.toContain(profile.meta.name);
        expect(aside).not.toContain(profile.meta.email);
        expect(aside).not.toContain(profile.meta.location);
    });

    it('about prints the real name, title and every bio paragraph', () => {
        const out = plain('about');
        expect(out).toContain(profile.meta.name);
        expect(out).toContain(profile.meta.title);
        for (const para of profile.about.bio) {
            // Wrapped across lines, so compare on the first few words.
            expect(out).toContain(para.split(' ').slice(0, 4).join(' '));
        }
    });

    it('contact reads meta.email and meta.location, NOT about', () => {
        // The original spec mapped this to "profile.about contact fields".
        // `about` has exactly one key — `bio` — so that command had no data
        // source at all. Caught at gate 2.
        const out = plain('contact');
        expect(out).toContain(profile.meta.email);
        expect(out).toContain(profile.meta.location);
    });

    it('social lists every platform with its url', () => {
        const out = plain('social');
        for (const s of profile.social) {
            expect(out).toContain(s.platform);
            expect(out).toContain(s.url);
        }
    });

    it('skills lists every group and every skill', () => {
        const out = plain('skills');
        for (const [group, items] of Object.entries(profile.skills)) {
            expect(out).toContain(group);
            for (const item of items) expect(out).toContain(item);
        }
    });

    it('experience lists every role and company', () => {
        const out = plain('experience');
        for (const job of profile.experience) {
            expect(out).toContain(job.company);
            expect(out).toContain(job.role);
        }
    });

    it('projects lists every project name', () => {
        const out = plain('projects');
        for (const project of profile.projects) {
            expect(out).toContain(project.name);
        }
    });

    it('uname -a includes system info; bare uname is one word of it', () => {
        const all = plain('uname -a');
        expect(all).toContain(profile.systemProperties.general.system[0] ?? '');
        expect(all.split(' ').length).toBeGreaterThan(
            plain('uname').split(' ').length,
        );
    });
});

describe('echo', () => {
    it('passes arguments through verbatim, preserving case', () => {
        expect(plain('echo Hello World')).toBe('Hello World');
    });

    it('is empty with no arguments', () => {
        expect(plain('echo')).toBe('');
    });
});

describe('help', () => {
    it('lists every command except itself', () => {
        const out = plain('help');
        for (const c of COMMANDS) {
            if (c.name === 'help') continue;
            expect(out).toContain(c.name);
        }
    });

    it('advertises nothing as coming later, now that nothing is', () => {
        // The filesystem commands were the only deferral. The footer has to go
        // with them or `help` prints an empty "coming in a later update" list.
        expect(plain('help').toLowerCase()).not.toContain('later update');
    });
});

describe('the filesystem commands', () => {
    it('are real commands the shell recognises', () => {
        // They used to answer "not available yet". §3.2 assigns them by name
        // and they now run, so the registry must know them or Tab and `help`
        // would advertise commands that answer "command not found".
        for (const name of ['ls', 'cd', 'pwd', 'cat', 'dir']) {
            expect(find_command(name), name).toBeDefined();
            expect(plain(name), name).not.toContain('command not found');
        }
    });

    it('produce no lines here, because the component runs them', () => {
        // They need the working directory, which belongs to the terminal —
        // the same split `color`, `clear` and `python` already use. This test
        // is what stops someone giving them a `run` body that silently never
        // executes.
        for (const name of ['ls', 'cd', 'pwd', 'cat', 'dir']) {
            expect(execute(name, profile), name).toEqual([]);
        }
    });
});

describe('easter eggs', () => {
    it('sudo refuses in the classic wording, using the real user', () => {
        const out = plain('sudo rm -rf /');
        expect(out).toContain('is not in the sudoers file');
        expect(out).toContain(profile.meta.shortName.toLowerCase());
    });

    it('matrix and hack print nothing — the component animates them', () => {
        expect(execute('matrix', profile)).toEqual([]);
        expect(execute('hack', profile)).toEqual([]);
    });
});

describe('the command set matches SPECIFICATION.md §3.2', () => {
    it('includes every Phase 3 core command', () => {
        const required = [
            'help',
            'about',
            'skills',
            'experience',
            'projects',
            'contact',
            'social',
            'clear',
            'echo',
            'date',
            'time',
            'whoami',
            'uname',
            'matrix',
            'hack',
            'sudo',
        ];
        for (const name of required) {
            expect(
                find_command(name),
                `missing command: ${name}`,
            ).toBeDefined();
        }
    });

    it('has no duplicate command names', () => {
        const names = COMMANDS.map((c) => c.name);
        expect(new Set(names).size).toBe(names.length);
    });

    it('gives every command a non-empty summary for help', () => {
        for (const c of COMMANDS) expect(c.summary.length).toBeGreaterThan(0);
    });
});

describe('color', () => {
    it('is listed so help advertises it', () => {
        // Same shape as `exit`: the repaint acts on the TERMINAL, not on
        // output, so the component owns it and the command layer stays pure.
        // It still has to appear in `help` per §1b's no-dead-entries standard.
        expect(find_command('color')).toBeDefined();
        expect(plain('help')).toContain('color');
    });

    it('produces no output of its own', () => {
        expect(execute('color', profile)).toEqual([]);
    });
});

describe('python', () => {
    it('is listed so help advertises it', () => {
        // Same shape as `color` and `exit`: the SESSION is hosted by the
        // component, which owns the terminal and the sandbox frame, so the
        // command layer stays pure. It must still appear in `help`, per §1b's
        // no-dead-entries standard.
        expect(find_command('python')).toBeDefined();
        expect(plain('help')).toContain('python');
    });

    it('produces no output of its own', () => {
        expect(execute('python', profile)).toEqual([]);
    });
});

describe('exit', () => {
    it('is listed so help advertises it', () => {
        // The window close is handled by the component — the command layer is
        // pure `(args, profile) => string[]` and owns no window — but the
        // command must still appear in `help`, per §1b's no-dead-entries
        // standard.
        expect(find_command('exit')).toBeDefined();
        expect(plain('help')).toContain('exit');
    });

    it('produces no output of its own', () => {
        expect(execute('exit', profile)).toEqual([]);
    });
});

describe('output spacing follows the command, not a blanket rule', () => {
    /**
     * The commands that print a BLOCK and are padded from the next prompt:
     * every portfolio-content command, plus `help`, which has the same dense
     * multi-group shape.
     */
    const BLOCKS = [
        'help',
        'about',
        'skills',
        'experience',
        'projects',
        'contact',
        'social',
    ];

    /** Everything else that prints — short answers a real shell does not pad. */
    const TERSE = ['whoami', 'uname -a', 'date', 'time', 'sudo'];

    it('a block ends with EXACTLY one blank line', () => {
        for (const cmd of BLOCKS) {
            const out = execute(cmd, profile);
            expect(out.length, `${cmd} printed nothing`).toBeGreaterThan(0);
            expect(out[out.length - 1], `${cmd} does not end blank`).toBe('');
            expect(
                out[out.length - 2],
                `${cmd} ends with TWO blank lines`,
            ).not.toBe('');
        }
    });

    it('a short answer ends on its last line, with no padding', () => {
        // The reported problem: padding after EVERY command does not feel like
        // a real shell. `whoami` and `date` answer and get out of the way.
        for (const cmd of TERSE) {
            const out = execute(cmd, profile);
            expect(out.length, `${cmd} printed nothing`).toBeGreaterThan(0);
            expect(out[out.length - 1], `${cmd} pads the prompt`).not.toBe('');
        }
    });

    it('an unknown command does not pad either', () => {
        const out = execute('nope', profile);
        expect(out[out.length - 1]).not.toBe('');
    });

    it('silent commands stay silent', () => {
        // A blank line before a freshly cleared screen's prompt would be a
        // visible artefact.
        for (const cmd of ['clear', 'matrix', 'hack', 'exit']) {
            expect(execute(cmd, profile), cmd).toEqual([]);
        }
    });

    it('marks exactly the block commands, and nothing else', () => {
        // Guards the flag itself. Adding `blank_after` to `date` would restore
        // the padding this change removed, and no other test would notice.
        const flagged = COMMANDS.filter((c) => c.blank_after === true).map(
            (c) => c.name,
        );
        expect(flagged.sort()).toEqual([...BLOCKS].sort());
    });

    it('still separates groups with a single blank line', () => {
        // The trailing blank must not come at the cost of the spacing BETWEEN
        // entries, which is what made the lists readable.
        const out = execute('skills', profile).map(strip_ansi);
        const groups = Object.keys(profile.skills);
        expect(groups.length).toBeGreaterThan(1);
        // No two consecutive blanks anywhere.
        for (let i = 1; i < out.length; i++) {
            expect(out[i] === '' && out[i - 1] === '').toBe(false);
        }
    });
});

describe('normalise_spacing', () => {
    it('collapses several trailing blanks to one when padding is asked for', () => {
        expect(normalise_spacing(['a', '', '', ''], true)).toEqual(['a', '']);
    });

    it('adds one when there is none', () => {
        expect(normalise_spacing(['a'], true)).toEqual(['a', '']);
    });

    it('strips them all when padding is NOT asked for', () => {
        expect(normalise_spacing(['a', '', ''], false)).toEqual(['a']);
        expect(normalise_spacing(['a'], false)).toEqual(['a']);
    });

    it('leaves empty output empty either way', () => {
        expect(normalise_spacing([], true)).toEqual([]);
        expect(normalise_spacing(['', ''], true)).toEqual([]);
        expect(normalise_spacing(['', ''], false)).toEqual([]);
    });

    it('keeps blank lines that are INSIDE the output', () => {
        expect(normalise_spacing(['a', '', 'b'], false)).toEqual([
            'a',
            '',
            'b',
        ]);
    });
});
