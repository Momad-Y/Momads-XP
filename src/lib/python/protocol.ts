/**
 * The message protocol between the app and the isolated Python runtime.
 *
 * WHY IT IS TYPED AND TESTED: the runtime lives behind TWO postMessage hops
 * (parent -> sandboxed iframe -> blob worker), and both boundaries erase types.
 * Untyped message shapes are where this class of bug hides, so every message is
 * declared here and validated on arrival rather than trusted.
 *
 * ISOLATION (spec D-B0, the fix for gate 2's two CRITICALs): the runtime runs
 * in an `<iframe sandbox="allow-scripts">` — no `allow-same-origin` — so it has
 * an OPAQUE origin. Measured in real Chromium:
 *
 *   indexedDB.open()      -> SecurityError ("denied in this context")
 *   fetch() Origin header -> "null"
 *   new Worker('/w.js')   -> SecurityError ("cannot be accessed from origin null")
 *   new Worker(blob:...)  -> works
 *
 * That removes the whole prize: user-typed Python cannot read the VFS, cannot
 * present `Sec-Fetch-Site: same-origin` to /api/browse, and cannot pass
 * /api/email's origin check.
 *
 * The sandbox alone gives ZERO thread isolation, though — a 3-second busy loop
 * in the frame let the parent tick 21 times against ~320 expected. So the
 * runtime additionally lives in a worker created from a `blob:` URL, which
 * inherits the frame's opaque origin and therefore its powerlessness.
 */

import type { MirrorEntry } from './mirror';
import { LIMITS } from './save_limits';
import type { SaveRequest } from './save_limits';

/** Messages the host page (and its worker) send OUT to the app. */
export type FromRuntime =
    | { kind: 'loading'; detail: string }
    | { kind: 'ready'; banner: string }
    | { kind: 'stdout'; text: string }
    | { kind: 'stderr'; text: string }
    | { kind: 'result'; repr: string | null; status: ExecStatus }
    | { kind: 'error'; message: string }
    /**
     * The runtime asking to persist files.
     *
     * Carries a NAME and TEXT and nothing else — no path, no parent, no item
     * id. The host owns the destination, so traversal is inexpressible rather
     * than filtered. Validated field-by-field below, like everything else that
     * crosses this boundary, because the sender is a stranger's Python.
     */
    | { kind: 'save'; files: SaveRequest[] };

/** Messages the app sends IN to the runtime. */
export type ToRuntime =
    | {
          kind: 'init';
          index_url: string;
          greeting: string;
          /**
           * The read-only `/c` tree, shipped WITH init rather than as a later
           * message.
           *
           * The worker must build, chmod and chdir into `/c` BEFORE it sends
           * `ready`, or the first prompt appears over a directory that does
           * not exist yet. A separate message cannot arrive before `ready` —
           * the host only learns the runtime exists by receiving it.
           */
          mirror: MirrorEntry[];
      }
    | { kind: 'exec'; source: string };

/**
 * What `PyodideConsole.push()` reported for the line.
 *
 * `incomplete` is what drives the `...` continuation prompt. It comes from
 * CPython's own `codeop`, so `def f():` behaves exactly as it does in a real
 * REPL — hand-rolled brace counting does not.
 */
export type ExecStatus = 'complete' | 'incomplete' | 'syntax-error';

const FROM_KINDS = [
    'loading',
    'ready',
    'stdout',
    'stderr',
    'result',
    'error',
    'save',
] as const;

/**
 * `Array.isArray` narrows `unknown` to `any[]`, and `no-unsafe-assignment` is
 * an error over `src/`. This narrows to `unknown[]` instead, so every element
 * still has to be checked.
 */
function is_array(value: unknown): value is readonly unknown[] {
    return Array.isArray(value);
}

function is_record(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function str(value: unknown): string | null {
    return typeof value === 'string' ? value : null;
}

/**
 * Validate a message that arrived from the sandbox.
 *
 * Returns null for anything unrecognised rather than throwing: the parent
 * listens on `window`, so it also receives messages from every other frame on
 * the page, and one malformed payload must not take down the REPL.
 */
export function parse_from_runtime(data: unknown): FromRuntime | null {
    if (!is_record(data)) return null;
    const kind = str(data.kind);
    if (kind == null || !(FROM_KINDS as readonly string[]).includes(kind)) {
        return null;
    }

    switch (kind) {
        case 'loading': {
            const detail = str(data.detail);
            return detail == null ? null : { kind: 'loading', detail };
        }
        case 'ready': {
            const banner = str(data.banner);
            return banner == null ? null : { kind: 'ready', banner };
        }
        case 'stdout':
        case 'stderr': {
            const text = str(data.text);
            return text == null ? null : { kind, text };
        }
        case 'result': {
            const status = str(data.status);
            if (
                status !== 'complete' &&
                status !== 'incomplete' &&
                status !== 'syntax-error'
            ) {
                return null;
            }
            const repr = data.repr;
            if (repr !== null && typeof repr !== 'string') return null;
            return { kind: 'result', repr, status };
        }
        case 'error': {
            const message = str(data.message);
            return message == null ? null : { kind: 'error', message };
        }
        case 'save': {
            const files = data.files;
            if (!is_array(files)) return null;
            // Length is checked HERE rather than by dropping the message
            // later: a statement that writes 26 files should be told so, not
            // silently lose all 26.
            if (files.length > LIMITS.max_files_per_message) return null;
            const parsed: SaveRequest[] = [];
            for (const entry of files) {
                if (!is_record(entry)) return null;
                const name = str(entry.name);
                const text = str(entry.text);
                if (name == null || text == null) return null;
                parsed.push({ name, text });
            }
            return { kind: 'save', files: parsed };
        }
        default:
            return null;
    }
}

/**
 * Is this `MessageEvent` really from OUR sandbox frame?
 *
 * The opaque origin forces `postMessage(msg, '*')` — there is no origin to
 * target — so the ONLY trustworthy check is identity of the source window,
 * plus `origin === 'null'` to confirm it is the sandboxed document and not
 * some same-origin frame impersonating it.
 */
export function is_trusted_source(
    // Typed structurally rather than as MessageEvent/Window: this function does
    // nothing but compare IDENTITY and one string, so the DOM types would only
    // force callers (and tests) into casts that `no-unsafe-type-assertion`
    // rejects.
    event: { source: unknown; origin: string },
    frame: unknown,
): boolean {
    if (frame == null) return false;
    if (event.source !== frame) return false;
    // A sandboxed document without allow-same-origin serialises its origin as
    // the string "null".
    return event.origin === 'null';
}
