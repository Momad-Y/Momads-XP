/**
 * Parent-side driver for the isolated Python runtime.
 *
 * Owns the iframe lifecycle and the message validation; knows nothing about
 * xterm. The REPL component supplies callbacks.
 */
import {
    is_trusted_source,
    parse_from_runtime,
    type FromRuntime,
} from './protocol';
import { PYTHON_WORKER_SOURCE } from './worker_source';
import { PYODIDE_CDN_BASE } from './version';

/** Where the isolation host lives. Served from static/, never bundled. */
export const SANDBOX_URL = '/html/python-sandbox.html';

/**
 * `allow-scripts` ONLY. Adding `allow-same-origin` would hand user-typed
 * Python our origin — the VFS in IndexedDB, /api/browse's
 * `Sec-Fetch-Site: same-origin`, and /api/email's Origin check. That is gate
 * 2's CRITICAL 1, and this attribute is the fix.
 */
export const SANDBOX_ATTR = 'allow-scripts';

/**
 * The slice of an iframe this client actually uses.
 *
 * Declared structurally rather than as `HTMLIFrameElement` for the same reason
 * `is_trusted_source` is: the client only ever posts a message, listens for
 * `load`, and reloads. Naming that surface makes the module unit-testable in
 * Node — which matters because it is the parent half of a security boundary,
 * and `.svelte` coverage exemptions do not apply to it.
 */
export interface SandboxFrame {
    /** Writable so a failed cross-origin navigation can fall back to it. */
    src?: string;
    contentWindow:
        | {
              postMessage: (message: unknown, target_origin: string) => void;
              /**
               * `href` only. `reload` is NOT cross-origin-accessible on an
               * opaque-origin frame — reading it throws SecurityError.
               */
              location: { href: string };
          }
        | null
        | undefined;
    addEventListener: (type: 'load', handler: () => void) => void;
    removeEventListener: (type: 'load', handler: () => void) => void;
}

/** The window-level message bus. Injectable so tests need no DOM. */
export interface MessageBus {
    addEventListener: (
        type: 'message',
        handler: (event: {
            source: unknown;
            origin: string;
            data: unknown;
        }) => void,
    ) => void;
    removeEventListener: (
        type: 'message',
        handler: (event: {
            source: unknown;
            origin: string;
            data: unknown;
        }) => void,
    ) => void;
}

export interface PythonClientOptions {
    on_message: (message: FromRuntime) => void;
    /** §3.2's pre-loaded greeting, run before the banner is announced. */
    greeting?: string;
    /** Defaults to the real window; overridden in tests. */
    bus?: MessageBus;
}

export interface PythonClient {
    /** Send a source line for evaluation. */
    exec: (source: string) => void;
    /** Ctrl+C — terminates and respawns. Destroys the session's variables. */
    restart: () => void;
    dispose: () => void;
}

/**
 * Attach to an already-mounted iframe.
 *
 * The caller owns the element so Svelte controls the DOM; this only wires
 * messages to it.
 */
export function create_python_client(
    frame: SandboxFrame,
    options: PythonClientOptions,
): PythonClient {
    // `globalThis` already satisfies MessageBus structurally, so no cast is
    // needed — and `no-unsafe-type-assertion` is an error over src/.
    const bus: MessageBus = options.bus ?? globalThis;
    let disposed = false;
    let initialised = false;

    const post = (message: unknown) => {
        // '*' is forced: the sandbox has an opaque origin, so there is no
        // origin to target. Trust runs the other way — we validate what comes
        // back by source identity.
        frame.contentWindow?.postMessage(message, '*');
    };

    const send_init = () => {
        if (initialised) return;
        initialised = true;
        post({
            kind: 'init',
            index_url: PYODIDE_CDN_BASE,
            greeting: options.greeting ?? '',
            // The driver is authored in src/ and handed over here, so the
            // static host page stays free of logic.
            worker_source: PYTHON_WORKER_SOURCE,
        });
    };

    const on_window_message = (event: {
        source: unknown;
        origin: string;
        data: unknown;
    }) => {
        if (disposed) return;
        // The parent listens on `window`, so it also receives messages from
        // every other frame on the page — including the IE proxy frame and
        // jspaint. Identity of the source window is the only real check
        // available once the origin is opaque.
        if (!is_trusted_source(event, frame.contentWindow)) return;

        const message = parse_from_runtime(event.data);
        if (message == null) return;

        // The host announces itself before any runtime exists; that handshake
        // is what tells us the frame is alive and ready for `init`.
        if (message.kind === 'loading' && message.detail === 'Sandbox ready') {
            send_init();
            return;
        }
        options.on_message(message);
    };

    bus.addEventListener('message', on_window_message);

    // BOTH triggers, because either one alone is a race.
    //
    // The host announces "Sandbox ready" as soon as its script parses, which
    // can happen BEFORE this client attaches its listener — the iframe starts
    // loading when the component renders, while the client is created after
    // xterm mounts. Sending on `load` covers that: the host's own listener is
    // attached synchronously during parse, so it is always in place by the
    // time `load` fires. `send_init` is idempotent, so whichever arrives first
    // wins and the other is a no-op.
    frame.addEventListener('load', send_init);
    // NOTE: there is deliberately no `readyState` check here. For a sandboxed
    // opaque-origin document `frame.contentDocument` is always null, so it
    // could never fire — the host page re-announces instead, which is what
    // actually makes the handshake ordering-immune.

    return {
        exec(source: string) {
            if (disposed) return;
            post({ kind: 'exec', source });
        },
        restart() {
            if (disposed) return;
            post({ kind: 'terminate' });
            initialised = false;
            // `location.href = …`, NOT `location.reload()`.
            //
            // The frame is opaque-origin, and `reload` is not on Location's
            // cross-origin property allowlist — merely READING it throws
            // SecurityError. Measured in real Chromium:
            //   loc.reload  -> SecurityError: Blocked a frame ... from
            //                  accessing a cross-origin frame
            //   loc.href =  -> OK (the setter IS cross-origin-permitted)
            // The throw escaped uncaught through xterm's onData and left the
            // REPL permanently dead: "Restarting Python…" and then no prompt,
            // ever. The unit test could not see it because it injected a
            // `location: { reload: vi.fn() }` stub.
            try {
                if (frame.contentWindow != null) {
                    frame.contentWindow.location.href = SANDBOX_URL;
                }
            } catch {
                // Last resort: re-assigning src also reloads the frame, and
                // the host re-announces, so the handshake recovers either way.
                frame.src = SANDBOX_URL;
            }
        },
        dispose() {
            disposed = true;
            bus.removeEventListener('message', on_window_message);
            frame.removeEventListener('load', send_init);
        },
    };
}
