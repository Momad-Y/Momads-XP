/**
 * Tab completion for the shell, as a pure function of the line being edited.
 *
 * The line editor (`src/lib/term/readline.ts`) knows nothing about this: it is
 * shared with the Python REPL, whose vocabulary is entirely different, so it
 * only reports that Tab was pressed and the host asks this module what to do.
 *
 * Bash semantics, because §3.2 specifies bash emulation:
 *   - one candidate  -> complete it and append a space, so the next word can be
 *                       typed immediately
 *   - several        -> extend to their longest common prefix, no space
 *   - no progress    -> the caller lists the candidates
 *   - none           -> the caller rings the bell
 *
 * Matching is case-SENSITIVE, like `find_command`. §3.2 asks for bash, not
 * cmd.exe, and a completer that accepts `HEL` while the shell rejects `HELP`
 * would be advertising a command that does not run.
 */
import { COLOR_RESET } from './color';
import { command_names } from './registry';
import { children_of, is_dir, resolve } from './path';
import type { HardDrive } from '../types';

/** Commands whose argument is a path rather than free text. */
const PATH_COMMANDS = ['cd', 'ls', 'cat', 'dir'];

export interface CompletionContext {
    /** `null` before the boot screen has seeded it; completion then offers nothing. */
    drive: HardDrive | null;
    cwd: string;
}

/**
 * Arguments worth completing, by command.
 *
 * Deliberately tiny. `color` is the only command in the set whose argument
 * comes from a fixed vocabulary — everything else takes free text (`echo`), a
 * hex colour, or nothing at all — so a general argument-completion mechanism
 * would be scaffolding around a single entry.
 */
const ARGUMENTS: Readonly<Record<string, readonly string[]>> = {
    color: [COLOR_RESET],
};

interface PathTarget {
    /** Where in the buffer the segment being completed starts. */
    start: number;
    /** The partial segment itself, after the last `/`. */
    prefix: string;
    /** The directory the segment is being matched inside. */
    base: string;
    only_dirs: boolean;
}

export interface Completion {
    /** The line after completing. Unchanged when nothing could be applied. */
    buffer: string;
    cursor: number;
    /** Every candidate for the word under the cursor, for the caller to list. */
    candidates: readonly string[];
}

/** The longest prefix shared by every entry. `''` when they share nothing. */
export function common_prefix(values: readonly string[]): string {
    if (values.length === 0) return '';
    let prefix = values[0] ?? '';
    for (const value of values.slice(1)) {
        let i = 0;
        while (
            i < prefix.length &&
            i < value.length &&
            prefix[i] === value[i]
        ) {
            i++;
        }
        prefix = prefix.slice(0, i);
        if (prefix.length === 0) break;
    }
    return prefix;
}

/**
 * The word the cursor sits at the end of, and where it starts.
 *
 * Only the text BEFORE the cursor matters. Completing `ec|ho` on the whole
 * token would replace text the visitor deliberately left to the right of the
 * cursor.
 */
export function word_at(
    buffer: string,
    cursor: number,
): { start: number; word: string } {
    const before = buffer.slice(
        0,
        Math.max(0, Math.min(buffer.length, cursor)),
    );
    const start = before.lastIndexOf(' ') + 1;
    return { start, word: before.slice(start) };
}

/**
 * Locate the path segment under the cursor, for `cd`/`ls`/`cat`/`dir`.
 *
 * `word_at` cannot do this. It splits on the last space (see above), and the
 * names on this drive are full of spaces — `My Music`, `Printerpix — AI
 * Engineer.txt` — so completing `cd My Mu` through it would filter
 * `'My Music'.startsWith('Mu')` and find nothing. The path argument is instead
 * everything from after the command (and its `-a`, if any) to the cursor, with
 * only the text after the last `/` treated as the partial segment.
 */
