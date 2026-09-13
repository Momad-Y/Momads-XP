import { describe, expect, it, vi } from 'vitest';
import {
    start_doom,
    type DosCommandInterface,
    type DosHost,
    type FrameSink,
} from './dosbox_adapter';

/**
 * A fake screen. The adapter takes a sink rather than an HTMLCanvasElement
 * precisely so this file needs no DOM: vitest runs in node here, and adding
 * jsdom for one test file would be a devDependency and lockfile churn for
 * nothing. The canvas-backed sink lives in the component and is E2E-covered.
 */
function fake_sink(): FrameSink & { frames: number; w: number; h: number } {
    return {
        frames: 0,
        w: 0,
        h: 0,
        resize(w, h) {
            this.w = w;
            this.h = h;
        },
        paint() {
            this.frames += 1;
        },
    };
}

function fake_ci(): DosCommandInterface & {
    fire_frame: (w: number, h: number) => void;
    fire_sound: (samples: Float32Array) => void;
} {
    let frame_cb:
        ((rgb: Uint8Array | null, rgba: Uint8Array | null) => void) | undefined;
    let sound_cb: ((samples: Float32Array) => void) | undefined;
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
            onFrameSize: () => undefined,
        }),
        fire_frame: (w, h) => frame_cb?.(null, new Uint8Array(w * h * 4)),
        fire_sound: (s) => sound_cb?.(s),
    };
}

const host_for = (ci: DosCommandInterface): DosHost => ({
    load: () => Promise.resolve({ dosboxWorker: () => Promise.resolve(ci) }),
    bundle: () => Promise.resolve(new Uint8Array([0x50, 0x4b])),
});

describe('doom dosbox adapter', () => {
    it('paints frames into the sink it was given, sized to the frame', async () => {
        const ci = fake_ci();
        const sink = fake_sink();
        await start_doom(host_for(ci), sink, () => undefined);
        ci.fire_frame(320, 200);
        expect(sink.frames).toBe(1);
        expect(sink.w).toBe(320);
        expect(sink.h).toBe(200);
    });

    it('forwards pause, resume and mute to the emulator', async () => {
        // A minimized DOOM must stop burning a core; these are the four lines
        // that make that possible.
        const ci = fake_ci();
        const s = await start_doom(host_for(ci), fake_sink(), () => undefined);
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
        const s = await start_doom(host_for(ci), fake_sink(), () => undefined);
        s.key('ArrowUp', true);
        expect(ci.sendKeyEvent).toHaveBeenCalledWith(328, true);
        s.key('F13', true); // unmapped
        expect(ci.sendKeyEvent).toHaveBeenCalledTimes(1);
    });

    it('routes sound samples to the sink it was given', async () => {
        const ci = fake_ci();
        const sink = vi.fn();
        await start_doom(host_for(ci), fake_sink(), sink);
        const samples = new Float32Array([0.1, 0.2]);
        ci.fire_sound(samples);
        expect(sink).toHaveBeenCalledWith(samples);
    });

    it('exits the emulator exactly once on dispose', async () => {
        // Opening and closing DOOM repeatedly must not leak a DOSBox worker
        // and a WASM heap per open.
        const ci = fake_ci();
        const s = await start_doom(host_for(ci), fake_sink(), () => undefined);
        await s.dispose();
        await s.dispose();
        expect(ci.exit).toHaveBeenCalledTimes(1);
    });

    it('ignores frames, sound and keys that arrive after dispose', async () => {
        // The emulator can emit one more frame while `exit()` is in flight;
        // painting it would touch a canvas the component has already dropped.
        const ci = fake_ci();
        const screen = fake_sink();
        const sink = vi.fn();
        const s = await start_doom(host_for(ci), screen, sink);
        await s.dispose();

        ci.fire_frame(320, 200);
        expect(screen.frames).toBe(0);

        ci.fire_sound(new Float32Array([1]));
        expect(sink).not.toHaveBeenCalled();

        s.key('ArrowUp', true);
        expect(ci.sendKeyEvent).not.toHaveBeenCalled();
    });

    it('does not pause or resume after dispose', async () => {
        const ci = fake_ci();
        const s = await start_doom(host_for(ci), fake_sink(), () => undefined);
        await s.dispose();
        s.pause();
        s.resume();
        expect(ci.pause).not.toHaveBeenCalled();
        expect(ci.resume).not.toHaveBeenCalled();
    });
});
