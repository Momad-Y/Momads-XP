/**
 * Filter escape sequences out of text the Python runtime produced.
 *
 * WHY: `stdout` is written straight into xterm, and every line of Python here
 * is typed by a stranger. Measured against the live REPL —
 * `print("\x1b[2J\x1b[H...")` wiped the scrollback, taking earlier output with
 * it, and `\x1b[1;3r` sets a scroll region that outlives the statement.
 *
 * WHY NOT STRIP EVERYTHING: `theme.ts` records the 16-colour palette as
 * load-bearing precisely because Pyodide's tracebacks are ANSI-coloured.
 * Deleting all escapes would fix a hardening issue by removing a real feature.
 *
 * So this is an ALLOWLIST of one thing: SGR — `ESC [ <digits and ;> m` — which
 * only ever changes how the following characters look. Everything else goes,
 * because everything else can move the cursor, erase, scroll, swap screens, or
 * talk to the terminal emulator.
 *
 * Pure, so the whole rule is unit-testable without a browser.
 */

/** Kept: they affect the current line only, and Python output relies on them. */
const KEEP_CONTROLS = new Set(['\n', '\r', '\t']);

/**
 * SGR, and nothing else.
 *
 * `?` is excluded deliberately: `ESC [ ? 25 l` hides the cursor and
 * `ESC [ ? 1049 h` swaps to the alternate screen, and a rule that only checked
 * the final byte would wave `ESC [ ? 31 m` through as "a colour".
 */
const SGR = /^[0-9;]*m$/;

function is_csi_final(code: number): boolean {
    // CSI runs until a byte in @ (0x40) .. ~ (0x7e).
    return code >= 0x40 && code <= 0x7e;
}

export function sanitise_runtime_text(text: string): string {
    let out = '';
    let i = 0;

    while (i < text.length) {
        const ch = text[i] ?? '';
        const code = ch.charCodeAt(0);

        // ESC, or its 8-bit equivalents. \x9b IS a CSI and \x9d IS an OSC — a
        // filter that only knows `\x1b[` lets both straight through.
        const is_esc = ch === '\x1b';
        const eight_bit_csi = code === 0x9b;
        const eight_bit_osc = code === 0x9d;
        const eight_bit_string =
            code === 0x90 || code === 0x9e || code === 0x9f;

        if (!is_esc && !eight_bit_csi && !eight_bit_osc && !eight_bit_string) {
            // Ordinary character. Drop control codes that are not on the
            // keep-list; they are cursor motion by another name.
            if (code >= 0x20 || KEEP_CONTROLS.has(ch)) out += ch;
            i += 1;
            continue;
        }

        // Work out what kind of sequence this is and where its body starts.
        let kind: 'csi' | 'osc' | 'string';
        let body = i + 1;
        if (eight_bit_csi) kind = 'csi';
        else if (eight_bit_osc) kind = 'osc';
        else if (eight_bit_string) kind = 'string';
        else {
            const next = text[i + 1] ?? '';
            body = i + 2;
            if (next === '[') kind = 'csi';
            else if (next === ']') kind = 'osc';
            else if (
                next === 'P' ||
                next === '_' ||
                next === '^' ||
                next === 'X'
            )
                kind = 'string';
            else if (next === '') {
                // A lone ESC at the very end: nothing to interpret, drop it.
                break;
            } else {
                // Single-character escape: `ESC c` (full reset), `ESC 7`
                // (save cursor), `ESC ( 0` (line-drawing charset)…
                i = next === '(' || next === ')' ? i + 3 : i + 2;
                continue;
            }
        }

        if (kind === 'csi') {
            let j = body;
            while (j < text.length && !is_csi_final(text.charCodeAt(j))) j += 1;
            if (j >= text.length) break; // unterminated — drop the remainder
            const params = text.slice(body, j);
            const final = text[j] ?? '';
            if (SGR.test(params + final)) out += `\x1b[${params}${final}`;
            i = j + 1;
            continue;
        }

        // OSC / DCS / APC / PM / SOS all run until BEL or ST, and the PAYLOAD
        // goes with them — leaving it as visible text would be its own bug.
        let j = body;
        while (j < text.length) {
            const c = text[j] ?? '';
            if (c === '\x07' || c === '\x9c') {
                j += 1;
                break;
            }
            if (c === '\x1b' && text[j + 1] === '\\') {
                j += 2;
                break;
            }
            j += 1;
        }
        i = j;
    }

    return out;
}
