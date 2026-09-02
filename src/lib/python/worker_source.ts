/**
 * The Pyodide driver, authored HERE and shipped to the sandbox as a string.
 *
 * WHY A STRING AND NOT A FILE: the runtime must run on an OPAQUE origin, and a
 * worker script URL has to be same-origin with the document that creates it —
 * measured: `new Worker('/w.js')` from a sandboxed frame throws
 * "cannot be accessed from origin 'null'". A `blob:` URL inherits the creating
 * context's opaque origin, so it works. But a blob needs its source as text.
 *
 * WHY NOT PUT IT IN static/: gate 4's finding #13 — `static/` is outside
 * ESLint, prettier and coverage, and this is the single hardest piece of
 * Phase 3. Keeping it in `src/` means it is linted and type-checked, and the
 * parent hands it to the frame in the `init` message, so the static host page
 * stays a genuinely thin bootstrap with no logic to review.
 *
 * The string is intentionally plain ES: it is not compiled by Vite, so no
 * imports, no TypeScript syntax, and no optional chaining beyond what a modern
 * worker parses natively.
 *
 * IT IS A CLASSIC WORKER, NOT A MODULE WORKER. Measured inside a real
 * `sandbox="allow-scripts"` frame, where blob URLs are minted as `blob:null/…`:
 *
 *     classic blob worker                     -> OK
 *     MODULE blob worker                      -> error (opaque)
 *     module worker + import() of pyodide.mjs -> error (opaque)
 *     classic worker + importScripts(pyodide.js) -> OK
 *
 * A module worker simply cannot be constructed from an opaque origin in
 * Chromium, so `importScripts` is the only route in — which is why this loads
 * `pyodide.js` (UMD) rather than `pyodide.mjs`.
 *
 * THIS MAKES THE VERSION PIN ARCHITECTURAL. Pyodide 314.x drops classic worker
 * support entirely and renames the UMD bundle away, so upgrading past 0.28.x
 * would break the isolation model, not merely the banner text. version.ts says
 * the pin is about the 3.13 banner; it is also about this.
 */

/**
 * Built as a function body rather than a bare template literal so editors
 * still highlight it and a syntax error is at least visible on review.
 */
/**
 * The Python that builds `/c` before the banner appears.
 *
 * Hoisted out of the worker template and interpolated with `JSON.stringify`,
 * because that template is a `String.raw` — an escaped backtick inside it
 * survives as a literal backslash and the emitted worker stops being valid
 * JavaScript. (It did; `new Function(source)` caught it.)
 */
const XP_FS_INIT = `
import os, shutil, pathlib

_tree = _xp_mirror.to_py()

# /tmp is Emscripten's, not ours, and its presence makes / look like a real
# machine's root. tempfile recreates it on demand if anything needs it.
shutil.rmtree('/tmp', ignore_errors=True)

os.makedirs('/c', exist_ok=True)
_writable = []
for _entry in _tree:
    _path = '/c/' + _entry['path']
    if 'text' in _entry and _entry['text'] is not None:
        os.makedirs(os.path.dirname(_path), exist_ok=True)
        pathlib.Path(_path).write_text(_entry['text'])
    else:
        os.makedirs(_path, exist_ok=True)
        if _entry.get('writable'):
            _writable.append(_path)

# Read-only, deepest first, so chmod-ing a parent cannot block writing its
# children. This is HONESTY, not security: MEMFS is the worker's own memory
# and Python can chmod it back. It exists so a mistake fails loudly and
# locally instead of looking like it worked.
for _dir, _, _files in os.walk('/c', topdown=False):
    if any(_dir == w or _dir.startswith(w + '/') for w in _writable):
        continue
    for _f in _files:
        os.chmod(os.path.join(_dir, _f), 0o444)
    os.chmod(_dir, 0o555)

os.chdir('/c')
del _tree, _writable, _entry, _path, _dir, _files, _f
`;

export const PYTHON_WORKER_SOURCE = String.raw`
let pyodide = null;
let console_obj = null;

const send = (msg) => { self.postMessage(msg); };

async function init(index_url, greeting, mirror) {
    try {
        send({ kind: 'loading', detail: 'Fetching runtime' });
        // importScripts, not import(): a module worker cannot exist on an
        // opaque origin. This exposes loadPyodide as a global.
        importScripts(index_url + 'pyodide.js');
        send({ kind: 'loading', detail: 'Starting interpreter' });

        pyodide = await loadPyodide({
            indexURL: index_url,
            // Routed to the app instead of the worker console so a visitor
            // sees progress rather than a frozen window.
            stdout: (text) => { send({ kind: 'stdout', text: text + '\n' }); },
            stderr: (text) => { send({ kind: 'stderr', text: text + '\n' }); },
        });

        // PyodideConsole is CPython's own codeop behind a JS surface, which is
        // what makes "def f():" continue correctly. Hand-rolled brace counting
        // gets multi-line input subtly wrong.
        const mod_console = pyodide.pyimport('pyodide.console');
        console_obj = mod_console.PyodideConsole(pyodide.globals);
        console_obj.stdout_callback = (text) => { send({ kind: 'stdout', text }); };
        console_obj.stderr_callback = (text) => { send({ kind: 'stderr', text }); };

        const banner = String(mod_console.BANNER || '');

        // Build /c BEFORE the banner, so the first prompt already has a
        // filesystem under it.
        //
        // The tree crosses the JS->Python boundary through globals.set +
        // to_py, NEVER string interpolation: the shipped names contain an
        // apostrophe (Momad's XP.txt), an em dash, an en dash and a middle
        // dot, any of which breaks generated source.
        pyodide.globals.set('_xp_mirror', mirror || []);
        pyodide.runPython(${JSON.stringify(XP_FS_INIT)});
        pyodide.globals.delete('_xp_mirror');

        if (greeting) {
            // §3.2's pre-loaded greeting. Pushed through the console so it
            // appears exactly as if the visitor had typed it.
            await run_source(greeting, true);
        }

        send({ kind: 'ready', banner });
    } catch (error) {
        send({
            kind: 'error',
            message:
                'Python runtime unavailable — ' +
                (error && error.message ? error.message : String(error)),
        });
    }
}

async function run_source(source, quiet) {
    if (!console_obj) {
        send({ kind: 'error', message: 'Python runtime is not ready yet.' });
        return;
    }
    let status = 'complete';
    let repr = null;
    try {
        const future = console_obj.push(source);
        status = String(future.syntax_check);
        if (status === 'complete') {
            const value = await future;
            if (value !== undefined && value !== null) {
                repr = pyodide.globals.get('repr')(value).toString();
            }
        } else if (status === 'syntax-error') {
            send({ kind: 'stderr', text: String(future.formatted_error || '') });
        }
    } catch (error) {
        // A Python exception arrives here with its real traceback attached.
        send({
            kind: 'stderr',
            text: (error && error.message ? error.message : String(error)) + '\n',
        });
        status = 'complete';
    }
    if (!quiet) send({ kind: 'result', repr, status });
}

self.onmessage = (event) => {
    const data = event.data || {};
    if (data.kind === 'init') {
        void init(data.index_url, data.greeting, data.mirror);
    } else if (data.kind === 'exec') {
        void run_source(data.source, false);
    }
};
`;
