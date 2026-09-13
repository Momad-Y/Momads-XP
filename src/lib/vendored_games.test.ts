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

/**
 * js-dos and the DOOM bundle are pinned by CHECKSUM, not against a pinned
 * devDependency like Stockfish above, and the asymmetry is deliberate.
 *
 * `js-dos` is 29 MB unpacked to verify the ~1.8 MB actually shipped — a bad
 * trade on every `npm ci` — and the DOOM bundle has no npm upstream at all, so
 * a manifest is the only option for it regardless. Pinning both the same way
 * would pay that cost and still not be uniform.
 *
 * BE CLEAR ABOUT WHAT THIS PROVES: that the committed bytes have not drifted.
 * NOT that they came from upstream. Provenance for these files is carried by
 * `LICENSE-third-party.md`, which records the exact version and source URL —
 * a weaker guarantee than the Stockfish test above, stated rather than glossed.
 */
const MANIFEST: Record<string, string> = {
    'static/js/js-dos/emulators.js':
        '5d9ca14da8fe75d2f1abb5a374aee14774fafd9f87c159cbcc411ca80c51c645',
    'static/js/js-dos/wdosbox.js':
        '71397a28a933269e9e3f2e91fd917c0ec05958adf3b2052574fc57eb6b1ee5e1',
    'static/js/js-dos/wdosbox.wasm':
        'aea62e7ea836424ce912728692d3168df63828b5fabfebc2b18cd1d2b19beda2',
    'static/js/js-dos/wlibzip.js':
        'b8e55c2aa4c96e961c9965f289c0f40b5d44f02a557dcf980ddc29787b493842',
    'static/js/js-dos/wlibzip.wasm':
        '25064d970c42ca7ea0fdb8b058204d6e41cc8826a676219677772f5591e8337b',
    'static/games/doom/doom.jsdos':
        '65d767628273aa0e1d4f45f7f2fe92b6b956e3d599868f4078dbdb709db14df2',
};

describe('vendored js-dos and the DOOM bundle', () => {
    for (const [path, digest] of Object.entries(MANIFEST)) {
        it(`${path} has not drifted`, () => {
            expect(existsSync(path), `${path} is missing`).toBe(true);
            expect(sha(path)).toBe(digest);
        });
    }

    it('does not ship the js-dos cloud UI layer', () => {
        /*
         * THE regression this guards. `js-dos.js` is the project's optional UI
         * layer and it hardcodes br.cdn.dos.zone (x10), net.dos.zone,
         * v8.js-dos.com and a Yandex API gateway — shipping it would put
         * third-party network calls in a portfolio and fail
         * `e2e/no_cdn.spec.ts`. Only the emulator layer belongs here.
         */
        for (const file of ['js-dos.js', 'js-dos.css', 'sockdrive.js']) {
            expect(
                existsSync(`static/js/js-dos/${file}`),
                `${file} must not be vendored`,
            ).toBe(false);
        }
    });

    it('ships only plain dosbox, not dosbox-x', () => {
        // dosbox-x is several MB more and DOOM does not need it.
        expect(existsSync('static/js/js-dos/wdosbox-x.wasm')).toBe(false);
    });

    it('ships the id shareware notice beside the bundle', () => {
        // The licence has to travel with the work, and the notice states the
        // repackaging caveat rather than claiming a clean grant.
        const notice = readFileSync(
            'static/games/doom/LICENSE-id-shareware.txt',
            'utf8',
        );
        expect(notice).toContain('id Software');
        expect(notice).toContain('freely distributable');
        expect(notice).toContain('f0cefca49926d00903cf57551d901abe');
    });

    it('names js-dos and DOOM in the third-party notices', () => {
        const notices = readFileSync('LICENSE-third-party.md', 'utf8');
        expect(notices).toContain('GPL-2.0');
        expect(notices).toContain('github.com/caiiiycuk/js-dos');
        expect(notices).toContain('doom-wad-shareware');
    });
});
