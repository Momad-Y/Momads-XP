/**
 * What the host will and will not accept from the Python runtime.
 *
 * Pure, and separate from the act of saving, because these are the decisions
 * that have to hold when the caller is HOSTILE — which it always is: every
 * line of Python here is typed by a stranger, and Python can call
 * `js.postMessage` directly, so the writable directory in `/c` is an
 * ergonomic convenience and NOT a boundary. This module is the boundary.
 */

/** One file the runtime is asking to persist. */
export interface SaveRequest {
    name: string;
    text: string;
}

export const LIMITS = {
    /** A source file is kilobytes. Generous, and far under a quota threat. */
    max_bytes: 256 * 1024,
    /** Per message. A statement that writes more is refused, not truncated. */
    max_files_per_message: 25,
    /** Live files in the folder, so Explorer stays usable. */
    max_files: 100,
    /**
     * Minimum gap between accepted saves.
     *
     * NOT a comfort value. `desktop.svelte` persists the whole drive on a
     * 1000 ms debounce that it re-arms on EVERY store notification, and
     * `new_fs_item_raw` fires two notifications per create. Anything faster
     * than this means the drive is never written to IndexedDB at all, while
     * the app still looks alive — which is the failure this limit exists to
     * prevent, and it is reachable by an ordinary `for` loop, not just by an
     * attacker.
     */
    min_interval_ms: 2000,
    /** A hard stop per runtime, after which the worker is terminated. */
    max_per_runtime: 200,
    /**
     * Refused saves before the runtime is killed.
     *
     * A flood consists only of refusals, so a budget counting ACCEPTED saves
     * alone can never end one.
     */
    max_refusals: 50,
} as const;

/**
 * Names the host will accept.
 *
 * ASCII only, with a strict `$` — JS anchors do not match before a trailing
 * newline, so this cannot be smuggled past. It contains no path separator, so
 * traversal is INEXPRESSIBLE rather than filtered: there is no field in the
 * message in which to write one.
 */
const NAME = /^[A-Za-z0-9 ._-]{1,64}$/;

/** UTF-8 bytes, not UTF-16 code units — `.length` under-counts CJK by 3×. */
export function byte_length(text: string): number {
    return new TextEncoder().encode(text).length;
}

/**
 * Normalise a name the way the VFS will store it.
 *
 * `new_fs_item_raw` lowercases the extension, so without this `NOTES.TXT`
 * would be saved as `NOTES.txt`, never match on the next lookup, and be
 * re-created on every statement until the file cap.
 */
export function normalise_name(name: string): string {
    const dot = name.lastIndexOf('.');
    if (dot <= 0) return name;
    return name.slice(0, dot) + name.slice(dot).toLowerCase();
}

export type Rejection =
    'bad-name' | 'reserved-name' | 'empty-basename' | 'too-large';

/** Why this file cannot be saved, or `null` if it can. */
export function reject_reason(file: SaveRequest): Rejection | null {
    if (!NAME.test(file.name)) return 'bad-name';
    // `.` and `..` pass the character class, and `path.ts` treats `.` as
    // "stay here" — an item named `.` lists in `ls` and is unreachable by
    // `cd` or `cat` forever.
    if (file.name === '.' || file.name === '..') return 'reserved-name';
    if (file.name.trim() !== file.name) return 'bad-name';
    const dot = file.name.lastIndexOf('.');
    // `.py` has an empty basename, which renders as an empty window title.
    if (dot === 0) return 'empty-basename';
    if (byte_length(file.text) > LIMITS.max_bytes) return 'too-large';
    return null;
}

/** Human-readable, for the stderr line the visitor actually sees. */
export function rejection_text(name: string, reason: Rejection): string {
    switch (reason) {
        case 'bad-name':
            return `xp: '${name}' not saved — names may use letters, digits, spaces, dot, dash and underscore only`;
        case 'reserved-name':
            return `xp: '${name}' not saved — reserved name`;
        case 'empty-basename':
            return `xp: '${name}' not saved — needs a name before the extension`;
        case 'too-large':
            return `xp: '${name}' not saved — over ${String(
                LIMITS.max_bytes / 1024,
            )} KB`;
    }
}

/**
 * A rate gate that also counts a lifetime budget.
 *
 * Deliberately NOT described as a "per session" quota: `exit()` then `python`
 * builds a fresh client, so any client-scoped budget resets at the cost of one
 * Pyodide load. What it honestly is: a per-runtime ceiling whose reset cost is
 * a ten-second reload.
 */
export class SaveGate {
    private last = -Infinity;
    private used = 0;
    private refused = 0;
    private terminated = false;

    /** True when this save may proceed now. */
    allow(now: number): boolean {
        if (this.used >= LIMITS.max_per_runtime) return false;
        if (now - this.last < LIMITS.min_interval_ms) {
            // Counted, because a flood is made ENTIRELY of refusals: without
            // this, `used` never rises and the runtime is never terminated,
            // so a `while True: js.postMessage(...)` loop just paints refusal
            // lines into the terminal for ever.
            this.refused += 1;
            return false;
        }
        this.last = now;
        this.used += 1;
        return true;
    }

    /** True once, the first time the budget is spent. */
    claim_termination(): boolean {
        if (!this.exhausted() || this.terminated) return false;
        this.terminated = true;
        return true;
    }

    /** The budget is spent, or refusals have become a flood. */
    exhausted(): boolean {
        return (
            this.used >= LIMITS.max_per_runtime ||
            this.refused >= LIMITS.max_refusals
        );
    }

    reset(): void {
        this.last = -Infinity;
        this.used = 0;
        this.refused = 0;
        this.terminated = false;
    }
}
