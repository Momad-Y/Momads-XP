import { describe, it, expect } from 'vitest';
import {
    PASTE_END,
    PASTE_START,
    feed,
    initial_state,
    set_line,
} from './readline';
import type { ReadlineState } from './readline';

/** Type `data` into a fresh (or given) state and return the resulting state. */
function type(data: string, from: ReadlineState = initial_state()) {
    return feed(from, data);
}

describe('typing and cursor movement', () => {
    it('inserts printable text at the cursor', () => {
        expect(type('help').state.buffer).toBe('help');
    });

    it('moves left and right and inserts in the middle', () => {
        const s = type('abc').state;
        const moved = feed(s, '\x1b[D\x1b[D').state; // two lefts
        expect(moved.cursor).toBe(1);
        expect(feed(moved, 'X').state.buffer).toBe('aXbc');
    });

    it('clamps the cursor at both ends', () => {
        const s = type('ab').state;
        expect(feed(s, '\x1b[C\x1b[C\x1b[C').state.cursor).toBe(2);
        expect(feed(s, '\x1b[D\x1b[D\x1b[D\x1b[D').state.cursor).toBe(0);
    });

    it('Home and End jump to the ends', () => {
        const s = type('hello').state;
        expect(feed(s, '\x1b[H').state.cursor).toBe(0);
        expect(feed(feed(s, '\x1b[H').state, '\x1b[F').state.cursor).toBe(5);
    });

    it('backspace deletes before the cursor and rings at column 0', () => {
        expect(type('abc\x7f').state.buffer).toBe('ab');
        const at_start = type('\x7f');
        expect(at_start.state.buffer).toBe('');
        expect(at_start.effects).toEqual([{ kind: 'bell' }]);
    });

    it('Delete removes forward without moving the cursor', () => {
        const s = feed(type('abc').state, '\x1b[H').state;
        const out = feed(s, '\x1b[3~').state;
        expect(out.buffer).toBe('bc');
        expect(out.cursor).toBe(0);
    });

    it('ignores stray control bytes instead of inserting them', () => {
        // A NUL or a form feed arriving mid-stream must not become a glyph.
        expect(type('a\x00\x0cb').state.buffer).toBe('ab');
    });

    it('swallows an unknown CSI sequence whole', () => {
        // Without the catch-all the bracket and digits fall through as
        // printable text and the visitor sees "[15~" appear in their prompt.
        expect(type('a\x1b[15~b').state.buffer).toBe('ab');
    });
});

describe('submitting', () => {
    it('emits the line and clears the buffer', () => {
        const out = type('whoami\r');
        expect(out.effects).toEqual([{ kind: 'submit', line: 'whoami' }]);
        expect(out.state.buffer).toBe('');
        expect(out.state.cursor).toBe(0);
    });

    it('submits an empty line without recording it in history', () => {
        const out = type('\r');
        expect(out.effects).toEqual([{ kind: 'submit', line: '' }]);
        expect(out.state.history).toEqual([]);
    });

    it('does not record consecutive duplicates', () => {
        let s = initial_state();
        s = feed(s, 'ls\r').state;
        s = feed(s, 'ls\r').state;
        expect(s.history).toEqual(['ls']);
    });

    it('records distinct lines in order', () => {
        let s = initial_state();
        s = feed(s, 'a\r').state;
        s = feed(s, 'b\r').state;
        expect(s.history).toEqual(['a', 'b']);
    });
});

describe('history browsing', () => {
    const seeded = () => initial_state(['first', 'second']);

    it('Up walks backwards from the newest', () => {
        const s = feed(seeded(), '\x1b[A').state;
        expect(s.buffer).toBe('second');
        expect(feed(s, '\x1b[A').state.buffer).toBe('first');
    });

    it('stops at the oldest entry', () => {
        let s = feed(seeded(), '\x1b[A\x1b[A').state;
        s = feed(s, '\x1b[A').state;
        expect(s.buffer).toBe('first');
    });

    it('Down past the newest restores the half-typed draft', () => {
        // The behaviour that makes history non-destructive: start typing,
        // browse away, come back and your text is still there.
        let s = feed(seeded(), 'partial').state;
        s = feed(s, '\x1b[A').state;
        expect(s.buffer).toBe('second');
        s = feed(s, '\x1b[B').state;
        expect(s.buffer).toBe('partial');
        expect(s.cursor).toBe('partial'.length);
    });

    it('Down does nothing when not browsing', () => {
        const s = feed(seeded(), 'x').state;
        expect(feed(s, '\x1b[B').state.buffer).toBe('x');
    });

    it('Up on empty history is a no-op', () => {
        expect(feed(initial_state(), '\x1b[A').state.buffer).toBe('');
    });

    it('submitting while browsing leaves history browsable again', () => {
        let s = feed(seeded(), '\x1b[A').state; // "second"
        const out = feed(s, '\r');
        s = out.state;
        expect(out.effects).toEqual([{ kind: 'submit', line: 'second' }]);
        expect(s.browsing).toBeNull();
    });
});

