/**
 * A line editor for xterm.js — pure, DOM-free, and therefore testable.
 *
 * WHY WE OWN THIS: xterm ships no line editor at all, and the community addons
 * for it are unmaintained. More importantly, the Python REPL needs
 * continuation and interrupt semantics that no generic addon exposes (spec
 * D-A2, reasoning corrected at gate 2 — the original "only testable option"
 * justification was post-hoc).
 *
 * WHY IT IS PURE: everything here is (state, input) -> (state, effects). The
 * only DOM in the terminal stack is the xterm construction in the `.svelte`
 * component, which is coverage-exempt. Gate 4 killed the plan's jsdom
 * dependency for exactly this reason: jsdom returns an empty
 * getComputedStyle().height for every element, which is the same NaN condition
 * that makes FitAddon.fit() fail silently — the environment and the bug fail
 * identically, so a jsdom test could not tell fixed from broken.
 */

export interface ReadlineState {
    /** The line being edited. */
    readonly buffer: string;
    /** Insertion point, 0..buffer.length. */
    readonly cursor: number;
    /** Newest last. Submitted lines are appended; duplicates are not. */
    readonly history: readonly string[];
    /** Index being browsed, or null when editing a fresh line. */
    readonly browsing: number | null;
    /** Buffer stashed when history browsing started, restored on the way down. */
    readonly draft: string;
    /** Inside an ESC[200~ … ESC[201~ bracketed paste. */
    readonly pasting: boolean;
}

export type ReadlineEffect =
    { kind: 'submit'; line: string } | { kind: 'interrupt' } | { kind: 'bell' };

export interface ReadlineResult {
    readonly state: ReadlineState;
    readonly effects: readonly ReadlineEffect[];
}

export const PASTE_START = '\x1b[200~';
export const PASTE_END = '\x1b[201~';

export function initial_state(history: readonly string[] = []): ReadlineState {
    return {
        buffer: '',
        cursor: 0,
        history,
        browsing: null,
        draft: '',
        pasting: false,
    };
}

function insert(state: ReadlineState, text: string): ReadlineState {
    return {
        ...state,
        buffer:
            state.buffer.slice(0, state.cursor) +
            text +
            state.buffer.slice(state.cursor),
        cursor: state.cursor + text.length,
    };
}

function submit(state: ReadlineState): ReadlineResult {
    const line = state.buffer;
    // Consecutive duplicates are not recorded — pressing Enter twice on the
    // same command should not need two Ups to get past.
    const history =
        line.length > 0 && line !== state.history[state.history.length - 1]
            ? [...state.history, line]
            : state.history;
    return {
        state: {
            ...state,
            buffer: '',
            cursor: 0,
            history,
            browsing: null,
            draft: '',
        },
        effects: [{ kind: 'submit', line }],
    };
}

function browse(state: ReadlineState, delta: number): ReadlineState {
    if (state.history.length === 0) return state;
    if (state.browsing === null) {
        if (delta > 0) return state; // already at the newest entry
        const index = state.history.length - 1;
        const buffer = state.history[index] ?? '';
        return {
            ...state,
            draft: state.buffer,
            browsing: index,
            buffer,
            cursor: buffer.length,
        };
    }
    const next = state.browsing + delta;
    if (next < 0) return state;
    if (next >= state.history.length) {
        // Past the newest entry: restore whatever was being typed.
        return {
            ...state,
            browsing: null,
            buffer: state.draft,
            cursor: state.draft.length,
        };
    }
    const buffer = state.history[next] ?? '';
    return { ...state, browsing: next, buffer, cursor: buffer.length };
}

/**
 * Feed one chunk from xterm's `onData`.
 *
 * Chunks arrive as raw strings and may contain escape sequences, several
 * keystrokes, or a whole pasted document. Processing is byte-wise with
 * explicit multi-byte lookahead rather than regex-per-key, because a paste can
 * legitimately contain text that LOOKS like an escape sequence.
 */
