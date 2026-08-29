/**
 * The `color` command's logic — parsing, legibility, and the messages.
 *
 * Pure and DOM-free: the component only applies the accepted hex. It works by
 * rewriting ONE xterm palette slot (bright green, `\x1b[92m`), which is the
 * single colour every accent in the terminal already uses — the prompt,
 * headings, the banner and the `matrix` rain. Repainting the slot recolours
 * the SCROLLBACK too, which is exactly what cmd.exe's own `color` does.
 */
import { colour, FG_GREY, FG_YELLOW } from '../term/ansi';
import { XP_CONSOLE_THEME } from '../term/theme';

/**
 * The one non-hex argument `color` accepts. Exported so the completer offers
 * exactly what `run_color` accepts, rather than a second copy that can drift.
 */
export const COLOR_RESET = 'reset';

/** The default accent, restored by `color reset`. */
export const DEFAULT_ACCENT = XP_CONSOLE_THEME.brightGreen;

/**
 * Minimum contrast against the black background.
 *
 * WCAG relative luminance rather than a naive channel sum: `#0000ff` has a
 * high blue value and is still nearly invisible on black, while `#808080` sums
 * lower and reads fine. Only a perceptual measure gets that ordering right.
 *
 * 2.5:1 is well below the 4.5:1 body-text guideline on purpose — this is an
 * accent on a deliberately retro console, and being stricter would reject
 * colours that genuinely look good, like the XP console's own dark red. It is
 * set to catch "you will not be able to read this", not to enforce AA.
 */
export const MIN_CONTRAST = 2.5;

export interface ParsedColor {
    /** Normalised `#rrggbb`, lowercase. */
    hex: string;
    r: number;
    g: number;
    b: number;
}

/**
 * Accept `#rgb`, `#rrggbb`, and either without the `#`.
 *
 * Liberal on input because a visitor typing into a toy terminal should not
 * have to guess the one accepted spelling.
 */
export function parse_hex(input: string): ParsedColor | null {
    const raw = input.trim().replace(/^#/, '').toLowerCase();
    if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(raw)) return null;
    const full =
        raw.length === 3
            ? raw
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : raw;
    const r = Number.parseInt(full.slice(0, 2), 16);
    const g = Number.parseInt(full.slice(2, 4), 16);
    const b = Number.parseInt(full.slice(4, 6), 16);
    return { hex: `#${full}`, r, g, b };
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
export function relative_luminance({ r, g, b }: ParsedColor): number {
    const channel = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Contrast ratio against pure black, 1 (invisible) to 21 (white). */
export function contrast_on_black(color: ParsedColor): number {
    return (relative_luminance(color) + 0.05) / 0.05;
}

/**
 * Rejection lines for a colour nobody would be able to read.
 *
 * Two messages, because "you typed black" and "you typed something almost as
 * bad as black" deserve different jokes — and lumping them together would make
 * the near-black case read like a bug rather than a judgement call.
 */
function too_dark_message(color: ParsedColor): string[] {
    const pure_black = color.r === 0 && color.g === 0 && color.b === 0;
    return pure_black
        ? [
              colour(
                  'Black text on a black background. Bold choice, genius.',
                  FG_YELLOW,
              ),
              colour(
                  'Refusing, on the grounds that you would never find the prompt again.',
                  FG_GREY,
              ),
          ]
        : [
              colour(
                  `${color.hex} is close enough to black that you would be squinting at it.`,
                  FG_YELLOW,
              ),
              colour(
                  `Contrast on black is ${contrast_on_black(color).toFixed(1)}:1; this terminal wants at least ${String(MIN_CONTRAST)}:1.`,
                  FG_GREY,
              ),
          ];
}

export interface ColorResult {
    /** The hex to apply, or null when nothing should change. */
    accent: string | null;
    lines: string[];
}

/**
 * Run `color [hex|reset]`.
 *
 * Returns the lines to print and, when the input is usable, the accent to
 * apply. Keeping the decision here rather than in the component is what makes
 * every branch — including both rejection jokes — unit-testable.
 */
export function run_color(args: string[], current: string): ColorResult {
    const arg = args[0];

    if (arg == null || arg.length === 0) {
        return {
            accent: null,
            lines: [
                `Accent colour is currently ${colour(current, FG_YELLOW)}.`,
                colour('Usage: color #rrggbb   (or: color reset)', FG_GREY),
            ],
        };
    }

    if (arg.toLowerCase() === COLOR_RESET) {
        return {
            accent: DEFAULT_ACCENT,
            lines: [`Accent colour reset to ${DEFAULT_ACCENT}.`],
        };
    }

    const parsed = parse_hex(arg);
    if (parsed == null) {
        return {
            accent: null,
            lines: [
                colour(`'${arg}' is not a hex colour.`, FG_YELLOW),
                colour('Try something like: color #ff8800', FG_GREY),
            ],
        };
    }

    if (contrast_on_black(parsed) < MIN_CONTRAST) {
        return { accent: null, lines: too_dark_message(parsed) };
    }

    return {
        accent: parsed.hex,
        lines: [`Accent colour set to ${parsed.hex}.`],
    };
}
