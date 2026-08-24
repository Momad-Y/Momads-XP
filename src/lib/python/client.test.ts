import { describe, it, expect, vi } from 'vitest';
import { create_python_client, SANDBOX_URL } from './client';
import type { MessageBus, SandboxFrame } from './client';
import type { FromRuntime } from './protocol';

type MessageHandler = (event: {
    source: unknown;
    origin: string;
    data: unknown;
}) => void;

function harness(greeting = '') {
    const posted: unknown[] = [];
    const contentWindow = {
        postMessage: (message: unknown) => {
            posted.push(message);
        },
        location: { reload: vi.fn() },
    };
    let load_handler: (() => void) | null = null;
    const frame: SandboxFrame = {
        contentWindow,
        addEventListener: (_type, handler) => {
            load_handler = handler;
        },
        removeEventListener: () => {
            load_handler = null;
        },
    };

    let message_handler: MessageHandler | null = null;
    const bus: MessageBus = {
        addEventListener: (_type, handler) => {
            message_handler = handler;
        },
        removeEventListener: () => {
            message_handler = null;
        },
    };

    const received: FromRuntime[] = [];
    const client = create_python_client(frame, {
        on_message: (m) => received.push(m),
        greeting,
        bus,
    });

    return {
        client,
        posted,
        received,
        contentWindow,
        fire_load: () => load_handler?.(),
        deliver: (
            data: unknown,
            source: unknown = contentWindow,
            origin = 'null',
        ) => {
            message_handler?.({ source, origin, data });
        },
    };
}

/** Read one field from a posted message without an unsafe cast. */
function field(message: unknown, key: string): unknown {
    if (typeof message !== 'object' || message === null) return undefined;
    return Object.getOwnPropertyDescriptor(message, key)?.value;
}

describe('handshake', () => {
    it('sends init when the frame fires load', () => {
        const h = harness();
        expect(h.posted).toHaveLength(0);
        h.fire_load();
        expect(h.posted).toHaveLength(1);
    });

    it('sends init when the host announces itself', () => {
        // Both triggers exist because either alone is a race: the frame starts
        // loading when the component renders, but this client is created only
        // after xterm mounts.
        const h = harness();
        h.deliver({ kind: 'loading', detail: 'Sandbox ready' });
        expect(h.posted).toHaveLength(1);
    });

    it('sends init exactly ONCE however many times it is triggered', () => {
        // The host re-announces on an interval until it is heard, so this is
        // hit repeatedly in practice. A second init would spawn a second
        // Pyodide runtime.
        const h = harness();
        h.fire_load();
        h.deliver({ kind: 'loading', detail: 'Sandbox ready' });
        h.deliver({ kind: 'loading', detail: 'Sandbox ready' });
        h.fire_load();
        expect(h.posted).toHaveLength(1);
    });

    it('does not surface the handshake as user-visible progress', () => {
        // "Sandbox ready" is plumbing. Printing it would read as a progress
        // step the visitor cannot act on.
        const h = harness();
        h.deliver({ kind: 'loading', detail: 'Sandbox ready' });
        expect(h.received).toHaveLength(0);
    });

    it('carries the greeting and the worker source in init', () => {
        const h = harness('print("hi")');
        h.fire_load();
        const init = h.posted[0];
        expect(field(init, 'kind')).toBe('init');
        expect(field(init, 'greeting')).toBe('print("hi")');
        expect(typeof field(init, 'worker_source')).toBe('string');
        expect(String(field(init, 'index_url'))).toContain('pyodide');
    });
});

describe('message trust', () => {
    it('forwards a valid message from our frame on an opaque origin', () => {
        const h = harness();
        h.deliver({ kind: 'stdout', text: 'hello' });
        expect(h.received).toEqual([{ kind: 'stdout', text: 'hello' }]);
    });

    it('ignores a message from a DIFFERENT window', () => {
        // The parent listens on `window`, so it also receives traffic from the
        // IE proxy frame and jspaint. Identity of the source is the only real
        // check once the origin is opaque.
        const h = harness();
        h.deliver({ kind: 'stdout', text: 'spoofed' }, { other: true });
        expect(h.received).toHaveLength(0);
    });

    it('ignores a message whose origin is not opaque', () => {
        // A real origin would mean the sandbox lost its isolation.
        const h = harness();
        h.deliver(
            { kind: 'stdout', text: 'x' },
            undefined,
            'https://momad-xp.netlify.app',
        );
        expect(h.received).toHaveLength(0);
    });

    it('ignores malformed payloads without throwing', () => {
        const h = harness();
        h.deliver('not-an-object');
        h.deliver({ kind: 'unknown' });
        h.deliver(null);
        expect(h.received).toHaveLength(0);
    });
});

describe('exec and restart', () => {
    it('posts source for evaluation', () => {
        const h = harness();
        h.fire_load();
        h.client.exec('2 + 2');
        expect(h.posted).toContainEqual({ kind: 'exec', source: '2 + 2' });
    });

    it('restart terminates AND reloads the frame', () => {
        // Terminating alone leaves the host page wedged; reloading gives a
        // clean host as well as a clean worker.
        const h = harness();
        h.fire_load();
        h.client.restart();
        expect(h.posted).toContainEqual({ kind: 'terminate' });
        expect(h.contentWindow.location.reload).toHaveBeenCalled();
    });

    it('re-arms the handshake after a restart', () => {
        // Without this the reloaded frame would never receive init and the
        // REPL would hang at "Loading" forever.
        const h = harness();
        h.fire_load();
        h.client.restart();
        h.deliver({ kind: 'loading', detail: 'Sandbox ready' });
        const inits = h.posted.filter((m) => field(m, 'kind') === 'init');
        expect(inits).toHaveLength(2);
    });
});

describe('dispose', () => {
    it('stops forwarding messages and stops posting', () => {
        const h = harness();
        h.fire_load();
        h.client.dispose();
        h.deliver({ kind: 'stdout', text: 'late' });
        expect(h.received).toHaveLength(0);

        const before = h.posted.length;
        h.client.exec('x');
        h.client.restart();
        expect(h.posted).toHaveLength(before);
    });
});

describe('SANDBOX_URL', () => {
    it('points at the static host page, never a bundled route', () => {
        // It must be served from static/ so Vite never processes it — the host
        // deliberately carries no logic of its own.
        expect(SANDBOX_URL).toBe('/html/python-sandbox.html');
    });
});
