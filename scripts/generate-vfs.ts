/**
 * profile.json → VFS seed generator (SPECIFICATION.md §6.7, Phase 2 spec D2).
 * Deterministic: frozen epoch, slug-derived ids, byte-stable output.
 * Run via `npm run generate:vfs`; CI fails if outputs drift from committed.
 *
 * Inputs:  scripts/vfs-base.json (frozen inherited shell items, raw JSON —
 *          field-preserving passthrough; carries fields outside VfsItem),
 *          src/lib/data/profile.json (via the typed profile module).
 * Outputs: static/json/hard_drive.json, src/lib/generated/seed_version.ts,
 *          src/lib/generated/vfs_ids.ts.
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { profile } from '../src/lib/profile';
import { SEED_EPOCH, build_portfolio } from '../src/lib/vfs_gen/build';
import { TRACKS } from '../src/lib/music/manifest';
import type { VfsItem } from '../src/lib/types';

const C_DRIVE = 'cTbkbrM4qjwF3UfmCoFkEK';
const DESKTOP = 'nt1QdU9Sws26H26UNQZcQU';
const MY_MUSIC = 'tjhEdnks6c4wPBWcqyoWQz';
const MY_COMPUTER_EXE = 'sWTYkZhdpSYCmXP7z6459v';

/**
 * `My Documents`, and the folder the Python REPL saves into.
 *
 * Generated here rather than hand-written into `scripts/vfs-base.json`,
 * because `src/` needs the Python folder's id at runtime and CLAUDE.md forbids
 * hand-editing `src/lib/generated/*`. Emitting it as `PYTHON_FOLDER_ID` puts
 * it under the CI freshness gate; a typo in either literal is caught by the
 * dangling parent/child validation below, which is the check that actually
 * bites (the hash gate compares generator output to committed output, so it
 * cannot see a literal that is wrong in both).
 */
const MY_DOCUMENTS = 'xpFolderMyDocuments0001';
const PYTHON_FOLDER = 'xpFolderPythonScripts01';
const IE_EXE = '2jpDfV5KSoYMArQnHgux5S';

/** Flipped per slice as real programs land (spec D13). */
const PROGRAM_URLS = {
    about_me: './programs/about_me.svelte',
    my_cv: './programs/pdf_viewer.svelte',
    contact_me: './programs/contact_me.svelte',
};

const desktop_exe = (
    id: string,
    basename: string,
    url: string,
    icon: string,
): VfsItem => ({
    id,
    type: 'file',
    basename,
    name: `${basename}.exe`,
    storage_type: 'fake',
    url,
    ext: '.exe',
    parent: DESKTOP,
    size: 1024,
    executable: true,
    icon,
    children: [],
    date_created: SEED_EPOCH,
    date_modified: SEED_EPOCH,
    sort_option: 0,
    sort_order: 0,
});

// ---- assemble ----------------------------------------------------------
// Typed as VfsItem for validation, but the parsed objects are passed through
// by reference/spread — inherited fields outside the type (e.g. `hidden`)
// survive to the output untouched (field-preserving passthrough, spec D2).
const base = JSON.parse(
    readFileSync('scripts/vfs-base.json', 'utf8'),
) as Record<string, VfsItem>;
const built = build_portfolio(profile);

const exes: VfsItem[] = [
    desktop_exe(
        'p1AboutMeDesktopExe0001',
        'About Me',
        PROGRAM_URLS.about_me,
        '/assets/icons/about-me.png',
    ),
    desktop_exe(
        'p1MyCvDesktopExe0000001',
        'My CV',
        PROGRAM_URLS.my_cv,
        '/assets/icons/my-cv.png',
    ),
    desktop_exe(
        'p1ContactMeDesktopExe01',
        'Contact Me',
        PROGRAM_URLS.contact_me,
        '/assets/icons/contact-me.png',
    ),
];

const seed: Record<string, VfsItem> = { ...base };
const add = (item: VfsItem): void => {
    if (seed[item.id] != null) throw new Error(`id collision: ${item.id}`);
    seed[item.id] = item;
};
for (const item of Object.values(built.items)) {
    add(item.parent === '' ? { ...item, parent: C_DRIVE } : item);
}
for (const exe of exes) add(exe);

const c_drive = seed[C_DRIVE];
if (c_drive == null) throw new Error('C: drive missing from base');
seed[C_DRIVE] = {
    ...c_drive,
    // My Documents FIRST, as XP orders it — Explorer and `ls` both render this
    // array verbatim, so the order here is the order a visitor sees.
    children: [
        MY_DOCUMENTS,
        ...c_drive.children,
        ...built.folder_ids,
        built.resume_file_id,
    ],
};

