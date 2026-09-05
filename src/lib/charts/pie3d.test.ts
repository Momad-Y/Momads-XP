/**
 * The reference here is not hand-written: it is what Google Charts actually
 * drew, captured off the live loader before it was deleted, by driving the
 * global at five controlled ratios and dumping the emitted SVG. That renderer
 * is gone, so `google-charts-baseline.json` is the only remaining evidence of
 * what the drive Properties sheet looked like — which makes these assertions
 * the regression guard for the whole replacement.
 *
 * The fixture sits HERE rather than in `design/research/` (where the matching
 * screenshots are) because `design/` is gitignored: a test that reads an
 * untracked file passes locally and fails the moment CI checks out the repo.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pie_shapes, darken, GEOMETRY, type Shape } from './pie3d';

const USED = '#1d4ed8';
const FREE = '#ec4899';

interface Captured {
    tag: string;
    d: string | null;
    fill: string | null;
}

function is_captured(v: unknown): v is Captured {
    if (typeof v !== 'object' || v === null) return false;
    if (!('tag' in v) || typeof v.tag !== 'string') return false;
    if (!('d' in v) || !(typeof v.d === 'string' || v.d === null)) return false;
    if (!('fill' in v) || !(typeof v.fill === 'string' || v.fill === null)) {
        return false;
    }
    return true;
}

/** Validated rather than asserted: if the fixture ever loses its shape, the
 *  failure should name that, not surface as a confusing geometry mismatch. */
function load_probes(): Record<string, Captured[]> {
    const raw: unknown = JSON.parse(
        readFileSync(
            join(import.meta.dirname, 'google-charts-baseline.json'),
            'utf8',
        ),
    );
    if (typeof raw !== 'object' || raw === null || !('probes' in raw)) {
        throw new Error('baseline fixture has no `probes`');
    }
    const probes = raw.probes;
    if (typeof probes !== 'object' || probes === null) {
        throw new Error('baseline `probes` is not an object');
    }
    const out: Record<string, Captured[]> = {};
    for (const [ratio, value] of Object.entries(probes)) {
        const items: unknown[] = Array.isArray(value) ? value : [];
        const shapes = items.filter(is_captured);
        if (shapes.length !== items.length || shapes.length === 0) {
            throw new Error(`baseline probe ${ratio} is malformed`);
        }
        out[ratio] = shapes;
    }
    return out;
}

const probes = load_probes();

/**
 * Endpoints only: `M`/`L` take their pair, `A` takes the last two of its seven
 * parameters. Radii and flags are not positions and would swamp a comparison.
 */
function endpoints(d: string): [number, number][] {
    const out: [number, number][] = [];
    const tokens = d.match(/[MLAZmlaz]|-?[\d.]+/g) ?? [];
    let i = 0;
    while (i < tokens.length) {
        const cmd = tokens[i++];
        if (cmd === 'M' || cmd === 'L' || cmd === 'm' || cmd === 'l') {
            out.push([Number(tokens[i]), Number(tokens[i + 1])]);
            i += 2;
        } else if (cmd === 'A' || cmd === 'a') {
            out.push([Number(tokens[i + 5]), Number(tokens[i + 6])]);
            i += 7;
        }
    }
    return out;
}

function distinct(pts: [number, number][]): [number, number][] {
    const seen = new Set<string>();
    return pts.filter((p) => {
        const k = `${p[0].toFixed(3)},${p[1].toFixed(3)}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
    });
}

/**
 * Google emits zero-area artefacts — a wall for a slice that touches the front
 * at a single angle, and a trailing `A0,0,...` no-op on every wedge. A shape
 * with fewer than three distinct endpoints cannot enclose anything.
 */
function drawn(shapes: Captured[]): Captured[] {
    return shapes.filter(
        (s) => s.tag !== 'path' || distinct(endpoints(s.d ?? '')).length >= 3,
    );
}

function mine(used: number, free: number): Shape[] {
    return pie_shapes([
        { value: used, colour: USED },
        { value: free, colour: FREE },
    ]);
}

describe('darken', () => {
    it('reproduces the wall shades in the capture', () => {
        // the only two wall colours Google emitted across every probed ratio
        expect(darken(USED)).toBe('#163ba2');
        expect(darken(FREE)).toBe('#b13673');
    });

    it('leaves a value it cannot parse alone', () => {
        expect(darken('transparent')).toBe('transparent');
    });
});

describe('matches the captured Google Charts output', () => {
    for (const [ratio, captured] of Object.entries(probes)) {
        it(`draws ${ratio} the way Google did`, () => {
            const parts = ratio.split('/');
            const got = mine(Number(parts[0]), Number(parts[1]));
            const want = drawn(captured);

            expect(got.map((s) => s.fill)).toEqual(want.map((s) => s.fill));
            expect(got.map((s) => s.kind)).toEqual(
                want.map((s) => (s.tag === 'ellipse' ? 'ellipse' : 'path')),
            );

            got.forEach((shape, i) => {
                if (shape.kind === 'ellipse') return;
                const a = distinct(endpoints(shape.d));
                const b = distinct(endpoints(want[i]?.d ?? ''));
                expect(a.length).toBe(b.length);
                a.forEach((p, j) => {
                    const q = b[j];
                    expect(q).toBeDefined();
                    expect(p[0]).toBeCloseTo(q?.[0] ?? NaN, 3);
                    expect(p[1]).toBeCloseTo(q?.[1] ?? NaN, 3);
                });
            });
        });
    }
});

describe('degenerate inputs never reach the DOM', () => {
    it('renders nothing when capacity is NaN', () => {
        expect(mine(NaN, NaN)).toEqual([]);
        expect(mine(10, NaN)).toEqual([]);
    });

    it('renders nothing when capacity is zero', () => {
        // a drive seeded with capacity 0 passes disk_properties' `?? NaN` guard
        expect(mine(0, 0)).toEqual([]);
    });

    it('renders nothing for a negative slice', () => {
        // free_space goes negative when a drive is over-filled; the numeric
        // read-outs above the chart still show it, but the pie must not break
        expect(mine(120, -20)).toEqual([]);
    });

    it('never emits NaN in path data', () => {
        const ratios: [number, number][] = [
            [1, 3],
            [1, 0],
            [0, 1],
            [1, 1],
            [999999, 1],
        ];
        for (const [u, f] of ratios) {
            for (const s of mine(u, f)) expect(s.d).not.toContain('NaN');
        }
    });

    it('collapses a whole-circle slice to an ellipse plus one wall', () => {
        const shapes = mine(0, 100);
        expect(shapes.map((s) => s.kind)).toEqual(['path', 'ellipse']);
        expect(shapes[1]?.fill).toBe(FREE);
        expect(shapes[0]?.fill).toBe(darken(FREE));
    });

    it('keeps every point inside the viewBox', () => {
        for (const s of mine(30, 70)) {
            for (const [x, y] of endpoints(s.d)) {
                expect(x).toBeGreaterThanOrEqual(0);
                expect(x).toBeLessThanOrEqual(GEOMETRY.width);
                expect(y).toBeGreaterThanOrEqual(0);
                expect(y).toBeLessThanOrEqual(GEOMETRY.height);
            }
        }
    });
});
