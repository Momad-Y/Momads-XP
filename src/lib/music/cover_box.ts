/**
 * Finds the real picture inside a padded cover image.
 *
 * WHY THIS EXISTS: art pulled from YouTube is a 16:9 thumbnail letterboxed into
 * a square — `Shape Of You`'s cover is a 500x500 PNG whose top and bottom 110
 * rows are flat white. Rendered into the player's square slot it reads as a
 * thin strip in a white box. Other covers in the same library are genuine
 * square art with no padding at all, so a single fixed CSS zoom cannot serve
 * both; the padding has to be measured per image.
 *
 * WHY IT ONLY MEASURES, AND NEVER REWRITES THE FILE: cropping would mean
 * re-encoding, and `zlib` output is not stable across versions — this repo's
 * Node is 25 while CI runs 22. `static/assets/covers` is on the freshness gate
 * (`ci.yml`), so a re-encode would make CI red on every run for reasons nobody
 * could see. Measuring is pure arithmetic over decoded pixels and is identical
 * everywhere; the box travels in the manifest and the crop happens in CSS.
 *
 * Only 8-bit truecolour PNG is decoded, which is what every extracted cover is
 * today. Anything else returns `null` and renders uncropped — a slightly padded
 * thumbnail is a much better failure than a build that stops.
 */
import { inflateSync } from 'node:zlib';

export interface Box {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface Bitmap {
    width: number;
    height: number;
    /** Bytes per pixel: 3 for RGB, 4 for RGBA. */
    channels: number;
    pixels: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** How far two samples may differ per channel and still count as one flat band. */
const TOLERANCE = 10;

/** Undo one scanline's PNG filter, in place, against the row above it. */
function unfilter(
    type: number,
    line: Uint8Array,
    prev: Uint8Array,
    channels: number,
): void {
    for (let i = 0; i < line.length; i++) {
        const a = i >= channels ? line[i - channels] : 0;
        const b = prev[i];
        const c = i >= channels ? prev[i - channels] : 0;
        const x = line[i];
        if (
            x === undefined ||
            a === undefined ||
            b === undefined ||
            c === undefined
        ) {
            continue;
        }
        if (type === 1) line[i] = (x + a) & 0xff;
        else if (type === 2) line[i] = (x + b) & 0xff;
        else if (type === 3) line[i] = (x + ((a + b) >> 1)) & 0xff;
        else if (type === 4) {
            const p = a + b - c;
            const pa = Math.abs(p - a);
            const pb = Math.abs(p - b);
            const pc = Math.abs(p - c);
            const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
            line[i] = (x + pred) & 0xff;
        }
    }
}

/** 8-bit RGB/RGBA PNG only. Returns null for anything else, including APNG. */
export function decode_png(bytes: Uint8Array): Bitmap | null {
    if (bytes.length < 8) return null;
    for (const [i, byte] of SIGNATURE.entries()) {
        if (bytes[i] !== byte) return null;
    }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    let pos = 8;
    let width = 0;
    let height = 0;
    let depth = 0;
    let colour = 0;
    const idat: Uint8Array[] = [];
    while (pos + 8 <= bytes.length) {
        const length = view.getUint32(pos);
        const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8));
        const body = bytes.subarray(pos + 8, pos + 8 + length);
        if (type === 'IHDR') {
            width = view.getUint32(pos + 8);
            height = view.getUint32(pos + 12);
            depth = bytes[pos + 16] ?? 0;
            colour = bytes[pos + 17] ?? 0;
            // interlaced PNG needs a different reconstruction pass
            if ((bytes[pos + 20] ?? 0) !== 0) return null;
        } else if (type === 'IDAT') {
            idat.push(body);
        } else if (type === 'IEND') {
            break;
        }
        pos += 12 + length;
    }
    if (depth !== 8 || (colour !== 2 && colour !== 6)) return null;
    if (width === 0 || height === 0) return null;

