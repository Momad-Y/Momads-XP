/**
 * The `hack` easter egg's SCRIPT, as data.
 *
 * Pure and DOM-free, for the same reason the rest of `src/lib/cmd/` is: this
 * used to be a five-string array inside `cmd.svelte`, and `.svelte` is exempt
 * from the diff-coverage gate. At five lines that was a fair trade; at this
 * length it would be a page of untested content hiding from the gate.
 *
 * The component owns only the CLOCK — it walks these beats and sleeps between
 * them. Every decision about what is said, how wide it is, and how long the
 * whole thing runs is decided here and asserted in `hack.test.ts`.
 *
 * COLOUR IS NOT SET HERE. Every beat is written by the component in bright
 * green (`\x1b[92m`), which is the palette slot `color` rewrites — so the
 * whole animation follows the accent, and re-running `color` recolours what
 * has already scrolled past. Emitting a truecolor hex per beat would look
 * identical on the first run and then leave `hack` as the one thing in the
 * terminal that never recolours again.
 */

/** Milliseconds between the trailing dots of a step. */
export const DOT_INTERVAL_MS = 100;

/** Milliseconds between one beat and the next. */
export const BEAT_GAP_MS = 90;

/** Milliseconds between progress-bar frames. */
export const PROGRESS_FRAME_MS = 60;

/** Cells in a progress bar, excluding the brackets and the percentage. */
export const PROGRESS_WIDTH = 26;

export type HackBeat =
    /** `[*] text.... TAG` — the workhorse. */
    | { kind: 'step'; text: string; dots: number; tag: string }
    /** A standalone line at full accent brightness. */
    | { kind: 'line'; text: string }
    /** A standalone line at DIM accent — still follows `color`, reads quieter. */
    | { kind: 'aside'; text: string }
    /** A label, then a bar that fills across `PROGRESS_WIDTH` cells. */
    | { kind: 'progress'; label: string };

/**
 * The script.
 *
 * Ordered as a joke with a shape rather than a list of technobabble: it opens
 * straight (steps 1-2), turns once the password lands, escalates into things
 * that are not hacking at all (cookie banners, CAPTCHAs), and pays off by
 * admitting there was never a mainframe. The original five steps were all one
 * note, which is why five was as long as it could be without dragging.
 */
export const HACK_SCRIPT: readonly HackBeat[] = [
    { kind: 'step', text: 'Locating mainframe', dots: 6, tag: 'FOUND' },
    {
        kind: 'step',
        text: 'Bypassing firewall (all seven of them)',
        dots: 5,
        tag: 'BYPASSED',
    },
    {
        kind: 'step',
        text: 'Brute-forcing admin password',
        dots: 8,
        tag: "it was 'password1'",
    },
    { kind: 'step', text: 'Escalating to root', dots: 6, tag: 'DENIED' },
    {
        kind: 'step',
        text: 'Escalating to root, but saying please',
        dots: 5,
        tag: 'GRANTED',
    },
    {
        kind: 'step',
        text: 'Rerouting through 12 proxies in 4 countries',
        dots: 4,
        tag: 'ROUTED',
    },
    {
        kind: 'step',
        text: 'Decrypting RSA-8192 with a bent paperclip',
        dots: 7,
        tag: 'DONE',
    },
    { kind: 'progress', label: 'Downloading the entire internet' },
    {
        kind: 'step',
        text: 'Accepting 4,281 cookie consent banners',
        dots: 5,
        tag: 'AGREED',
    },
    {
        kind: 'step',
        text: 'Selecting all squares with traffic lights',
        dots: 6,
        tag: 'FAILED',
    },
    {
        kind: 'step',
        text: 'Selecting all squares with traffic lights (try 9)',
        dots: 4,
        tag: 'OK',
    },
    {
        kind: 'step',
        text: 'Uploading virus to the GUI in Visual Basic',
        dots: 5,
        tag: 'UPLOADED',
    },
    {
        kind: 'step',
        text: 'Deleting System32 to free up space',
        dots: 6,
        tag: 'just kidding',
    },
    { kind: 'step', text: 'Covering our tracks', dots: 5, tag: 'COVERED' },
    { kind: 'line', text: 'ACCESS GRANTED.' },
    {
        kind: 'aside',
        text: 'You now have unrestricted root access to, and total control over,',
    },
    { kind: 'aside', text: 'this web page. Which you already had.' },
    {
        kind: 'aside',
        text: "Nothing was hacked. It is a portfolio. Try 'projects'.",
    },
];

/**
 * One frame of the progress bar, in DOS style.
 *
 * `#`/`-` rather than the shaded block glyphs: §10 lists Lucida Console as
 * web-safe and deliberately unbundled, so non-Windows visitors land on a
 * fallback whose coverage of the block-drawing range is not guaranteed. A
 * missing glyph would render the bar as a row of tofu.
 *
 * The percentage is right-padded to three columns so the bar does not jitter
 * sideways as it crosses 10% and 100%.
 */
export function progress_bar(filled: number, width = PROGRESS_WIDTH): string {
    const clamped = Math.max(0, Math.min(width, filled));
    const percent = Math.round((clamped / width) * 100);
    return `  [${'#'.repeat(clamped)}${'-'.repeat(width - clamped)}] ${String(percent).padStart(3)}%`;
}

/** Rendered width of a step line, dots and tag included. */
export function step_width(beat: Extract<HackBeat, { kind: 'step' }>): number {
    return `[*] ${beat.text}`.length + beat.dots + ` ${beat.tag}`.length;
}

/**
 * Worst-case runtime, in milliseconds, if nobody presses a key.
 *
 * Exported so a test can hold the line on it: the failure mode of a script
 * kept as data is that beats get appended one at a time until the egg
 * outstays its welcome, and no individual commit looks like the culprit.
 */
export function script_duration_ms(
    script: readonly HackBeat[] = HACK_SCRIPT,
): number {
    return script.reduce((total, beat) => {
        if (beat.kind === 'step') {
            return total + beat.dots * DOT_INTERVAL_MS + BEAT_GAP_MS;
        }
        if (beat.kind === 'progress') {
            return (
                total + (PROGRESS_WIDTH + 1) * PROGRESS_FRAME_MS + BEAT_GAP_MS
            );
        }
        return total + BEAT_GAP_MS;
    }, 0);
}
