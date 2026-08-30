import { describe, it, expect } from 'vitest';
import { run_sudo } from './sudo';
import { strip_ansi, DIM, FG_BRIGHT_GREEN, FG_YELLOW } from '../term/ansi';
import { MAX_COLS } from './format';
import { profile } from '../profile';

function plain(args: string[], user = 'momad'): string {
    return run_sudo(args, user).map(strip_ansi).join('\n');
}

describe('sudo follows the accent', () => {
    const ALL_CASES: string[][] = [
        [],
        ['make', 'me', 'a', 'sandwich'],
        ['sudo', 'rm'],
        ['su'],
        ['rm', '-rf', '/'],
        ['apt', 'install', 'linux'],
    ];

    it('writes every line through the accent slot', () => {
        // `color` repaints exactly ONE palette entry, bright green. Anything
        // written in another ANSI colour cannot follow it — which is what the
        // old `warn`-yellow refusal did.
        for (const args of ALL_CASES) {
            for (const line of run_sudo(args, 'momad')) {
                expect(line, `sudo ${args.join(' ')}`).toContain(
                    FG_BRIGHT_GREEN,
                );
            }
        }
    });

    it('uses no fixed colour that color would leave behind', () => {
        for (const args of ALL_CASES) {
            for (const line of run_sudo(args, 'momad')) {
                expect(line).not.toContain(FG_YELLOW);
            }
        }
    });

    it('dims the aside over the SAME slot rather than going grey', () => {
        // Grey is a different palette entry, so a grey aside would stay grey
        // while the line above it changed colour.
        const lines = run_sudo(['apt'], 'momad');
        expect(lines[0]).not.toContain(DIM);
        expect(lines.slice(1).every((l) => l.includes(DIM))).toBe(true);
    });
});

describe('sudo branches', () => {
    it('points newcomers at the joke when given nothing', () => {
        expect(plain([])).toContain('usage: sudo <command>');
        expect(plain([])).toContain('sandwich');
    });

    it('makes the sandwich — the one branch that does NOT refuse', () => {
        // xkcd 149. The entire joke is that sudo makes it work, so a refusal
        // here would be the one wrong answer.
        const out = plain(['make', 'me', 'a', 'sandwich']);
        expect(out).toContain('Okay.');
        expect(out).not.toContain('sudoers');
    });

    it('finds the sandwich regardless of capitalisation or spacing', () => {
        // An easter egg that needs exact capitalisation is one nobody finds.
        expect(plain(['Make', 'Me', 'A', 'Sandwich'])).toContain('Okay.');
        expect(plain(['make', 'me', 'a', 'sandwich', ''])).toContain('Okay.');
    });

    it('answers sudo sudo without repeating itself', () => {
        expect(plain(['sudo', 'rm'])).toContain('heard you the first time');
    });

    it('answers a root-shell request with the default refusal', () => {
        // There is no dedicated branch for `su`/`bash`/`-i` any more: the
        // "no root here" line was promoted to the DEFAULT aside, so asking for
        // a root shell gets the same answer as any other refused command.
        // Asserted explicitly, because the previous version of this test named
        // a branch that no longer exists and passed only because the phrase it
        // looked for had moved into the default.
        for (const shell of ['su', 'bash', '-i']) {
            expect(plain([shell]), shell).toContain('is not in the sudoers');
            expect(plain([shell]), shell).toContain('no root here');
        }
        expect(plain(['su'])).toBe(plain(['apt', 'install', 'linux']));
    });

    it('has a specific answer for rm, on top of the refusal', () => {
        const out = plain(['rm', '-rf', '/']);
        expect(out).toContain('is not in the sudoers file');
        expect(out).toContain('from inside the website');
    });

    it('falls back to the classic refusal for anything else', () => {
        const out = plain(['apt', 'install', 'linux']);
        expect(out).toContain('is not in the sudoers file');
        expect(out).toContain('This incident will be reported.');
        expect(out).toContain('no root here');
    });
});

describe('sudo output discipline', () => {
    it('derives the user, never hardcoding a name', () => {
        // §3.2 requires output sourced from JSON; CLAUDE.md forbids hardcoded
        // personal content. The jokes are the shell's voice and may be literals.
        expect(plain(['apt'], 'ada')).toContain('ada is not in the sudoers');
        expect(plain(['apt'], 'ada')).not.toContain('momad');

        const real = profile.meta.shortName.toLowerCase();
        expect(plain(['apt'], real)).toContain(real);
    });

    it('never echoes the arguments back', () => {
        // `sudo <something embarrassing>` should not be reprinted, and echoing
        // raw input into the terminal is how an injection lands.
        const out = plain(['\x1b[31mred', 'rm']);
        expect(out).not.toContain('red');
    });

    it('wraps to the width every other command is sized to', () => {
        for (const args of [
            [],
            ['su'],
            ['rm'],
            ['apt'],
            ['make', 'me', 'a', 'sandwich'],
        ]) {
            for (const line of plain(args).split('\n')) {
                expect(line.length, line).toBeLessThanOrEqual(MAX_COLS);
            }
        }
    });
});
