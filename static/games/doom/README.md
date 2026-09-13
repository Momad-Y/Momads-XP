# How `doom.jsdos` was assembled

Committed rather than built, deliberately: `npm run build` stays hermetic and
runs on a CI machine with no network, and the artefact that ships is the
artefact that was reviewed. The WAD would have to be committed either way, so
generating the wrapper at build time would add a step without removing a
binary from git.

## Contents

A plain zip. js-dos reads `.jsdos/dosbox.conf` from it and mounts the rest as
the DOS `C:` drive.

    .jsdos/dosbox.conf
    DOOM.EXE     709,905 bytes
    DOOM1.WAD  4,196,020 bytes, MD5 f0cefca49926d00903cf57551d901abe

Both game files are byte-identical to the official DOOM 1.9 shareware release
— verified against that WAD's published size and MD5. Licence and provenance:
`LICENSE-id-shareware.txt` beside this file, and `LICENSE-third-party.md` at
the repo root.

## dosbox.conf

    [sdl]
    autolock=false

    [cpu]
    core=auto
    cputype=auto
    cycles=max

    [render]
    aspect=true

    [autoexec]
    mount c .
    c:
    DOOM.EXE

`autolock=false` matters: pointer lock inside a windowed emulator that lives
in a draggable XP window is hostile, and the window manager needs the pointer.
`cycles=max` is what makes DOOM run at full speed in a browser.

## Rebuilding it

    mkdir -p bundle/.jsdos
    cp dosbox.conf bundle/.jsdos/
    cp DOOM.EXE DOOM1.WAD bundle/
    (cd bundle && zip -q -r -X ../doom.jsdos .jsdos DOOM.EXE DOOM1.WAD)

`-X` omits extra file attributes so the archive is reproducible. The resulting
SHA-256 is pinned by `src/lib/vendored_games.test.ts`; regenerating the bundle
means updating that manifest in the same commit, which is the point — the
bytes cannot change without somebody saying so.
