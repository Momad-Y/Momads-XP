import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
    children_of,
    deref,
    display_path,
    drive_segment,
    home_id,
    is_dir,
    posix_path,
    resolve,
    ROOT,
    roots,
    strip_quotes,
} from './path';
import { to_hard_drive } from '../types';
import type { HardDrive, VfsItem } from '../types';

/** The SHIPPED seed, narrowed rather than asserted into shape. */
function load_seed(): HardDrive {
    return to_hard_drive(
        JSON.parse(readFileSync('static/json/hard_drive.json', 'utf-8')),
    );
}

// The SHIPPED drive, not a hand-made stand-in. Every name this module has to
// cope with — spaces, apostrophes, ampersands, and both an em dash (U+2014, in
// Experience) and an en dash (U+2013, in Awards and Certifications) — is in
// here, and a fixture written by hand would quietly get the dashes wrong.
const drive = load_seed();

const C = 'cTbkbrM4qjwF3UfmCoFkEK';
const EXPERIENCE = 'p2FolderExperience';
const PRINTERPIX = 'p2ExpPrinterpixAIEngineer0';
const RESUME = 'p2FileResumePdf';
const WALLPAPERS = 'uZ7fBbvbzFvQgAmJZpVbEb';

function got(result: ReturnType<typeof resolve>): string | null {
    return 'id' in result ? result.id : null;
}

describe('drive segments', () => {
    it('derives the segment from the name, which every drive has', () => {
        expect(roots(drive).map(drive_segment)).toEqual(['c', 'd', 'f']);
    });

    it('does not depend on `letter`, which the removable drive lacks', () => {
        const removable = roots(drive).find((d) => d.name === 'F:');
        expect(removable?.letter).toBeUndefined();
        expect(drive_segment(required(removable))).toBe('f');
    });

    it('makes the C: drive home, so `cd experience` works from the prompt', () => {
        expect(home_id(drive)).toBe(C);
    });
});

describe('posix_path', () => {
    it('names the My Computer level `/`', () => {
        expect(posix_path(ROOT, drive)).toBe('/');
    });

    it('renders a drive and a nested file', () => {
        expect(posix_path(C, drive)).toBe('/c');
        expect(posix_path(PRINTERPIX, drive)).toBe(
            '/c/Experience/Printerpix — AI Engineer.txt',
        );
    });

    it('returns null rather than throwing on a dangling ancestor', () => {
        // `del_fs` unlinks a parent and deletes its children across separate
        // store updates, so this state is observable in a live session.
        const orphaned: HardDrive = Object.fromEntries(
            Object.entries(drive).filter(([id]) => id !== EXPERIENCE),
        );
        expect(posix_path(PRINTERPIX, orphaned)).toBeNull();
    });

    it('returns null rather than hanging on a parent cycle', () => {
        const looped: HardDrive = {
            ...drive,
            [EXPERIENCE]: {
                ...required(drive[EXPERIENCE]),
                parent: PRINTERPIX,
            },
        };
        expect(posix_path(PRINTERPIX, looped)).toBeNull();
    });

    it('returns null for an id that is not on the drive', () => {
        expect(posix_path('nope', drive)).toBeNull();
    });
});

describe('display_path', () => {
    it('is `~` at home and `~/x` below it', () => {
        expect(display_path(C, drive)).toBe('~');
        expect(display_path(EXPERIENCE, drive)).toBe('~/Experience');
    });

    it('is absolute outside home', () => {
        expect(display_path('ejq5mVcfZA2fzR1uwYUC6n', drive)).toBe('/d');
        expect(display_path(ROOT, drive)).toBe('/');
    });

    it('falls back to `~` for a folder that has been deleted underneath it', () => {
        expect(display_path('nope', drive)).toBe('~');
    });
});

describe('children_of', () => {
    it('lists the drives at the root', () => {
        expect(children_of(ROOT, drive).map((i) => i.name)).toEqual([
            'C:',
            'D:',
            'F:',
        ]);
    });

    it('hides exactly what Explorer hides, and -a shows it', () => {
        const visible = children_of(C, drive).map((i) => i.name);
        expect(visible).not.toContain('Recycle Bin');
        expect(visible).not.toContain('Desktop');
        expect(visible).not.toContain('Wallpapers');
        expect(children_of(C, drive, true).map((i) => i.name)).toContain(
            'Wallpapers',
        );
    });

    it('preserves children order, which is reverse-chronological', () => {
        // Alphabetical would open the CV with Corporatica. The seed order is
        // the CV order and Explorer renders the same array.
        const names = children_of(EXPERIENCE, drive).map((i) => i.basename);
        expect(names[0]).toBe('Printerpix — AI Engineer');
        expect(names).not.toEqual(
            [...names].sort((a, b) => a.localeCompare(b)),
        );
    });

    it('is empty for a file and for a drive with no children', () => {
        expect(children_of(PRINTERPIX, drive)).toEqual([]);
        expect(children_of('ejq5mVcfZA2fzR1uwYUC6n', drive)).toEqual([]);
    });
});

