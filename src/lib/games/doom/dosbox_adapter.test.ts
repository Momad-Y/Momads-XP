import { describe, expect, it, vi } from 'vitest';
import {
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

    it('forwards key events as scancodes', async () => {
        const ci = fake_ci();
        const s = await start_doom(host_for(ci), null, () => undefined);
        s.key('ArrowUp', true);
        expect(ci.sendKeyEvent).toHaveBeenCalledWith(328, true);
        s.key('F13', true); // unmapped
        expect(ci.sendKeyEvent).toHaveBeenCalledTimes(1);
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
