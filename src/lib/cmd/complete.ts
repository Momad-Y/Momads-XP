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

/** Everything that could follow the partial word under the cursor. */
export function candidates_for(
    buffer: string,
    cursor: number,
): readonly string[] {
    const { start, word } = word_at(buffer, cursor);
    const preceding = buffer.slice(0, start).trim();

    // First word -> a command name. Anything later -> that command's arguments.
    const pool =
        preceding.length === 0
            ? command_names()
            : (ARGUMENTS[preceding.split(/\s+/)[0] ?? ''] ?? []);

    return pool.filter((name) => name.startsWith(word));
}

export function complete(buffer: string, cursor: number): Completion {
    const { start, word } = word_at(buffer, cursor);
    const candidates = candidates_for(buffer, cursor);
    const unchanged: Completion = { buffer, cursor, candidates };

    if (candidates.length === 0) return unchanged;

    // A single match is finished for the visitor, trailing space included —
    // that is what makes `col<Tab>#ff8800` possible without a manual space.
    const insertion =
        candidates.length === 1
            ? `${candidates[0] ?? ''} `
            : common_prefix([...candidates]);

    if (insertion.length <= word.length) return unchanged;

    return {
        buffer: buffer.slice(0, start) + insertion + buffer.slice(cursor),
        cursor: start + insertion.length,
        candidates,
    };
}
