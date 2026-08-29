import { describe, it, expect } from 'vitest';
import {
    contrast_on_black,
    DEFAULT_ACCENT,
    MIN_CONTRAST,
    parse_hex,
    relative_luminance,
    run_color,
} from './color';
import { strip_ansi } from '../term/ansi';

const plain = (lines: string[]) => lines.map(strip_ansi).join('\n');

/**
 * `parse_hex` that throws instead of returning null.
 *
 * A helper rather than `!`: `no-non-null-assertion` is an error over `src/`,
 * and a thrown message names the bad fixture instead of failing on a cryptic
 * property access.
 */
function hex(input: string) {
    const parsed = parse_hex(input);
    if (parsed == null)
        throw new Error(`test fixture is not a colour: ${input}`);
    return parsed;
}

describe('parse_hex', () => {
    it('accepts #rrggbb', () => {
        expect(parse_hex('#ff8800')).toMatchObject({
            hex: '#ff8800',
            r: 255,
            g: 136,
            b: 0,
        });
    });

    it('expands #rgb shorthand', () => {
        expect(parse_hex('#f80')?.hex).toBe('#ff8800');
    });

    it('accepts the hash being omitted, and any casing', () => {
        // A visitor typing into a toy terminal should not have to guess the
        // one accepted spelling.
        expect(parse_hex('FF8800')?.hex).toBe('#ff8800');
        expect(parse_hex('  #FfAa00 ')?.hex).toBe('#ffaa00');
    });

    it('rejects anything that is not 3 or 6 hex digits', () => {
        for (const bad of [
            '',
            '#',
            'red',
            '#12345',
            '#1234567',
            '#ggg',
            '12 34',
        ]) {
            expect(parse_hex(bad), bad).toBeNull();
        }
    });
});

describe('relative_luminance / contrast_on_black', () => {
    it('is 0 for black and 1 for white', () => {
        expect(relative_luminance(hex('#000000'))).toBeCloseTo(0, 5);
        expect(relative_luminance(hex('#ffffff'))).toBeCloseTo(1, 5);
    });

    it('gives black a contrast of 1 and white 21', () => {
        expect(contrast_on_black(hex('#000000'))).toBeCloseTo(1, 2);
        expect(contrast_on_black(hex('#ffffff'))).toBeCloseTo(21, 1);
    });

    it('ranks pure blue BELOW mid grey, which a channel sum would not', () => {
        // The reason this uses WCAG luminance rather than r+g+b: #0000ff sums
        // to 255 and is nearly invisible on black, while #808080 sums to 384
        // and reads fine. Only a perceptual measure gets that ordering right.
        const blue = contrast_on_black(hex('#0000ff'));
        const grey = contrast_on_black(hex('#808080'));
        expect(blue).toBeLessThan(grey);
    });
});

describe('run_color — accepted colours', () => {
    it('applies a bright colour and says so', () => {
        const out = run_color(['#ff8800'], DEFAULT_ACCENT);
        expect(out.accent).toBe('#ff8800');
        expect(plain(out.lines)).toContain('#ff8800');
    });

    it('normalises shorthand before applying', () => {
        expect(run_color(['#f80'], DEFAULT_ACCENT).accent).toBe('#ff8800');
    });

    it('reset returns the default accent', () => {
        const out = run_color(['reset'], '#ff8800');
        expect(out.accent).toBe(DEFAULT_ACCENT);
        expect(plain(out.lines)).toContain(DEFAULT_ACCENT);
    });

    it('with no argument reports the current colour and changes nothing', () => {
        const out = run_color([], '#ff8800');
        expect(out.accent).toBeNull();
        expect(plain(out.lines)).toContain('#ff8800');
        expect(plain(out.lines)).toContain('Usage');
    });
});

describe('run_color — rejected colours', () => {
    it('refuses pure black with the joke, and changes nothing', () => {
        const out = run_color(['#000000'], DEFAULT_ACCENT);
        expect(out.accent).toBeNull();
        expect(plain(out.lines)).toContain('genius');
    });

    it('refuses near-black and explains the contrast, not the joke', () => {
        // "You typed black" and "you typed something almost as bad" deserve
        // different messages — lumping them together makes the near-black case
        // read like a bug rather than a judgement.
        const out = run_color(['#111111'], DEFAULT_ACCENT);
        expect(out.accent).toBeNull();
        const text = plain(out.lines);
        expect(text).toContain('#111111');
        expect(text).toContain(':1');
        expect(text).not.toContain('genius');
    });

    it('refuses every colour under the contrast floor', () => {
        for (const dark of [
            '#000000',
            '#050505',
            '#111111',
            '#222222',
            '#000080',
        ]) {
            const out = run_color([dark], DEFAULT_ACCENT);
            expect(out.accent, `${dark} was allowed`).toBeNull();
        }
    });

    it('allows colours at or above the floor', () => {
        for (const ok of [
            '#ffffff',
            '#00ff00',
            '#ff8800',
            '#888888',
            '#00ffff',
        ]) {
            const out = run_color([ok], DEFAULT_ACCENT);
            expect(out.accent, `${ok} was blocked`).toBe(ok);
        }
    });

    it('the floor is what actually decides, not a hardcoded list', () => {
        // Guards the threshold itself: every rejected sample must genuinely be
        // below MIN_CONTRAST, so tightening or loosening the constant moves
        // the behaviour rather than leaving these tests asserting a fiction.
        expect(contrast_on_black(hex('#222222'))).toBeLessThan(MIN_CONTRAST);
        expect(contrast_on_black(hex('#888888'))).toBeGreaterThanOrEqual(
            MIN_CONTRAST,
        );
    });

    it('rejects a non-colour with a usable hint', () => {
        const out = run_color(['banana'], DEFAULT_ACCENT);
        expect(out.accent).toBeNull();
        expect(plain(out.lines)).toContain('not a hex colour');
        expect(plain(out.lines)).toContain('color #');
    });
});
