// One-shot Phase 1 desktop curation (design decision 6, SPECIFICATION.md §3.5).
// Desktop children become: My Computer, About Me, My CV, Internet Explorer,
// Contact Me. Paint / Media Player Classic move to start-menu-only; the empty
// Games desktop folder VFS entry is deleted. Parent/children consistency is
// verified before writing (Phase 0 discipline).
import fs from 'fs';

const SEED_PATH = 'static/json/hard_drive.json';
const DESKTOP_ID = 'nt1QdU9Sws26H26UNQZcQU';
const KEEP_MY_COMPUTER = 'sWTYkZhdpSYCmXP7z6459v';
const KEEP_IE = '2jpDfV5KSoYMArQnHgux5S';
const REMOVE = [
    '8zbKRcb6rGUW9QUoMdtUHY', // Paint.exe — start-menu-only per §3.5
    'mPStWjybAjUKtMyKhgtAag', // Media Player Classic.exe — start-menu-only
    'rugcCBKHiSYK5RFdud7m3p', // Games folder — empty; games become start-menu placeholders
];
const SEED_TIMESTAMP = 1676799354180; // the seed's canonical timestamp — stable diffs

const make_exe = (id, basename, icon) => ({
    id,
    type: 'file',
    basename,
    name: `${basename}.exe`,
    storage_type: 'fake',
    url: './programs/placeholder.svelte',
    ext: '.exe',
    parent: DESKTOP_ID,
    size: 1024,
    executable: true,
    icon,
    children: [],
    date_created: SEED_TIMESTAMP,
    date_modified: SEED_TIMESTAMP,
    sort_option: 0,
    sort_order: 0,
});

const NEW_ITEMS = [
    make_exe(
        'p1AboutMeDesktopExe0001',
        'About Me',
        '/assets/icons/about-me.png',
    ),
    make_exe('p1MyCvDesktopExe0000001', 'My CV', '/assets/icons/my-cv.png'),
    make_exe(
        'p1ContactMeDesktopExe01',
        'Contact Me',
        '/assets/icons/contact-me.png',
    ),
];

const hd = JSON.parse(fs.readFileSync(SEED_PATH, 'utf8'));

for (const id of REMOVE) {
    if (!hd[id]) throw new Error(`expected item missing: ${id}`);
    delete hd[id];
}
for (const item of NEW_ITEMS) {
    if (hd[item.id]) throw new Error(`id collision: ${item.id}`);
    hd[item.id] = item;
}

// §3.5 order (top-to-bottom on the desktop's left edge)
hd[DESKTOP_ID].children = [
    KEEP_MY_COMPUTER,
    'p1AboutMeDesktopExe0001',
    'p1MyCvDesktopExe0000001',
    KEEP_IE,
    'p1ContactMeDesktopExe01',
];

// consistency: no dangling children, no dangling parents
for (const [id, item] of Object.entries(hd)) {
    for (const child of item.children ?? []) {
        if (!hd[child]) throw new Error(`dangling child ${child} in ${id}`);
    }
    if (item.parent && !hd[item.parent]) {
        throw new Error(`dangling parent ${item.parent} in ${id}`);
    }
}

// compact, matching the seed's existing single-line format — a pretty-printed
// rewrite would bury the real 3-remove/3-add diff in a full-file reformat
fs.writeFileSync(SEED_PATH, JSON.stringify(hd));
console.log(`curated: ${Object.keys(hd).length} items on disk`);
