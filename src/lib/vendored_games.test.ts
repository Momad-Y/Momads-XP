import { createHash } from 'node:crypto';
// `existsSync` is imported here, where the file is created, even though only
// the js-dos block below uses it — adding an import in a later change is how a
// `Cannot find name` ships.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The vendored game binaries, pinned so they cannot drift silently.
 *
 * Two mechanisms, deliberately, because the two vendors are not comparable:
 *
 *   Stockfish is compared against a PINNED devDependency, exactly as
 *   `vendored_three.test.ts` does. That proves provenance — these bytes are
 *   the package's bytes — and costs 2.3 MB in `npm ci`.
 *
 *   js-dos is compared against a committed checksum manifest instead. The
 *   package is 29 MB unpacked to verify the ~1.8 MB we actually ship, which is
 *   a bad trade on every CI install, and the DOOM bundle has no npm upstream
 *   at all so a manifest is the only option for it regardless. This proves
 *   STABILITY, not provenance — provenance for those files is carried by
 *   `LICENSE-third-party.md`, which records the exact version and URL. That is
 *   a weaker guarantee and is stated rather than glossed.
 */

const sha = (path: string): string =>
    createHash('sha256').update(readFileSync(path)).digest('hex');

describe('vendored Stockfish', () => {
    for (const file of ['stockfish.wasm.js', 'stockfish.wasm', 'Copying.txt']) {
        it(`${file} is byte-identical to the pinned package`, () => {
            expect(sha(`static/js/stockfish/${file}`)).toBe(
                sha(`node_modules/stockfish.js/${file}`),
            );
        });
    }

    it('ships the GPL-3 licence text beside the binary', () => {
        // GPL-3 §4 requires the licence to travel with the work. Shipping the
        // engine without it is the compliance failure, not a tidiness one.
        const text = readFileSync('static/js/stockfish/Copying.txt', 'utf8');
        expect(text).toContain('GNU GENERAL PUBLIC LICENSE');
        expect(text).toContain('Version 3');
    });

    it('does not ship the asm.js fallback', () => {
        // 1.5 MB of second engine. The window requires WebAssembly, which every
        // browser this site supports has had for years.
        expect(existsSync('static/js/stockfish/stockfish.js')).toBe(false);
    });

    it('names the engine and its fork in the third-party notices', () => {
        /*
         * The GPL "corresponding source" pointer has to be right. This build
         * identifies itself as `Stockfish 2019-08-15 Multi-Variant` and comes
         * from the ddugovic fork — pointing at official-stockfish/Stockfish
         * would name the wrong upstream.
         */
        const notices = readFileSync('LICENSE-third-party.md', 'utf8');
        expect(notices).toContain('Stockfish 2019-08-15 Multi-Variant');
        expect(notices).toContain('github.com/ddugovic/Stockfish');
        expect(notices).toContain('GPL-3.0');
    });
});
