import { describe, it, expect } from 'vitest';
import { Script } from 'node:vm';
import { is_trusted_source, parse_from_runtime } from './protocol';
import { PYTHON_WORKER_SOURCE } from './worker_source';
import { SANDBOX_ATTR } from './client';

describe('parse_from_runtime', () => {
    it('accepts each well-formed message kind', () => {
        expect(
            parse_from_runtime({ kind: 'ready', banner: 'Python 3.13' }),
        ).toEqual({ kind: 'ready', banner: 'Python 3.13' });
        expect(parse_from_runtime({ kind: 'stdout', text: 'hi' })).toEqual({
            kind: 'stdout',
            text: 'hi',
        });
        expect(
            parse_from_runtime({
                kind: 'result',
                repr: '4',
                status: 'complete',
            }),
        ).toEqual({ kind: 'result', repr: '4', status: 'complete' });
        expect(
            parse_from_runtime({
                kind: 'result',
                repr: null,
                status: 'incomplete',
            }),
        ).toEqual({ kind: 'result', repr: null, status: 'incomplete' });
    });

    it('rejects anything that is not a recognised message', () => {
        // The parent listens on `window`, so it receives traffic from every
        // other frame on the page — the IE proxy and jspaint included. One
        // malformed payload must not take down the REPL, so this returns null
        // rather than throwing.
        expect(parse_from_runtime(null)).toBeNull();
        expect(parse_from_runtime('ready')).toBeNull();
        expect(parse_from_runtime(42)).toBeNull();
        expect(parse_from_runtime({})).toBeNull();
        expect(parse_from_runtime({ kind: 'evil' })).toBeNull();
    });

    it('rejects a known kind with the wrong payload type', () => {
        expect(parse_from_runtime({ kind: 'stdout', text: 123 })).toBeNull();
        expect(parse_from_runtime({ kind: 'ready' })).toBeNull();
        expect(
            parse_from_runtime({ kind: 'result', repr: 1, status: 'complete' }),
        ).toBeNull();
    });

    it('rejects an unknown exec status', () => {
        // `status` drives the `...` continuation prompt; an unrecognised value
        // would leave the REPL stuck in the wrong input mode.
        expect(
            parse_from_runtime({ kind: 'result', repr: null, status: 'maybe' }),
        ).toBeNull();
    });
});

describe('is_trusted_source', () => {
    // `is_trusted_source` only ever compares by IDENTITY, so a plain object
    // is a faithful stand-in — and avoids a cast that `no-unsafe-type-assertion`
    // rejects.
    const frame = { id: 'sandbox' };
    const other = { id: 'other' };

    it('accepts our frame speaking from an opaque origin', () => {
        expect(
            is_trusted_source({ source: frame, origin: 'null' }, frame),
        ).toBe(true);
    });

    it('rejects a different window, even claiming a null origin', () => {
        expect(
            is_trusted_source({ source: other, origin: 'null' }, frame),
        ).toBe(false);
    });

    it('rejects our frame if the origin is not opaque', () => {
        // If the origin is a real one, the sandbox lost allow-same-origin's
        // absence — i.e. the isolation is gone and the message must not be
        // trusted as coming from a powerless context.
        expect(
            is_trusted_source(
                { source: frame, origin: 'https://momad-xp.netlify.app' },
                frame,
            ),
        ).toBe(false);
    });

    it('rejects everything when the frame has no contentWindow yet', () => {
        expect(is_trusted_source({ source: frame, origin: 'null' }, null)).toBe(
            false,
        );
    });
});

describe('the sandbox attribute', () => {
    it('does NOT grant allow-same-origin', () => {
        // This single token is the fix for gate 2's CRITICAL 1. With it, Python
        // typed by a visitor reaches IndexedDB (the whole VFS), /api/browse
        // with a genuine Sec-Fetch-Site: same-origin, and /api/email with a
        // valid Origin. A test guards it because it is one word in an
        // attribute and would be trivially "tidied" back in.
        expect(SANDBOX_ATTR).toBe('allow-scripts');
        expect(SANDBOX_ATTR).not.toContain('allow-same-origin');
    });
});

/**
 * Syntax-check a source string WITHOUT executing it.
 *
 * `new vm.Script(...)` compiles and throws on a syntax error, which is exactly
 * the check wanted — and unlike `new Function(...)` it is not flagged as an
 * implied eval.
 */
function parse_js(source: string): void {
    new Script(source);
}

describe('PYTHON_WORKER_SOURCE', () => {
    it('is syntactically valid JavaScript', () => {
        // It ships as a STRING, so a syntax error would surface only at
        // runtime inside a worker — where it appears as an opaque
        // `worker.onerror` with no message. Compiling it here turns that into
        // a failing unit test.
        // Parsed as a module body rather than compiled, so this is a syntax
        // check and not an implied eval.
        expect(() => {
            parse_js(PYTHON_WORKER_SOURCE);
        }).not.toThrow();
    });

    it('loads the runtime from the index_url it is given, never a literal', () => {
        // The pinned version lives in ONE place (version.ts) and is asserted
        // against the devDependency there. A hardcoded URL here would silently
        // fork that pin.
        expect(PYTHON_WORKER_SOURCE).toContain('index_url');
        expect(PYTHON_WORKER_SOURCE).not.toContain('cdn.jsdelivr.net');
    });

    it('uses importScripts and the UMD bundle, not a module import', () => {
        // Measured inside a real sandbox="allow-scripts" frame: a MODULE
        // worker cannot be constructed from an opaque origin (blob:null/...),
        // and neither can it dynamic-import pyodide.mjs. importScripts of the
        // UMD build is the only route in. Guarded by a test because switching
        // back to `import()` looks like a modernisation and would silently
        // break the whole app.
        expect(PYTHON_WORKER_SOURCE).toContain('importScripts');
        expect(PYTHON_WORKER_SOURCE).toContain("'pyodide.js'");
        expect(PYTHON_WORKER_SOURCE).not.toContain('pyodide.mjs');
    });

    it('routes stdout and stderr back to the app rather than the console', () => {
        // Pyodide's default handlers write to the worker console, where a
        // visitor never sees them — the REPL would look like it did nothing.
        expect(PYTHON_WORKER_SOURCE).toContain("kind: 'stdout'");
        expect(PYTHON_WORKER_SOURCE).toContain("kind: 'stderr'");
    });

    it('uses PyodideConsole for continuation rather than counting braces', () => {
        // CPython's own codeop is what makes `def f():` continue correctly.
        expect(PYTHON_WORKER_SOURCE).toContain('PyodideConsole');
        expect(PYTHON_WORKER_SOURCE).toContain('syntax_check');
    });
});
