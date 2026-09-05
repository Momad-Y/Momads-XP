/**
 * The 3D pie in the drive Properties sheet, as pure geometry.
 *
 * This replaces `https://www.gstatic.com/charts/loader.js`, which shipped for
 * one 100px graphic, ran on EVERY page load, and could not be covered by SRI
 * because the loader fetches further submodules at URLs we never declare.
 *
 * The constants below are not invented. They were traced off the real Google
 * Charts output before the loader was removed, by driving the live global with
 * controlled ratios and dumping the emitted SVG — see
 * `design/research/google-charts-pie-baseline.json`, which `pie3d.test.ts`
 * asserts this module still reproduces. That capture is unrepeatable: the
 * reference renderer is gone.
 *
 * Angles are radians measured CLOCKWISE FROM 12 O'CLOCK, matching what the
 * capture shows: the first slice starts at (cx, cy - ry).
 */

/** Traced from the baseline: a 330x100 box, ellipse at (166,45) r(50,40). */
export const GEOMETRY = {
    width: 330,
    height: 100,
    cx: 166,
    cy: 45,
    rx: 50,
    ry: 40,
    /** Wall height. The baseline's front faces run from y=45 to y=55. */
    depth: 10,
} as const;

/** Where the front of the pie begins and ends: 3 o'clock to 9 o'clock. */
const FRONT_START = Math.PI / 2;
const FRONT_END = (3 * Math.PI) / 2;
const TAU = Math.PI * 2;

export interface Slice {
    /** Fraction of the whole circle, 0..1. */
    value: number;
    /** Top-face fill. The wall shade is derived from it. */
    colour: string;
}

export interface Shape {
    kind: 'path' | 'ellipse';
    /** Path data — empty for an ellipse, which uses GEOMETRY instead. */
    d: string;
    fill: string;
}

/**
 * Google's wall shade is the top colour at 75% brightness, rounded half-up:
 * #1d4ed8 -> #163ba2 and #ec4899 -> #b13673 in the captured baseline.
 */
export function darken(hex: string): string {
    const digits = /^#([0-9a-f]{6})$/i.exec(hex)?.[1];
    if (digits == null) return hex;
    const n = parseInt(digits, 16);
    const part = (shift: number): string => {
        const v = Math.round((((n >> shift) & 0xff) * 3) / 4);
        return v.toString(16).padStart(2, '0');
    };
    return `#${part(16)}${part(8)}${part(0)}`;
}

/** A number in path data — trimmed so 55.00000000000001 does not ship. */
function num(v: number): string {
    return String(Math.round(v * 1e6) / 1e6);
}

function point(angle: number, dy = 0): string {
    const { cx, cy, rx, ry } = GEOMETRY;
    return `${num(cx + rx * Math.sin(angle))},${num(cy - ry * Math.cos(angle) + dy)}`;
}

function arc(sweep: 0 | 1, large: boolean, to: string): string {
    return `A${String(GEOMETRY.rx)},${String(GEOMETRY.ry)},0,${large ? '1' : '0'},${String(sweep)},${to}`;
}

/** The wedge lid, from the centre out along `from`, round the rim, and back. */
function top_face(from: number, to: number): string {
    const { cx, cy } = GEOMETRY;
    return `M${String(cx)},${String(cy)}L${point(from)}${arc(1, to - from > Math.PI, point(to))}Z`;
}

/** The curved outer wall, over whatever part of the slice faces the viewer. */
function outer_wall(from: number, to: number): string | null {
    const start = Math.max(from, FRONT_START);
    const end = Math.min(to, FRONT_END);
    if (end <= start) return null;
    const large = end - start > Math.PI;
    return (
        `M${point(start)}L${point(start, GEOMETRY.depth)}` +
        arc(1, large, point(end, GEOMETRY.depth)) +
        `L${point(end)}${arc(0, large, point(start))}`
    );
}

/**
 * The flat face along a slice boundary, visible only where the pie steps down.
 *
 * Only the SECOND boundary can ever show one: the first sits at 12 o'clock,
 * which faces away. Which slice owns it flips at 6 o'clock — verified against
 * the 25/75 (owned by the first slice) and 75/25 (owned by the second)
 * captures; at exactly 6 o'clock the face is edge-on and Google draws none.
 */
function radial_face(angle: number): string | null {
    if (angle < FRONT_START || angle > FRONT_END || angle === Math.PI) {
        return null;
    }
    const { cx, cy, depth } = GEOMETRY;
    return (
        `M${String(cx)},${String(cy)}L${String(cx)},${String(cy + depth)}` +
        `L${point(angle, depth)}L${point(angle)}Z`
    );
}

/**
 * Shapes in painter's order — back to front, so a later shape may occlude an
 * earlier one. Returns an empty array when there is nothing sane to draw,
 * which is what keeps `NaN` out of the DOM for a drive with no capacity.
 */
export function pie_shapes(slices: readonly Slice[]): Shape[] {
    if (slices.length === 0) return [];
    if (slices.some((s) => !Number.isFinite(s.value) || s.value < 0)) return [];

    const total = slices.reduce((sum, s) => sum + s.value, 0);
    if (!Number.isFinite(total) || total <= 0) return [];

    // A slice covering everything degenerates: an arc whose ends coincide draws
    // nothing, so the baseline emits an <ellipse> plus one full-front wall.
    const whole = slices.find((s) => s.value === total);
    if (whole != null) {
        const wall = outer_wall(FRONT_START, FRONT_END);
        return [
            ...(wall == null
                ? []
                : [
                      {
                          kind: 'path' as const,
                          d: wall,
                          fill: darken(whole.colour),
                      },
                  ]),
            { kind: 'ellipse' as const, d: '', fill: whole.colour },
        ];
    }

    // wedges, not index maths: `noUncheckedIndexedAccess` makes every
    // `bounds[i]` an optional, and the arithmetic reads worse for the checks
    const wedges: { from: number; to: number; slice: Slice }[] = [];
    let cursor = 0;
    for (const slice of slices) {
        const to = cursor + (slice.value / total) * TAU;
        wedges.push({ from: cursor, to, slice });
        cursor = to;
    }

    // The only boundary that can show a flat face is the second one: the first
    // sits at 12 o'clock, facing away.
    const first = wedges[0];
    if (first == null) return [];
    const seam = first.to;

    // Painter's order: the wedge whose wall sits further back is drawn first.
    // The capture flips at 6 o'clock — 50/50 and 75/25 draw the second wedge
    // first, 25/75 the first.
    const order = seam >= Math.PI ? [...wedges].reverse() : wedges;

    const out: Shape[] = [];
    for (const [index, wedge] of order.entries()) {
        const dark = darken(wedge.slice.colour);
        const wall = outer_wall(wedge.from, wedge.to);
        if (wall != null) out.push({ kind: 'path', d: wall, fill: dark });

        // The wedge behind at the seam owns its visible face — and after the
        // ordering above, the back one is always the first drawn. Verified
        // both ways round by the 25/75 and 75/25 captures.
        const face = index === 0 ? radial_face(seam) : null;
        if (face != null) out.push({ kind: 'path', d: face, fill: dark });

        out.push({
            kind: 'path',
            d: top_face(wedge.from, wedge.to),
            fill: wedge.slice.colour,
        });
    }

    return out;
}