function path_target(
    buffer: string,
    cursor: number,
    cwd: string,
    drive: HardDrive,
): PathTarget | null {
    const before = buffer.slice(
        0,
        Math.max(0, Math.min(buffer.length, cursor)),
    );
    const head = /^\s*(\S+)\s+/.exec(before);
    if (head == null) return null;

    const command = head[1] ?? '';
    if (!PATH_COMMANDS.includes(command)) return null;

    let arg_start = head[0].length;
    if (command === 'ls' || command === 'dir') {
        const flag = /^(-a|--all)\s+/.exec(before.slice(arg_start));
        if (flag != null) arg_start += flag[0].length;
    }

    const typed = before.slice(arg_start);
    const cut = typed.lastIndexOf('/');
    const dir_part = cut === -1 ? '' : typed.slice(0, cut + 1);
    const located =
        dir_part === '' ? { id: cwd } : resolve(dir_part, cwd, drive);
    if ('missing' in located) return null;

    return {
        start: arg_start + dir_part.length,
        prefix: cut === -1 ? typed : typed.slice(cut + 1),
        base: located.id,
        only_dirs: command === 'cd',
    };
}

/**
 * A directory completes to `name/`, a file to `name `.
 *
 * The slash is not decoration. The path argument is the raw remainder of the
 * line, so a trailing SPACE after a directory would make `cd Experience ` plus
 * a filename read as one segment called `Experience Printerpix…` and match
 * nothing. `/` is both the separator and the signal there is more to type.
 */
function terminated(name: string, directory: boolean): string {
    return directory ? `${name}/` : `${name} `;
}

/** Everything that could follow the partial word under the cursor. */
export function candidates_for(
    buffer: string,
    cursor: number,
    context: CompletionContext = { drive: null, cwd: '/' },
): readonly string[] {
    const { drive, cwd } = context;
    if (drive != null) {
        const target = path_target(buffer, cursor, cwd, drive);
        if (target != null) {
            const folded = target.prefix.toLowerCase();
            return children_of(target.base, drive, true)
                .filter(
                    (item) =>
                        (!target.only_dirs || is_dir(item)) &&
                        item.name.toLowerCase().startsWith(folded),
                )
                .map((item) => terminated(item.name, is_dir(item)));
        }
    }

    const { start, word } = word_at(buffer, cursor);
    const preceding = buffer.slice(0, start).trim();

    // First word -> a command name. Anything later -> that command's arguments.
    const pool =
        preceding.length === 0
            ? command_names()
            : (ARGUMENTS[preceding.split(/\s+/)[0] ?? ''] ?? []);

    return pool.filter((name) => name.startsWith(word));
}

export function complete(
    buffer: string,
    cursor: number,
    context: CompletionContext = { drive: null, cwd: '/' },
): Completion {
    const candidates = candidates_for(buffer, cursor, context);
    const unchanged: Completion = { buffer, cursor, candidates };
    if (candidates.length === 0) return unchanged;

    // A path segment replaces from after the last `/`; a bare word replaces
    // from the last space. Getting this wrong is what would strand `My ` in
    // the buffer while completing against the whole directory.
    const path =
        context.drive == null
            ? null
            : path_target(buffer, cursor, context.cwd, context.drive);
    const start = path?.start ?? word_at(buffer, cursor).start;
    const typed = path?.prefix ?? word_at(buffer, cursor).word;

    // A single match is finished for the visitor, terminator included — that
    // is what makes `col<Tab>#ff8800` possible without a manual space, and
    // what lets `cd Ex<Tab>Printerpix` keep going without one.
    const insertion =
        candidates.length === 1
            ? path == null
                ? `${candidates[0] ?? ''} `
                : (candidates[0] ?? '')
            : common_prefix([...candidates]);

    if (insertion.length <= typed.length) return unchanged;

    return {
        buffer: buffer.slice(0, start) + insertion + buffer.slice(cursor),
        cursor: start + insertion.length,
        candidates,
    };
}
