# Third-party components

`LICENSE` covers this repository's own source code. It does **not** — and
legally cannot — cover the components listed here.

Two of them are licensed under the GNU GPL. GPL-2.0 §6 and GPL-3.0 §10 forbid
imposing any further restriction on the rights those licences grant, so
`LICENSE`'s "redistribution is not permitted" cannot be applied to them. Each
component below is governed **solely by its own licence**, and this file
records, for each one: the files as they ship, the licence, the upstream
source that constitutes the "corresponding source", and the exact version.

Everything here ships **unmodified**. Nothing here is charged for.

The inherited base of this project is covered separately by
`LICENSE-win32.run` (MIT).

---

## Stockfish — GPL-3.0

The chess engine behind the Chess program.

- **Shipped as:**
    - `static/js/stockfish/stockfish.wasm.js`
    - `static/js/stockfish/stockfish.wasm`
    - `static/js/stockfish/Copying.txt` (the full GPL-3.0 text, verbatim)
- **Identifies itself as:** `Stockfish 2019-08-15 Multi-Variant`
- **Corresponding source:** <https://github.com/ddugovic/Stockfish> — the
  **multi-variant fork**, which is what this build is. It is _not_ built from
  <https://github.com/official-stockfish/Stockfish>, and naming that repository
  here would make this pointer wrong.
- **Packaged by:** <https://github.com/niklasf/stockfish.js>, npm
  `stockfish.js@10.0.2`, which is pinned as a devDependency so
  `src/lib/vendored_games.test.ts` can verify the shipped bytes are identical
  to it.
- **Copyright:** T. Romstad, M. Costalba, J. Kiiski, G. Linscott and
  contributors. Multi-variant support by Daniel Dugovic and contributors.

Only the single-threaded WebAssembly build is distributed. The multithreaded
build is deliberately not used: it requires `SharedArrayBuffer`, i.e. COOP/COEP
cross-origin isolation, which would break other embeds on this site.

## js-dos / DOSBox — GPL-2.0

The DOS emulator behind the DOOM program.

- **Shipped as:**
    - `static/js/js-dos/emulators.js`
    - `static/js/js-dos/wdosbox.js`
    - `static/js/js-dos/wdosbox.wasm`
    - `static/js/js-dos/wlibzip.js`
    - `static/js/js-dos/wlibzip.wasm`
- **Corresponding source:** <https://github.com/caiiiycuk/js-dos>, npm
  `js-dos@8.4.1`. js-dos embeds DOSBox, <https://www.dosbox.com/>.
- **Copyright:** Alexander Guryanov and contributors; DOSBox by the DOSBox
  team.

Only the emulator layer is distributed. `js-dos.js` — the project's optional
cloud UI — is deliberately **not** shipped, because it contacts third-party
services this site does not use.

## DOOM shareware, episode one — id Software shareware licence

The game data behind the DOOM program.

- **Shipped as:**
    - `static/games/doom/doom.jsdos` — a container holding the unmodified
      shareware `DOOM1.WAD` and its executable
    - `static/games/doom/LICENSE-id-shareware.txt` — the licence text, verbatim
- **Copyright:** © id Software. DOOM is a trademark of id Software LLC.
- **Distributed free of charge.** No consideration of any kind is charged or
  received for its receipt or use, which is the condition the licence attaches
  to copying.
- **Only episode one** — the shareware episode — is distributed. The
  commercial episodes are not included.

**A note on repackaging, stated rather than glossed.** The licence grants that
"you may make copies of the Software to give to other persons" and bars
charging for it. It does not explicitly address extracting the WAD from its
original distribution archive, which is what placing it in an emulator bundle
does. The precedent relied on is Debian's and Ubuntu's `doom-wad-shareware`
package, which performs the same extraction and redistribution and has passed
those projects' licence review. The contents are byte-identical to the original
shareware release. If id Software takes a different view, remove
`static/games/doom/` and the DOOM entry from the Start menu.

## Playing-card artwork — public domain

Used by the Solitaire program.

- **Shipped as:** `static/assets/cards/*.svg`
- **Author:** Byron Knoll (2011), via
  <https://github.com/notpeter/Vector-Playing-Cards>
- **Licence:** released into the public domain, with the WTFPL offered as a
  fallback in jurisdictions that do not recognise the public domain. No
  attribution is required — this credit is a courtesy.

## Chess piece artwork — CC BY-SA 3.0

Used by the Chess program.

- **Shipped as:** `static/assets/chess/{w,b}{K,Q,R,B,N,P}.svg`
- **Author:** Colin M.L. Burnett ("Cburnett"), via Wikimedia Commons.
- **Licence:** CC BY-SA 3.0. The author also offers these images under the
  GFDL and a BSD-style licence.
- Share-alike binds **these images**, not this repository's source code.
