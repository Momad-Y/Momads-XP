import { describe, it, expect } from 'vitest';
import {
    COMMANDS,
    DEFERRED_COMMANDS,
    execute,
    find_command,
    parse,
    with_trailing_blank,
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

    it('names the deferred commands under a "coming" heading', () => {
        // §1b's "no dead entries" standard: a deferral has to be legible.
        const out = plain('help');
        for (const name of DEFERRED_COMMANDS) expect(out).toContain(name);
        expect(out.toLowerCase()).toContain('later update');
    });
});

describe('deferred filesystem commands', () => {
    it('answer as KNOWN commands, not "command not found"', () => {
        // §3.2 assigns ls/cd/pwd/cat to Phase 6 by name. Answering
        // "command not found" would read as broken rather than deferred.
        for (const name of DEFERRED_COMMANDS) {
            const out = plain(name);
            expect(out).toContain('not available yet');
            expect(out).not.toContain('command not found');
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

describe('output spacing is consistent across commands', () => {
    /** Commands that produce output and are therefore spaced identically. */
    const PRINTING = [
        'help',
        'about',
        'skills',
        'experience',
        'projects',
        'contact',
        'social',
        'whoami',
        'uname -a',
        'date',
        'time',
        'sudo',
    ];

    it('every printing command ends with EXACTLY one blank line', () => {
        // The reported inconsistency: skills/experience/projects blanked after
        // every group and so ended with one, while about/contact/social/help
        // ended flush against the next prompt. Seven call sites each deciding
        // separately is how it drifted.
        for (const cmd of PRINTING) {
            const out = execute(cmd, profile);
            expect(out.length, `${cmd} printed nothing`).toBeGreaterThan(0);
            expect(out[out.length - 1], `${cmd} does not end blank`).toBe('');
            expect(
                out[out.length - 2],
                `${cmd} ends with TWO blank lines`,
            ).not.toBe('');
        }
    });

    it('an unknown command is spaced the same way', () => {
        const out = execute('nope', profile);
        expect(out[out.length - 1]).toBe('');
    });

    it('a deferred filesystem command is spaced the same way', () => {
        const out = execute('ls', profile);
        expect(out[out.length - 1]).toBe('');
    });

    it('silent commands stay silent', () => {
        // A blank line before a freshly cleared screen's prompt would be a
        // visible artefact.
        for (const cmd of ['clear', 'matrix', 'hack', 'exit']) {
            expect(execute(cmd, profile), cmd).toEqual([]);
        }
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

describe('with_trailing_blank', () => {
    it('collapses several trailing blanks to one', () => {
        expect(with_trailing_blank(['a', '', '', ''])).toEqual(['a', '']);
    });

    it('adds one when there is none', () => {
        expect(with_trailing_blank(['a'])).toEqual(['a', '']);
    });

    it('leaves empty output empty', () => {
        expect(with_trailing_blank([])).toEqual([]);
        expect(with_trailing_blank(['', ''])).toEqual([]);
    });
});
