import { describe, expect, it, vi } from 'vitest';
import {
    browser_host,
    DOOM_BUNDLE_URL,
    JSDOS_PATH_PREFIX,
    start_doom,
    type DosCommandInterface,
    type DosHost,
} from './dosbox_adapter';

function fake_ci(): DosCommandInterface & {
    fire_size: (w: number, h: number) => void;
    fire_frame: (w: number, h: number) => void;
    fire_bad_frame: (bytes: number) => void;
    fire_sound: (samples: Float32Array) => void;
} {
    let frame_cb:
        ((rgb: Uint8Array | null, rgba: Uint8Array | null) => void) | undefined;
    let sound_cb: ((samples: Float32Array) => void) | undefined;
    let size_cb: ((w: number, h: number) => void) | undefined;
    return {
        width: () => 320,
        height: () => 200,
        pause: vi.fn(),
        resume: vi.fn(),
        mute: vi.fn(),
        unmute: vi.fn(),
        exit: vi.fn(() => Promise.resolve()),
        sendKeyEvent: vi.fn(),
        events: () => ({
            onFrame: (c) => {
                frame_cb = c;
            },
            onSoundPush: (c) => {
                sound_cb = c;
            },
            onFrameSize: (c) => {
                size_cb = c;
            },
        }),
        fire_size: (w: number, h: number) => size_cb?.(w, h),
        fire_frame: (w, h) => frame_cb?.(null, new Uint8Array(w * h * 4)),
        /** A buffer that does NOT match the declared size. */
        fire_bad_frame: (bytes: number) =>
            frame_cb?.(null, new Uint8Array(bytes)),
        fire_sound: (s) => sound_cb?.(s),
    };
}

function host_for(ci: DosCommandInterface): DosHost & {
    options: { canvas?: OffscreenCanvas } | undefined;
} {
    const host = {
        options: undefined as { canvas?: OffscreenCanvas } | undefined,
        load: () =>
            Promise.resolve({
                dosboxWorker: (
                    _init: unknown,
                    options?: { canvas?: OffscreenCanvas },
                ) => {
                    host.options = options;
                    return Promise.resolve(ci);
                },
            }),
        bundle: () => Promise.resolve(new Uint8Array([0x50, 0x4b])),
    };
    return host;
}

describe('doom dosbox adapter', () => {
    it('hands the OffscreenCanvas to js-dos so the worker renders directly', async () => {
        /*
         * THE critical wiring. js-dos's worker transport never fires the
         * `onFrame` consumer — measured: `onFrameSize` reports 640x400 then
         * 320x200 while `onFrame` stays silent forever — so forwarding frames
         * ourselves renders nothing at all. Handing over a canvas is what
         * actually puts DOOM on screen.
         */
        const ci = fake_ci();
        const host = host_for(ci);
        // Node has no OffscreenCanvas and the adapter never touches this
        // value — it exists only to be handed to js-dos — so a stand-in is
        // the honest thing to pass. Disabled rather than widened, matching
        // how three other tests in this repo handle the same rule.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- opaque handle, only ever passed through
        const canvas = { stand_in: true } as unknown as OffscreenCanvas;
        await start_doom(host, canvas, () => undefined);
        expect(host.options?.canvas).toBe(canvas);
    });

    it('passes no canvas when there is none, rather than undefined', async () => {
        const ci = fake_ci();
        const host = host_for(ci);
        await start_doom(host, null, () => undefined);
        expect(host.options).toEqual({});
    });

    it('forwards pause, resume and mute to the emulator', async () => {
        // A minimized DOOM must stop burning a core; these are the four lines
        // that make that possible.
        const ci = fake_ci();
        const s = await start_doom(host_for(ci), null, () => undefined);
        s.pause();
        expect(ci.pause).toHaveBeenCalledTimes(1);
        s.resume();
        expect(ci.resume).toHaveBeenCalledTimes(1);
        s.set_muted(true);
        expect(ci.mute).toHaveBeenCalledTimes(1);
        s.set_muted(false);
        expect(ci.unmute).toHaveBeenCalledTimes(1);
    });

    it('forwards key events as js-dos key codes', async () => {
        const ci = fake_ci();
        const s = await start_doom(host_for(ci), null, () => undefined);
        // 265 is GLFW's ArrowUp, which is what js-dos's KBD_KEYS enum uses.
        // The value matters: the adapter shipped set-1 scancodes once, and
        // js-dos dropped every one of them silently.
        s.key('ArrowUp', true);
        expect(ci.sendKeyEvent).toHaveBeenCalledWith(265, true);
        s.key('ArrowUp', false);
        expect(ci.sendKeyEvent).toHaveBeenCalledWith(265, false);
        s.key('F13', true); // unmapped
        expect(ci.sendKeyEvent).toHaveBeenCalledTimes(2);
    });

    it('routes sound samples to the sink it was given', async () => {
        const ci = fake_ci();
        const sink = vi.fn();
        await start_doom(host_for(ci), null, sink);
        const samples = new Float32Array([0.1, 0.2]);
        ci.fire_sound(samples);
        expect(sink).toHaveBeenCalledWith(samples);
    });

    it('exits the emulator exactly once on dispose', async () => {
        // Opening and closing DOOM repeatedly must not leak a DOSBox worker
        // and a WASM heap per open.
        const ci = fake_ci();
        const s = await start_doom(host_for(ci), null, () => undefined);
        await s.dispose();
        await s.dispose();
        expect(ci.exit).toHaveBeenCalledTimes(1);
    });

    it('ignores sound and keys that arrive after dispose', async () => {
        // The emulator can emit one more frame while `exit()` is in flight;
        // painting it would touch a canvas the component has already dropped.
        const ci = fake_ci();
        const sink = vi.fn();
        const s = await start_doom(host_for(ci), null, sink);
        await s.dispose();

        ci.fire_sound(new Float32Array([1]));
        expect(sink).not.toHaveBeenCalled();

        s.key('ArrowUp', true);
        expect(ci.sendKeyEvent).not.toHaveBeenCalled();
    });

    it('does not pause or resume after dispose', async () => {
        const ci = fake_ci();
        const s = await start_doom(host_for(ci), null, () => undefined);
        await s.dispose();
        s.pause();
        s.resume();
        expect(ci.pause).not.toHaveBeenCalled();
        expect(ci.resume).not.toHaveBeenCalled();
    });
});