describe('resolve', () => {
    it('walks a relative path, case-insensitively, as §3.2 asks', () => {
        expect(got(resolve('experience', C, drive))).toBe(EXPERIENCE);
        expect(got(resolve('EXPERIENCE', C, drive))).toBe(EXPERIENCE);
    });

    it('matches a case-folded name that still carries its extension', () => {
        // Tier 2 exists for exactly this: tier 3 compares against `basename`,
        // which has no extension, so it cannot answer a lowercased full name.
        expect(
            got(resolve('printerpix — ai engineer.txt', EXPERIENCE, drive)),
        ).toBe(PRINTERPIX);
    });

    it('matches a name without its extension', () => {
        expect(
            got(resolve('Printerpix — AI Engineer', EXPERIENCE, drive)),
        ).toBe(PRINTERPIX);
    });

    it('handles the en dash in Awards, not just the em dash in Experience', () => {
        // Both ship. A test written from one of them proves nothing about the
        // other, and the en-dash names are the majority.
        const award = resolve(
            '/c/Awards/1st Place – RoboCup @Home Education Competition (Egypt).txt',
            C,
            drive,
        );
        expect(got(award)).toBe(
            'p2Award1stPlaceRoboCupHomeEducationCompetitionEgypt0',
        );
    });

    it('walks absolute paths, `~`, `.`, `..` and trailing slashes', () => {
        expect(got(resolve('/c/Experience', ROOT, drive))).toBe(EXPERIENCE);
        expect(got(resolve('~', EXPERIENCE, drive))).toBe(C);
        expect(got(resolve('~/Experience/', ROOT, drive))).toBe(EXPERIENCE);
        expect(got(resolve('.', EXPERIENCE, drive))).toBe(EXPERIENCE);
        expect(got(resolve('..', EXPERIENCE, drive))).toBe(C);
        expect(got(resolve('../Projects', EXPERIENCE, drive))).toBe(
            'p2FolderProjects',
        );
    });

    it('treats `..` from a drive as the My Computer level, and stops there', () => {
        expect(got(resolve('..', C, drive))).toBe(ROOT);
        expect(got(resolve('../../../..', C, drive))).toBe(ROOT);
        expect(got(resolve('/', EXPERIENCE, drive))).toBe(ROOT);
    });

    it('addresses a drive by segment or by its real name', () => {
        expect(got(resolve('/c', ROOT, drive))).toBe(C);
        expect(got(resolve('/C:', ROOT, drive))).toBe(C);
    });

    it('reports the segment that failed, not the whole path', () => {
        const result = resolve('/c/Experience/nope/deeper', ROOT, drive);
        expect(result).toEqual({ missing: 'nope' });
    });

    it('reaches a name containing consecutive spaces', () => {
        // Creatable through Explorer's rename, which validates nothing. This
        // is why the path is the raw remainder of the line rather than
        // re-joined arguments — join-args would list it and never reach it.
        const odd: HardDrive = {
            ...drive,
            [C]: {
                ...required(drive[C]),
                children: [...required(drive[C]).children, 'oddid'],
            },
            oddid: {
                ...required(drive[EXPERIENCE]),
                id: 'oddid',
                name: 'My  Notes',
                basename: 'My  Notes',
                parent: C,
                children: [],
            },
        };
        expect(got(resolve('My  Notes', C, odd))).toBe('oddid');
        expect(got(resolve('My Notes', C, odd))).toBeNull();
    });

    it('falls back home when the working directory no longer exists', () => {
        expect(got(resolve('Experience', 'deleted-id', drive))).toBe(
            EXPERIENCE,
        );
    });

    it('strips one layer of hand-typed quotes', () => {
        expect(got(resolve('"Experience"', C, drive))).toBe(EXPERIENCE);
        expect(strip_quotes("'x'")).toBe('x');
        expect(strip_quotes('"x')).toBe('"x');
    });

    it('follows a shortcut, as opening one in Explorer does', () => {
        const linked: HardDrive = {
            ...drive,
            [C]: {
                ...required(drive[C]),
                children: [...required(drive[C]).children, 'lnk'],
            },
            lnk: {
                ...required(drive[PRINTERPIX]),
                id: 'lnk',
                name: 'Shortcut to Printerpix.lnk',
                basename: 'Shortcut to Printerpix',
                ext: '.lnk',
                parent: C,
                shortcut_target: PRINTERPIX,
            },
        };
        expect(got(resolve('Shortcut to Printerpix.lnk', C, linked))).toBe(
            PRINTERPIX,
        );
        expect(deref('lnk', linked)).toBe(PRINTERPIX);
    });

    it('leaves a shortcut whose target has been deleted alone', () => {
        const dangling: HardDrive = {
            ...drive,
            lnk: {
                ...required(drive[PRINTERPIX]),
                id: 'lnk',
                shortcut_target: 'gone',
            },
        };
        expect(deref('lnk', dangling)).toBe('lnk');
    });
});

describe('is_dir', () => {
    it('is true for folders and drives, false for files', () => {
        expect(is_dir(required(drive[EXPERIENCE]))).toBe(true);
        expect(is_dir(required(drive[C]))).toBe(true);
        expect(is_dir(required(drive[PRINTERPIX]))).toBe(false);
        expect(is_dir(required(drive[RESUME]))).toBe(false);
        expect(is_dir(required(drive[WALLPAPERS]))).toBe(true);
    });
});

function required(item: VfsItem | undefined): VfsItem {
    if (item == null) throw new Error('fixture item missing');
    return item;
}
