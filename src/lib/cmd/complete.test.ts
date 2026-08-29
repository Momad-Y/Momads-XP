import { describe, it, expect } from 'vitest';
import { candidates_for, common_prefix, complete, word_at } from './complete';
import { command_names, DEFERRED_COMMANDS, find_command } from './registry';

/** Complete at the end of the line, which is where Tab is normally pressed. */
function at_end(buffer: string) {
    return complete(buffer, buffer.length);
}

describe('common_prefix', () => {
    it('finds what a set of candidates share', () => {
        expect(common_prefix(['color', 'contact'])).toBe('co');
        expect(common_prefix(['help'])).toBe('help');
    });

    it('is empty when they share nothing, and for no candidates', () => {
        expect(common_prefix(['help', 'about'])).toBe('');
        expect(common_prefix([])).toBe('');
    });
});

describe('word_at', () => {
    it('takes the word the cursor sits at the end of', () => {
        expect(word_at('color re', 8)).toEqual({ start: 6, word: 're' });
        expect(word_at('hel', 3)).toEqual({ start: 0, word: 'hel' });
    });

    it('is empty directly after a space', () => {
        expect(word_at('color ', 6)).toEqual({ start: 6, word: '' });
    });

    it('ignores everything to the RIGHT of the cursor', () => {
        // Completing `ec|ho` against the whole token would replace text the
        // visitor deliberately left ahead of the cursor.
        expect(word_at('echo', 2)).toEqual({ start: 0, word: 'ec' });
    });
});

describe('completing a command name', () => {
    it('finishes a unique match and adds a space', () => {
        // The trailing space is what makes `col<Tab>#ff8800` work without
        // reaching for the spacebar.
        expect(at_end('hel')).toMatchObject({ buffer: 'help ', cursor: 5 });
        expect(at_end('pyt')).toMatchObject({ buffer: 'python ' });
    });

    it('extends to the common prefix when several match, with no space', () => {
        const result = at_end('co');
        expect(result.candidates.length).toBeGreaterThan(1);
        for (const name of result.candidates) {
            expect(name.startsWith('co'), name).toBe(true);
        }
        expect(result.buffer.endsWith(' ')).toBe(false);
        expect(result.buffer).toBe(common_prefix([...result.candidates]));
    });

    it('leaves the line alone when it is already the common prefix', () => {
        // The host lists the candidates in this case; silently doing nothing
        // would look like a broken key.
        const prefix = common_prefix(
            command_names().filter((n) => n.startsWith('c')),
        );
        const result = at_end(prefix);
        expect(result.buffer).toBe(prefix);
        expect(result.candidates.length).toBeGreaterThan(1);
    });

    it('offers every command on an empty line', () => {
        const result = complete('', 0);
        expect(result.candidates).toEqual(command_names());
        expect(result.buffer).toBe('');
    });

    it('matches nothing for a prefix no command has', () => {
        const result = at_end('zzz');
        expect(result.candidates).toEqual([]);
        expect(result.buffer).toBe('zzz');
    });

    it('is case-SENSITIVE, like the shell it completes for', () => {
        // §3.2 specifies bash, not cmd.exe. Completing `HEL` while `HELP` is
        // rejected by `find_command` would advertise a command that cannot run.
        expect(find_command('HELP')).toBeUndefined();
        expect(at_end('HEL').candidates).toEqual([]);
    });

    it('offers the deferred filesystem commands too', () => {
        // `help` lists them as coming later and `execute` answers them
        // specially, so they are names the shell knows. Hiding them from Tab
        // would contradict the shell's own menu.
        for (const name of DEFERRED_COMMANDS) {
            expect(candidates_for(name, name.length), name).toContain(name);
        }
    });

    it('only ever completes to a name the shell actually recognises', () => {
        // The failure this guards is a completer drifting from the registry and
        // confidently finishing a command that answers "command not found".
        for (const name of command_names()) {
            const typed = name.slice(0, 2);
            for (const candidate of candidates_for(typed, typed.length)) {
                const known =
                    find_command(candidate) != null ||
                    (DEFERRED_COMMANDS as readonly string[]).includes(
                        candidate,
                    );
                expect(known, `${candidate} is not a real command`).toBe(true);
            }
        }
    });
});

describe('completing an argument', () => {
    it('offers color its one keyword', () => {
        expect(at_end('color re')).toMatchObject({ buffer: 'color reset ' });
        expect(at_end('color ').candidates).toEqual(['reset']);
    });

    it('does not offer command names in argument position', () => {
        // `echo he<Tab>` must not become `echo help` — the shell would echo the
        // word "help" and the visitor would rightly wonder what happened.
        expect(at_end('echo he').candidates).toEqual([]);
        expect(at_end('echo he').buffer).toBe('echo he');
    });

    it('offers nothing for a command that takes free text', () => {
        expect(at_end('echo ').candidates).toEqual([]);
    });
});

describe('completing mid-line', () => {
    it('keeps the text after the cursor', () => {
        // `hel|` with ` world` already typed ahead of it.
        const result = complete('hel world', 3);
        expect(result.buffer).toBe('help  world');
        expect(result.cursor).toBe(5);
    });
});
