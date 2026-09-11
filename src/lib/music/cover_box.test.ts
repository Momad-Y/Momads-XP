import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
    centred_square,
    content_box,
    cover_crop,
    decode_png,
} from './cover_box';

const COVERS = 'static/assets/covers';
const files = readdirSync(COVERS).filter((f) => f.endsWith('.png'));

describe('decode_png', () => {
    it('reads every committed cover', () => {
        expect(files.length).toBeGreaterThan(0);
        for (const f of files) {
            const bmp = decode_png(
                new Uint8Array(readFileSync(join(COVERS, f))),
            );
            expect(bmp, f).not.toBeNull();
            expect(bmp?.width).toBeGreaterThan(0);
            expect(bmp?.pixels.length).toBe(
                (bmp?.width ?? 0) * (bmp?.height ?? 0) * (bmp?.channels ?? 0),
            );
        }
    });

    it('refuses something that is not a PNG rather than throwing', () => {
        // an undecodable cover must render uncropped, never fail the build
        expect(decode_png(new Uint8Array([1, 2, 3]))).toBeNull();
        expect(decode_png(new Uint8Array(0))).toBeNull();
        expect(
            decode_png(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])),
        ).toBeNull();
    });
});

describe('content_box', () => {
    const solid = (
        w: number,
        h: number,
        paint: (x: number, y: number) => number,
    ) => ({
        width: w,
        height: h,
        channels: 3,
        pixels: Uint8Array.from(
            Array.from({ length: w * h * 3 }, (_, i) => {
                const px = Math.floor(i / 3);
                return paint(px % w, Math.floor(px / w));
            }),
        ),
    });

    it('trims a letterbox whatever colour the bars are', () => {
        // white bars, as YouTube art actually uses — a black-only check missed
        // exactly this and reported the covers as needing no crop
        const white = solid(20, 20, (_x, y) => (y < 6 || y >= 14 ? 255 : 30));
        expect(content_box(white)).toEqual({ x: 0, y: 6, w: 20, h: 8 });
        const black = solid(20, 20, (_x, y) => (y < 6 || y >= 14 ? 0 : 200));
        expect(content_box(black)).toEqual({ x: 0, y: 6, w: 20, h: 8 });
    });

    it('leaves an unpadded image whole', () => {
        const noisy = solid(20, 20, (x, y) => (x * 13 + y * 7) % 256);
        expect(content_box(noisy)).toEqual({ x: 0, y: 0, w: 20, h: 20 });
    });
});

describe('centred_square', () => {
    it('takes the middle square of a wide box', () => {
        expect(centred_square({ x: 0, y: 90, w: 500, h: 320 })).toEqual({
            x: 90,
            y: 90,
            w: 320,
            h: 320,
        });
    });

    it('is a no-op on a box that is already square', () => {
        const box = { x: 4, y: 4, w: 10, h: 10 };
        expect(centred_square(box)).toEqual(box);
    });
});

describe('cover_crop over the real library', () => {
    it('produces a square box inside the image for every cover', () => {
        for (const f of files) {
            const crop = cover_crop(
                new Uint8Array(readFileSync(join(COVERS, f))),
            );
            if (crop == null) continue; // unpadded art needs no crop
            expect(crop.box.w, f).toBe(crop.box.h);
            expect(crop.box.x + crop.box.w, f).toBeLessThanOrEqual(
                crop.image.w,
            );
            expect(crop.box.y + crop.box.h, f).toBeLessThanOrEqual(
                crop.image.h,
            );
            // a crop that keeps almost nothing means the detector ate the art
            expect(crop.box.w / crop.image.w, f).toBeGreaterThan(0.25);
        }
    });
});