export function feed(state: ReadlineState, data: string): ReadlineResult {
    let next = state;
    const effects: ReadlineEffect[] = [];
    let i = 0;

    while (i < data.length) {
        const rest = data.slice(i);

        // ── bracketed paste ─────────────────────────────────────────────────
        // xterm enables bracketed paste by default, so WITHOUT this the
        // literal markers land in the buffer and every multi-line paste is
        // corrupted. Inside a paste, escape sequences are inserted as text —
        // that is the entire security point of bracketing: pasted content can
        // never act as control input.
        if (rest.startsWith(PASTE_START)) {
            next = { ...next, pasting: true };
            i += PASTE_START.length;
            continue;
        }
        if (rest.startsWith(PASTE_END)) {
            next = { ...next, pasting: false };
            i += PASTE_END.length;
            continue;
        }

        const ch = data[i] ?? '';

        if (next.pasting) {
            // A newline inside a paste submits the line, so pasting a block of
            // Python behaves the way a visitor expects.
            if (ch === '\r' || ch === '\n') {
                const result = submit(next);
                next = result.state;
                effects.push(...result.effects);
                // \r\n is one break, not two.
                if (ch === '\r' && data[i + 1] === '\n') i++;
            } else {
                next = insert(next, ch);
            }
            i++;
            continue;
        }

        // ── control characters ──────────────────────────────────────────────
        if (ch === '\r' || ch === '\n') {
            const result = submit(next);
            next = result.state;
            effects.push(...result.effects);
            i++;
            continue;
        }
        if (ch === '\x03') {
            // Ctrl+C. Handled HERE and never at window level: three surfaces
            // already bind window keydown, and one Ctrl+C reaching two
            // handlers is documented in session-handoff.md §8 rule 3 as the
            // cause of a shipped clipboard bug.
            next = { ...next, buffer: '', cursor: 0, browsing: null };
            effects.push({ kind: 'interrupt' });
            i++;
            continue;
        }
        if (ch === '\x7f' || ch === '\b') {
            if (next.cursor === 0) {
                effects.push({ kind: 'bell' });
            } else {
                next = {
                    ...next,
                    buffer:
                        next.buffer.slice(0, next.cursor - 1) +
                        next.buffer.slice(next.cursor),
                    cursor: next.cursor - 1,
                };
            }
            i++;
            continue;
        }

        // ── CSI sequences ───────────────────────────────────────────────────
        if (rest.startsWith('\x1b[')) {
            const map: Record<string, () => void> = {
                D: () => {
                    next = { ...next, cursor: Math.max(0, next.cursor - 1) };
                },
                C: () => {
                    next = {
                        ...next,
                        cursor: Math.min(next.buffer.length, next.cursor + 1),
                    };
                },
                A: () => {
                    next = browse(next, -1);
                },
                B: () => {
                    next = browse(next, 1);
                },
                H: () => {
                    next = { ...next, cursor: 0 };
                },
                F: () => {
                    next = { ...next, cursor: next.buffer.length };
                },
            };
            const final = rest[2] ?? '';
            const handler = map[final];
            if (handler != null) {
                handler();
                i += 3;
                continue;
            }
            if (rest.startsWith('\x1b[3~')) {
                // Delete (forward)
                next = {
                    ...next,
                    buffer:
                        next.buffer.slice(0, next.cursor) +
                        next.buffer.slice(next.cursor + 1),
                };
                i += 4;
                continue;
            }
            // Unknown CSI: consume through its final byte rather than letting
            // the bracket and digits fall through as printable text.
            let j = i + 2;
            while (j < data.length && /[0-9;?]/.test(data[j] ?? '')) j++;
            i = j + 1;
            continue;
        }

        // Any other C0 control byte is ignored rather than inserted.
        if (ch < ' ') {
            i++;
            continue;
        }

        next = insert(next, ch);
        i++;
    }

    return { state: next, effects };
}
