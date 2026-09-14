import { key_code_for } from './keymap';

export const JSDOS_PATH_PREFIX = '/js/js-dos/';
export const DOOM_BUNDLE_URL = '/games/doom/doom.jsdos';

/**
 * The slice of js-dos's `CommandInterface` this adapter uses.
 *
 * Declared here rather than imported: `emulators.js` is a vendored browserify
 * bundle under `static/`, so it ships no types, and narrowing to what we
 * actually call keeps the fake in the tests honest.
 */
export interface DosCommandInterface {
    width: () => number;
    height: () => number;
    pause: () => void;
    resume: () => void;
    mute: () => void;
    unmute: () => void;
    exit: () => Promise<void>;
    sendKeyEvent: (code: number, pressed: boolean) => void;
    events: () => {
        onFrame: (
            consumer: (rgb: Uint8Array | null, rgba: Uint8Array | null) => void,
        ) => void;
        onSoundPush: (consumer: (samples: Float32Array) => void) => void;
        onFrameSize: (
            consumer: (width: number, height: number) => void,
        ) => void;
    };
}

/**
 * Everything this adapter needs from the outside world. Both I/O paths live
 * here — loading the emulator and fetching the game — so `start_doom` itself
 * is pure lifecycle and testable with no network and no DOM.
 */
/** The options js-dos accepts; we use exactly one. */
export interface DosBackendOptions {
    canvas?: OffscreenCanvas;
}

export interface DosHost {
    load: () => Promise<{
        dosboxWorker: (
            init: unknown,
            options?: DosBackendOptions,
        ) => Promise<DosCommandInterface>;
    }>;
    bundle: () => Promise<Uint8Array>;
}

export interface DoomSession {
    pause: () => void;
    resume: () => void;
    set_muted: (muted: boolean) => void;
    /** Takes a `KeyboardEvent.code`; unmapped keys are dropped. */
    key: (code: string, pressed: boolean) => void;
    dispose: () => Promise<void>;
}

/**
 * The real host: injects the vendored `emulators.js` once and hands back its
 * global.
 *
 * `emulators.js` is a browserify UMD bundle that assigns `window.emulators` —
 * it is not an ES module, which is why it lives in `static/` and is loaded by
 * a script tag rather than imported. `pathPrefix` MUST be set before the first
 * `dosboxWorker()` call: it is read at call time to build the `wdosbox.js`
 * URL, so setting it afterwards is too late and the emulator would try to load
 * from the page's own directory.
 */
export const browser_host: DosHost = {
    load: async () => {
        const loaded = await load_emulators();
        loaded.pathPrefix = JSDOS_PATH_PREFIX;
        return loaded;
    },
    bundle: async () => {
        const response = await fetch(DOOM_BUNDLE_URL);
        if (!response.ok) {
            throw new Error(
                `DOOM bundle failed to load: ${String(response.status)}`,
            );
        }
        return new Uint8Array(await response.arrayBuffer());
    },
};

let pending_load: Promise<JsDosEmulators> | null = null;

function load_emulators(): Promise<JsDosEmulators> {
    pending_load ??= new Promise<JsDosEmulators>((resolve, reject) => {
        const existing = read_emulators();
        if (existing != null) {
            resolve(existing);
            return;
        }
        const script = document.createElement('script');
        script.src = `${JSDOS_PATH_PREFIX}emulators.js`;
        script.onload = () => {
            const loaded = read_emulators();
            if (loaded == null) {
                reject(new Error('emulators.js loaded but defined no global'));
                return;
            }
            resolve(loaded);
        };
        script.onerror = () => {
            // Let a later attempt retry rather than caching the failure.
            pending_load = null;
            reject(new Error('emulators.js failed to load'));
        };
        document.head.appendChild(script);
    });
    return pending_load;
}

/**
 * The global is declared in `src/app.d.ts`, following the same pattern as
 * jQuery and loadjs — which is what removes the need for a type assertion
 * here. `typeof` rather than a direct read: referencing an undeclared global
 * by name throws a ReferenceError before the script has loaded.
 */
function read_emulators(): JsDosEmulators | null {
    return typeof emulators === 'undefined' ? null : emulators;
}

/**
 * RENDERING IS HANDED TO THE WORKER, not forwarded frame by frame.
 *
 * js-dos's worker transport delivers video through an internal `onFrameLines`
 * assembler and — measured, not assumed — never invokes the `onFrame`
 * consumer at all: `onFrameSize` fires with 640x400 then 320x200 while
 * `onFrame` stays silent forever. Its assembler also threw
 * "offset is out of bounds" on every frame when DOSBox's aspect correction
 * changed the render height mid-stream.
 *
 * Passing an OffscreenCanvas sidesteps that whole path: the worker paints
 * directly, which is both the fix and the faster option, since no pixel data
 * crosses postMessage.
 *
 * `screen` is nullable so the lifecycle tests can run headless — they assert
 * that whatever they pass is handed to js-dos, and everything else here is
 * independent of rendering.
 */
export async function start_doom(
    host: DosHost,
    screen: OffscreenCanvas | null,
    on_sound: (samples: Float32Array) => void,
): Promise<DoomSession> {
    const emulators = await host.load();
    const bundle = await host.bundle();
    const ci = await emulators.dosboxWorker(
        bundle,
        screen == null ? {} : { canvas: screen },
    );

    /*
     * EVERY callback below is gated on this flag.
     *
     * The emulator can emit one more frame, or a sound buffer, while `exit()`
     * is still in flight — painting it would touch a sink the component has
     * already dropped. Guarding each entry point is cheaper than trying to
     * unsubscribe from an interface that offers no unsubscribe.
     */
    let disposed = false;

    const events = ci.events();
    events.onSoundPush((samples) => {
        if (disposed) return;
        on_sound(samples);
    });

    return {
        pause: () => {
            if (disposed) return;
            ci.pause();
        },
        resume: () => {
            if (disposed) return;
            ci.resume();
        },
        set_muted: (muted) => {
            if (disposed) return;
            if (muted) ci.mute();
            else ci.unmute();
        },
        key: (code, pressed) => {
            if (disposed) return;
            const key_code = key_code_for(code);
            if (key_code === 0) return;
            ci.sendKeyEvent(key_code, pressed);
        },
        dispose: async () => {
            if (disposed) return;
            disposed = true;
            await ci.exit();
        },
    };
}