describe('Ctrl+C', () => {
    it('clears the line and reports an interrupt', () => {
        const out = type('rm -rf\x03');
        expect(out.state.buffer).toBe('');
        expect(out.effects).toContainEqual({ kind: 'interrupt' });
    });

    it('is handled here and never escapes to the window', () => {
        // session-handoff.md §8 rule 3: three surfaces bind window keydown, so
        // one Ctrl+C reaching two handlers is a shipped bug class. Consuming
        // it in the readline is what keeps it off the desktop's clipboard
        // handler.
        const out = type('\x03');
        expect(out.effects).toEqual([{ kind: 'interrupt' }]);
    });
});

describe('bracketed paste', () => {
    it('strips the markers instead of typing them', () => {
        // xterm enables bracketed paste by default. Without decoding, the
        // literal ESC[200~ / ESC[201~ land in the buffer and EVERY paste is
        // corrupted — the failure this test exists for.
        const out = type(`${PASTE_START}hello${PASTE_END}`);
        expect(out.state.buffer).toBe('hello');
        expect(out.state.buffer).not.toContain('200~');
        expect(out.state.pasting).toBe(false);
    });

    it('submits each line of a multi-line paste', () => {
        const out = type(`${PASTE_START}one\ntwo${PASTE_END}`);
        expect(out.effects).toEqual([{ kind: 'submit', line: 'one' }]);
        expect(out.state.buffer).toBe('two');
    });

    it('treats CRLF as a single break', () => {
        const out = type(`${PASTE_START}a\r\nb${PASTE_END}`);
        expect(out.effects).toEqual([{ kind: 'submit', line: 'a' }]);
        expect(out.state.buffer).toBe('b');
    });

    it('inserts escape sequences as TEXT while pasting', () => {
        // The security point of bracketing: pasted content must never act as
        // control input. A pasted "\x1b[A" is four characters, not a history
        // recall — otherwise a crafted paste could replay a previous command.
        const out = type(
            `${PASTE_START}a\x1b[Ab${PASTE_END}`,
            initial_state(['danger']),
        );
        expect(out.state.buffer).toBe('a\x1b[Ab');
        expect(out.state.buffer).not.toBe('danger');
    });

    it('survives a paste split across two chunks', () => {
        // xterm delivers onData in arbitrary chunks; a large paste is never
        // one call.
        let s = initial_state();
        s = feed(s, `${PASTE_START}hel`).state;
        expect(s.pasting).toBe(true);
        s = feed(s, `lo${PASTE_END}`).state;
        expect(s.buffer).toBe('hello');
        expect(s.pasting).toBe(false);
    });
});

describe('Ctrl+D (EOF)', () => {
    it('emits eof on an EMPTY line', () => {
        // Both shells and CPython treat this as "close the session".
        expect(type('\x04').effects).toEqual([{ kind: 'eof' }]);
    });

    it('does NOT emit eof mid-line, and leaves the buffer intact', () => {
        // CPython ignores Ctrl+D mid-line rather than deleting forward the way
        // bash does. Emitting eof here would close the window under someone
        // who was still typing.
        const out = type('hello\x04');
        expect(out.effects).toEqual([{ kind: 'bell' }]);
        expect(out.state.buffer).toBe('hello');
    });

    it('emits eof after the line is cleared', () => {
        const cleared = feed(type('abc').state, '\x7f\x7f\x7f');
        expect(feed(cleared.state, '\x04').effects).toEqual([{ kind: 'eof' }]);
    });
});

describe('Tab', () => {
    it('reports a completion request instead of editing the line', () => {
        // The editor is shared with the Python REPL, whose vocabulary is
        // entirely different, so it must not decide what Tab means.
        const result = feed(initial_state(), 'hel\t');
        expect(result.state.buffer).toBe('hel');
        expect(result.effects).toContainEqual({ kind: 'complete' });
    });

    it('was silently swallowed before, so ignoring it is still a no-op', () => {
        // Tab is a C0 byte and fell into the "any other control byte" branch.
        // Nothing inserted it then and nothing inserts it now.
        expect(feed(initial_state(), '\t').state.buffer).toBe('');
    });

    it('still INSERTS a tab inside a bracketed paste', () => {
        // Pasting indented Python must keep its indentation. The paste branch
        // runs before the control-character section for exactly this reason.
        const result = feed(
            initial_state(),
            `${PASTE_START}\tindented${PASTE_END}`,
        );
        expect(result.state.buffer).toBe('\tindented');
        expect(result.effects).not.toContainEqual({ kind: 'complete' });
    });
});

describe('set_line', () => {
    it('replaces the line and moves the cursor', () => {
        const state = feed(initial_state(), 'hel').state;
        const next = set_line(state, 'help ', 5);
        expect(next.buffer).toBe('help ');
        expect(next.cursor).toBe(5);
    });

    it('clamps a cursor that does not fit the new line', () => {
        const next = set_line(initial_state(), 'ab', 99);
        expect(next.cursor).toBe(2);
        expect(set_line(initial_state(), 'ab', -5).cursor).toBe(0);
    });

    it('preserves history, so completing does not cost the ring', () => {
        const typed = feed(initial_state(), 'echo one\r').state;
        expect(set_line(typed, 'hel', 3).history).toEqual(['echo one']);
    });
});