    const channels = colour === 2 ? 3 : 4;
    const stride = width * channels;
    let raw: Uint8Array;
    try {
        raw = new Uint8Array(inflateSync(Buffer.concat(idat)));
    } catch {
        return null;
    }
    if (raw.length < height * (stride + 1)) return null;

    const pixels = new Uint8Array(height * stride);
    let prev = new Uint8Array(stride);
    for (let y = 0; y < height; y++) {
        const at = y * (stride + 1);
        const line = raw.slice(at + 1, at + 1 + stride);
        unfilter(raw[at] ?? 0, line, prev, channels);
        pixels.set(line, y * stride);
        prev = line;
    }
    return { width, height, channels, pixels };
}

function sample(bmp: Bitmap, x: number, y: number): [number, number, number] {
    const at = y * bmp.width * bmp.channels + x * bmp.channels;
    return [
        bmp.pixels[at] ?? 0,
        bmp.pixels[at + 1] ?? 0,
        bmp.pixels[at + 2] ?? 0,
    ];
}

function flat(
    bmp: Bitmap,
    fixed: number,
    horizontal: boolean,
    reference: [number, number, number],
): boolean {
    const span = horizontal ? bmp.width : bmp.height;
    // every 5th pixel: a letterbox bar is uniform by construction, and a full
    // scan of 15 covers is 3.75M reads for no extra certainty
    for (let i = 0; i < span; i += 5) {
        const [r, g, b] = horizontal
            ? sample(bmp, i, fixed)
            : sample(bmp, fixed, i);
        if (
            Math.abs(r - reference[0]) > TOLERANCE ||
            Math.abs(g - reference[1]) > TOLERANCE ||
            Math.abs(b - reference[2]) > TOLERANCE
        ) {
            return false;
        }
    }
    return true;
}

/**
 * The picture inside the padding.
 *
 * Each edge is trimmed while it still matches THAT EDGE'S OWN colour, sampled
 * once from the outermost line. Comparing a line against itself instead — "is
 * this line uniform?" — looks equivalent and is not: it also eats any solid
 * band inside the artwork, and on a cover that is a single flat colour it eats
 * the whole image. The bars are white on one cover here and near-black on
 * another, so the colour cannot be assumed, only sampled.
 */
export function content_box(bmp: Bitmap): Box {
    const top_colour = sample(bmp, 0, 0);
    const bottom_colour = sample(bmp, 0, bmp.height - 1);
    const left_colour = sample(bmp, 0, 0);
    const right_colour = sample(bmp, bmp.width - 1, 0);

    let top = 0;
    while (top < bmp.height - 1 && flat(bmp, top, true, top_colour)) top++;
    let bottom = bmp.height - 1;
    while (bottom > top && flat(bmp, bottom, true, bottom_colour)) bottom--;
    let left = 0;
    while (left < bmp.width - 1 && flat(bmp, left, false, left_colour)) left++;
    let right = bmp.width - 1;
    while (right > left && flat(bmp, right, false, right_colour)) right--;

    return { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
}

/**
 * The largest centred square inside `box`, which is what a square slot shows.
 *
 * Returned in the IMAGE's coordinates so the renderer needs no knowledge of
 * how the padding was found.
 */
export function centred_square(box: Box): Box {
    const side = Math.min(box.w, box.h);
    return {
        x: box.x + Math.round((box.w - side) / 2),
        y: box.y + Math.round((box.h - side) / 2),
        w: side,
        h: side,
    };
}

/**
 * The crop a cover needs, or null when it needs none.
 *
 * Null for an undecodable image AND for one that is already square with no
 * padding — both render correctly with a plain `object-cover`, and a null
 * keeps that common case out of the manifest entirely.
 */
export function cover_crop(
    bytes: Uint8Array,
): { image: { w: number; h: number }; box: Box } | null {
    const bmp = decode_png(bytes);
    if (bmp == null) return null;
    const box = centred_square(content_box(bmp));
    const untouched =
        box.x === 0 &&
        box.y === 0 &&
        box.w === bmp.width &&
        box.h === bmp.height;
    if (untouched) return null;
    return { image: { w: bmp.width, h: bmp.height }, box };
}