/**
 * `browser_host` — the two I/O paths, which the lifecycle tests above
 * deliberately avoid by injecting a fake host.
 *
 * They are covered here with stubbed globals rather than left untested: this
 * is where a wrong URL or a missed error branch would ship as "DOOM does
 * nothing" with no failing test anywhere.
 */
describe('browser_host', () => {
    it('fetches the bundle and returns its bytes', async () => {
        const fetch_spy = vi.fn(() =>
            Promise.resolve({
                ok: true,
                status: 200,
                arrayBuffer: () =>
                    Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
            }),
        );
        vi.stubGlobal('fetch', fetch_spy);
        try {
            const bytes = await browser_host.bundle();
            expect(fetch_spy).toHaveBeenCalledWith(DOOM_BUNDLE_URL);
            expect([...bytes]).toEqual([1, 2, 3]);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('throws with the status when the bundle is missing', async () => {
        // A 404 here is the difference between "DOOM is broken" and a silent
        // hang on the loading panel.
        vi.stubGlobal(
            'fetch',
            vi.fn(() => Promise.resolve({ ok: false, status: 404 })),
        );
        try {
            await expect(browser_host.bundle()).rejects.toThrow('404');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    /**
     * A minimal DOM for the script-injection path. `pending_load` is
     * module-level cache, so each of these imports the module fresh —
     * otherwise the first test's resolved promise answers every later one.
     */
    function stub_document(): { fire: (event: 'load' | 'error') => void } {
        // Typed as the two handlers the adapter actually assigns, so firing
        // them is a checked call rather than an unsafe one.
        const script: {
            onload?: () => void;
            onerror?: () => void;
            src?: string;
        } = {};
        vi.stubGlobal('document', {
            createElement: () => script,
            head: { appendChild: () => undefined },
        });
        return {
            fire: (event) => {
                if (event === 'load') script.onload?.();
                else script.onerror?.();
            },
        };
    }

    it('injects the script and resolves once the global appears', async () => {
        vi.resetModules();
        const dom = stub_document();
        try {
            const mod = await import('./dosbox_adapter');
            const pending = mod.browser_host.load();
            // The global only exists after the script has run.
            const fake_global = {
                pathPrefix: '',
                dosboxWorker: () => Promise.resolve(fake_ci()),
            };
            vi.stubGlobal('emulators', fake_global);
            dom.fire('load');
            await expect(pending).resolves.toBe(fake_global);
            expect(fake_global.pathPrefix).toBe(mod.JSDOS_PATH_PREFIX);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('rejects when the script loads but defines no global', async () => {
        // Silent failure otherwise: the promise would never settle and DOOM
        // would sit on "Loading…" forever.
        vi.resetModules();
        const dom = stub_document();
        try {
            const mod = await import('./dosbox_adapter');
            const pending = mod.browser_host.load();
            dom.fire('load');
            await expect(pending).rejects.toThrow('defined no global');
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('rejects when the script fails to load, and allows a retry', async () => {
        vi.resetModules();
        const dom = stub_document();
        try {
            const mod = await import('./dosbox_adapter');
            const first = mod.browser_host.load();
            dom.fire('error');
            await expect(first).rejects.toThrow('failed to load');

            // The failure must NOT be cached — a later attempt gets a fresh
            // script rather than the rejected promise.
            const second = mod.browser_host.load();
            const fake_global = {
                pathPrefix: '',
                dosboxWorker: () => Promise.resolve(fake_ci()),
            };
            vi.stubGlobal('emulators', fake_global);
            dom.fire('load');
            await expect(second).resolves.toBe(fake_global);
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('reuses an already-loaded emulators global without injecting a script', async () => {
        vi.resetModules();
        const fake_global = {
            pathPrefix: '',
            dosboxWorker: () => Promise.resolve(fake_ci()),
        };
        vi.stubGlobal('emulators', fake_global);
        try {
            const mod = await import('./dosbox_adapter');
            const loaded = await mod.browser_host.load();
            expect(loaded).toBe(fake_global);
            // pathPrefix MUST be set before the first dosboxWorker() call —
            // it is read at call time to build the wdosbox.js URL.
            expect(fake_global.pathPrefix).toBe(JSDOS_PATH_PREFIX);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
