import { describe, it, expect } from 'vitest';
import { candidates_for, common_prefix, complete, word_at } from './complete';
import { command_names, execute, find_command } from './registry';
import { profile } from '../profile';
import { strip_ansi } from '../term/ansi';
import { readFileSync } from 'node:fs';
import { required, to_hard_drive } from '../types';

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

    it('offers the filesystem commands too', () => {
        for (const name of ['ls', 'cd', 'pwd', 'cat', 'dir']) {
            expect(candidates_for(name, name.length), name).toContain(name);
        }
    });

    it('offers exactly what `help` advertises — no more, no less', () => {
        // The old form of this test compared `candidates_for` against
        // `find_command`, and once DEFERRED_COMMANDS was deleted both sides
        // became the same array and it could no longer fail. This compares two
        // INDEPENDENT renderings instead: what Tab offers and what the shell's
        // own menu prints. A command added to one and not the other fails here.
        const advertised = execute('help', profile)
            .map(strip_ansi)
            .flatMap((line) => {
                const row = /^ {2}(\S+) {2,}\S/.exec(line);
                return row?.[1] == null ? [] : [row[1]];
            });
        expect(advertised.length).toBeGreaterThan(10);
        expect(
            [...advertised, 'help'].sort((a, b) => a.localeCompare(b)),
        ).toEqual(command_names());
        expect(candidates_for('', 0)).toEqual(command_names());
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

describe('completing a path', () => {
    const drive = to_hard_drive(
        JSON.parse(readFileSync('static/json/hard_drive.json', 'utf-8')),
    );
    const C = 'cTbkbrM4qjwF3UfmCoFkEK';
    const ctx = { drive, cwd: C };
    const tab = (line: string) => complete(line, line.length, ctx);

    it('completes a name containing a SPACE, which the word splitter cannot', () => {
        // The defect this exists to prevent: `word_at` splits on the last
        // space, so `'My Music'.startsWith('Mu')` is false and Tab was dead on
        // exactly the names this drive is full of.
        expect(tab('ls -a My Mu').buffer).toBe('ls -a My Music/');
    });

    it('does not widen to the whole directory on a second press', () => {
        // `cd My<Tab>` inserts the common prefix `My `. Pressing Tab again
        // must still be completing "My ", not an empty word against every
        // entry — the silent widening the old splitter produced.
        const first = tab('cd My');
        expect(first.buffer).toBe('cd My ');
        const second = complete(first.buffer, first.buffer.length, ctx);
        // My Documents is now a C: child too, and it comes first because XP
        // orders it first — Explorer and `ls` both render `children` verbatim.
        expect(second.candidates).toEqual([
            'My Documents/',
            'My Music/',
            'My Pictures/',
        ]);
    });

    it('terminates a directory with / and a file with a space', () => {
        // A trailing space after a directory would make the next word part of
        // the same segment, since the path is the raw remainder of the line.
        expect(tab('cd Experi').buffer).toBe('cd Experience/');
        expect(tab('cat Experience/Printerpix').buffer).toBe(
            'cat Experience/Printerpix — AI Engineer.txt ',
        );
    });

    it('completes the segment after a slash, not the whole argument', () => {
        expect(tab('ls Experience/').candidates).toHaveLength(6);
        // ...and `cd` there offers nothing, because Experience holds only files.
        expect(tab('cd Experience/').candidates).toEqual([]);
        expect(tab('ls /c/Proj').buffer).toBe('ls /c/Projects/');
        expect(tab('ls ~/Educ').buffer).toBe('ls ~/Education/');
    });

    it('offers cd only directories, and ls both', () => {
        expect(tab('cd ').candidates).not.toContain(
            'Mohamed_Abdelnasser_Resume.pdf ',
        );
        expect(tab('ls ').candidates).toContain(
            'Mohamed_Abdelnasser_Resume.pdf ',
        );
    });

    it('offers hidden entries, which ls would not have listed', () => {
        // You can cd into a hidden directory; completion has to admit it
        // exists or the only way in is to type it blind.
        expect(tab('cd Wallp').buffer).toBe('cd Wallpapers/');
    });

    it('ignores case while inserting the real name', () => {
        expect(tab('cd experi').buffer).toBe('cd Experience/');
    });

    it('skips the -a flag when locating the argument', () => {
        expect(tab('ls -a Wallp').buffer).toBe('ls -a Wallpapers/');
        expect(tab('ls --all Wallp').buffer).toBe('ls --all Wallpapers/');
    });

    it('leaves the line alone when the directory does not exist', () => {
        expect(tab('cd nope/x').buffer).toBe('cd nope/x');
    });

    it('still completes command names, and non-path arguments', () => {
        expect(tab('cle').buffer).toBe('clear ');
        expect(tab('color re').buffer).toBe('color reset ');
    });

    it('completes with the cursor MID-LINE, keeping the tail', () => {
        // Every other path test completes at the end of the line, so the
        // `slice(0, start) + insertion + slice(cursor)` splice was only ever
        // covered for the command-name branch.
        const line = 'cd Experi | tail';
        const at = 'cd Experi'.length;
        expect(complete(line, at, ctx).buffer).toBe('cd Experience/ | tail');
    });

    it('completes a drive to its path segment, not its Explorer name', () => {
        // `pwd` prints `/c`; rewriting the visitor's correct `/c` into `/C:`
        // would teach the wrong vocabulary for the shell's own path model.
        expect(tab('cd /').candidates).toEqual(['c/', 'd/', 'f/']);
    });

    it('offers a shortcut to a folder, which cd accepts', () => {
        // `resolve` derefs shortcuts, so `cd Link.lnk` works. Filtering on the
        // shortcut's own type made completion refuse what the command allows.
        const root = required(drive[C], 'seed root');
        const linked = {
            ...drive,
            [C]: { ...root, children: [...root.children, 'lnk'] },
            lnk: {
                ...required(drive['p2FolderProjects'], 'seed folder'),
                id: 'lnk',
                type: 'file' as const,
                name: 'Link to Projects.lnk',
                basename: 'Link to Projects',
                ext: '.lnk',
                parent: C,
                children: [],
                shortcut_target: 'p2FolderProjects',
            },
        };
        expect(complete('cd Link', 7, { drive: linked, cwd: C }).buffer).toBe(
            'cd Link to Projects.lnk/',
        );
    });

    it('offers nothing at all before the drive is seeded', () => {
        expect(complete('cd Experi', 9, { drive: null, cwd: C }).buffer).toBe(
            'cd Experi',
        );
    });
});