// ---- My Music: derived from the track manifest ------------------------
// The manifest is the single source of truth (src/lib/music/manifest.ts);
// vfs-base.json ships My Music with `children: []` and is NOT edited. The
// entries point at the SAME static URLs the player uses, so no bytes are
// duplicated — only metadata.
const my_music = seed[MY_MUSIC];
if (my_music == null) throw new Error('My Music folder missing from base');
for (const track of TRACKS) {
    seed[track.id] = {
        id: track.id,
        type: 'file',
        basename: track.title,
        name: `${track.title}.mp3`,
        ext: '.mp3',
        storage_type: 'remote',
        url: track.url,
        // KB, per VfsItem.size — a byte value renders as "512,986 KB".
        size: track.size_kb,
        parent: MY_MUSIC,
        children: [],
        date_created: SEED_EPOCH,
        date_modified: SEED_EPOCH,
        sort_option: 0,
        sort_order: 0,
    };
}
seed[MY_MUSIC] = {
    ...my_music,
    children: [...my_music.children, ...TRACKS.map((t) => t.id)],
};

// ---- My Documents \ Python --------------------------------------------
// Where the Python REPL persists a visitor's saved scripts. `My Documents` is
// the XP-authentic home for a visitor's own files and the drive had no
// equivalent; the subfolder keeps saved scripts from colliding with anything
// added later.
seed[MY_DOCUMENTS] = {
    id: MY_DOCUMENTS,
    type: 'folder',
    name: 'My Documents',
    basename: 'My Documents',
    ext: '',
    icon: '/images/xp/icons/MyDocuments.png',
    starting_point: true,
    parent: C_DRIVE,
    children: [PYTHON_FOLDER],
    date_created: SEED_EPOCH,
    date_modified: SEED_EPOCH,
    sort_option: 0,
    sort_order: 0,
};
seed[PYTHON_FOLDER] = {
    id: PYTHON_FOLDER,
    type: 'folder',
    name: 'Python',
    basename: 'Python',
    ext: '',
    icon: '/images/xp/icons/FolderClosed.png',
    parent: MY_DOCUMENTS,
    children: [],
    date_created: SEED_EPOCH,
    date_modified: SEED_EPOCH,
    sort_option: 0,
    sort_order: 0,
};

const desktop = seed[DESKTOP];
if (desktop == null) throw new Error('Desktop folder missing from base');
seed[DESKTOP] = {
    ...desktop,
    // §3.5 order (top-to-bottom on the desktop's left edge)
    children: [
        MY_COMPUTER_EXE,
        'p1AboutMeDesktopExe0001',
        'p1MyCvDesktopExe0000001',
        IE_EXE,
        'p1ContactMeDesktopExe01',
    ],
};

// ---- validate ----------------------------------------------------------
for (const [id, item] of Object.entries(seed)) {
    for (const child of item.children ?? []) {
        if (seed[child] == null) {
            throw new Error(`dangling child ${child} in ${id}`);
        }
    }
    if (
        item.parent != null &&
        item.parent !== '' &&
        seed[item.parent] == null
    ) {
        throw new Error(`dangling parent ${item.parent} in ${id}`);
    }
}

// ---- write -------------------------------------------------------------
const serialized = JSON.stringify(seed);
const version = createHash('sha256')
    .update(serialized)
    .digest('hex')
    .slice(0, 32);
writeFileSync('static/json/hard_drive.json', serialized);

mkdirSync('src/lib/generated', { recursive: true });
writeFileSync(
    'src/lib/generated/seed_version.ts',
    `// GENERATED by scripts/generate-vfs.ts — do not edit.\nexport const SEED_VERSION = '${version}';\n`,
);
writeFileSync(
    'src/lib/generated/vfs_ids.ts',
    `// GENERATED by scripts/generate-vfs.ts — do not edit.\n` +
        `export const PORTFOLIO_FOLDER_IDS: string[] = ${JSON.stringify(built.folder_ids)};\n` +
        `export const PORTFOLIO_ENTRY_IDS: string[] = ${JSON.stringify(built.entry_ids)};\n` +
        `export const PROJECTS_FOLDER_ID = '${built.projects_folder_id}';\n` +
        `export const RESUME_FILE_ID = '${built.resume_file_id}';\n` +
        `export const MY_DOCUMENTS_ID = '${MY_DOCUMENTS}';\n` +
        `export const PYTHON_FOLDER_ID = '${PYTHON_FOLDER}';\n`,
);
execSync(
    'npx prettier --write src/lib/generated/seed_version.ts src/lib/generated/vfs_ids.ts',
    { stdio: 'inherit' },
);
console.log(
    `generated: ${Object.keys(seed).length} items, SEED_VERSION ${version}`,
);
