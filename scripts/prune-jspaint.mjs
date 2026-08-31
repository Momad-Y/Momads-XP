#!/usr/bin/env node
/**
 * Harden the vendored jspaint bundle (Phase 3, plan T2 / spec D-C3).
 *
 * WHY: gate 2 found live third-party data paths in the bundle, and probing the
 * PRODUCTION deploy confirmed the whole tree is directly linkable —
 * /html/jspaint/{index.html,package.json,CNAME,src/imgur.js,CHANGELOG.md} all
 * returned 200. `sessions.js` honours `#load:<url>`, which fetches and renders
 * an ARBITRARY attacker URL on the owner's own domain.
 *
 * WHAT THIS IS NOT: a rewrite. Every edit is a REMOVAL of a capability —
 * a script tag, a menu entry, a branch, an unreferenced file. jspaint's logic
 * is not patched. That boundary is spec decision D-C2, amended at gate 4 to
 * permit removals whose symbols are still referenced (see step C).
 *
 * TWO TRAPS THIS SCRIPT EXISTS TO AVOID, both found at gate 4:
 *
 *   1. `sessions.js` must keep defining `window.new_local_session`. It is
 *      called UNGUARDED from `functions.js` (`open_from_image_info`, the path
 *      `paint.svelte` uses to open a VFS image, and `file_new`). Dropping the
 *      SYMBOL leaves the reopened canvas blank — verified by mutation against
 *      `e2e/paint.spec.ts`, which goes red on it. The file's contents are now
 *      a no-op stub (step C); only that one symbol has to survive.
 *
 *   2. DO NOT "prune to what index.html loads". `index.html` references
 *      `styles/themes` ZERO times — `theme.js:5` builds the path at runtime and
 *      `paint.svelte:241` asks for `classic.css` by name. A naive prune deletes
 *      the only stylesheet Paint has. The deletion list below is an explicit
 *      ALLOWLIST of files verified unreferenced, never a computed set.
 *
 * Idempotent: every step is a no-op when already applied. Every step asserts
 * its anchor exists, so a jspaint upgrade that moves the code fails loudly
 * rather than silently skipping the hardening.
 */
import {
    readFileSync,
    writeFileSync,
    existsSync,
    rmSync,
    readdirSync,
    statSync,
} from 'node:fs';
import { join } from 'node:path';

const ROOT = 'static/html/jspaint';
const changes = [];
const skipped = [];

function die(msg) {
    console.error(`prune-jspaint FAILED: ${msg}`);
    process.exit(1);
}

function read(rel) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) die(`${rel} does not exist — is jspaint vendored?`);
    return readFileSync(p, 'utf8');
}
function write(rel, s) {
    writeFileSync(join(ROOT, rel), s);
}

/**
 * Remove `text` from `src` exactly once.
 * `required` = the removal must be possible OR already done; anything else is
 * a hard failure, because a silently-skipped security removal is the worst
 * outcome this script can produce.
 */
function cut(src, text, label, alreadyGone) {
    if (!src.includes(text)) {
        if (alreadyGone(src)) {
            skipped.push(`${label} (already removed)`);
            return src;
        }
        die(`anchor for "${label}" not found, and it is not already removed`);
    }
    changes.push(label);
    return src.replace(text, '');
}

// ── A. delete unreferenced files ────────────────────────────────────────────
// EXPLICIT ALLOWLIST. Each entry was verified not to be referenced by
// index.html or by any runtime string construction (theme.js, help.js,
// helpers.js, msgbox.js, tool-options.js, app-localization.js, functions.js).
const DELETE = [
    'package.json',
    'package-lock.json',
    'CNAME', // contains "jspaint.app"
    'CHANGELOG.md',
    'CONTRIBUTING.md',
    'README.md',
    'TODO.md',
    'cypress',
    'cypress.json',
    'jsconfig.json',
    '.eslintrc.js',
    '.travis.yml',
    '.github',
    'test-news-newer.html',
    'lib/tracky-mouse', // webcam + TensorFlow; its script tags are already commented out
    'src/electron-main.js',
    // Orphaned by the MultiUserSession removal below: 396 KB of Firebase SDK
    // that index.html never references (only a comment mentions firebase) and
    // nothing loads at runtime. It stayed directly linkable under /html/ after
    // the first prune — dead weight and attack surface.
    'lib/firebase.js',
    // The injected half of the Electron bridge, orphaned with electron-main.js.
    'src/electron-injected.js',
    // The three scripts whose capabilities step B removes.
    'src/imgur.js',
    'src/speech-recognition.js',
    'src/test-news.js',
];

for (const rel of DELETE) {
    const p = join(ROOT, rel);
    if (existsSync(p)) {
        rmSync(p, { recursive: true, force: true });
        changes.push(`deleted ${rel}`);
    } else {
        skipped.push(`${rel} (already gone)`);
    }
}

// Source maps: nobody fetches them and they are ~10 MB of third-party source.
function dropMaps(dir) {
    for (const entry of readdirSync(dir)) {
        const p = join(dir, entry);
        if (statSync(p).isDirectory()) dropMaps(p);
        else if (entry.endsWith('.map')) {
            rmSync(p);
            changes.push(`deleted ${p.slice(ROOT.length + 1)}`);
        }
    }
}
dropMaps(ROOT);

// ── B. index.html: drop script tags and the third-party news block ──────────
let html = read('index.html');

html = cut(
    html,
    '\t<script src="src/imgur.js"></script>\n',
    'index.html: imgur.js script tag',
    (s) => !s.includes('src/imgur.js'),
);
html = cut(
    html,
    '\t<script src="src/speech-recognition.js"></script>\n',
    'index.html: speech-recognition.js script tag',
    (s) => !s.includes('src/speech-recognition.js'),
);
html = cut(
    html,
    '\t<script defer src="src/test-news.js"></script>\n',
    'index.html: test-news.js script tag',
    (s) => !s.includes('src/test-news.js'),
);

// The #news block embeds 12 <img src="https://i.postimg.cc/..."> tags inside a
// `hidden` div. `hidden` is display:none, which does NOT suppress image
// fetches — so every Paint open leaked the visitor's IP to a third party.
// test-news.js (deleted above) dereferences #news with no null guard, which is
// why the two must go together.
if (html.includes('<div id="news" hidden>')) {
    const start = html.indexOf('\t<div id="news" hidden>');
    if (start < 0) die('#news block found but not at the expected indent');
    const endMarker = '\n\t</div>\n';
    const end = html.indexOf(endMarker, start);
    if (end < 0) die('#news block has no matching close');
    const block = html.slice(start, end + endMarker.length);
    if (!block.includes('i.postimg.cc'))
        die('#news block does not contain the expected third-party images');
    html = html.slice(0, start) + html.slice(end + endMarker.length);
    changes.push(
        `index.html: #news block (${String(block.split('\n').length)} lines)`,
    );
} else {
    skipped.push('#news block (already removed)');
}
write('index.html', html);

// ── C. sessions.js: replaced wholesale with a no-op stub ───────────────────
// Was: surgery on three branches inside the vendored file (the Firebase
// `#session:` hash, the `#load:<url>` render, and the MultiUserSession class),
// keeping LocalSession so jspaint's localStorage autosave carried on working.
//
// That last assumption was wrong, and a browser probe is what showed it.
// paint.svelte loads index.html with no session in the hash, so the file minted
// a FRESH RANDOM id on every open and wrote `image#<random>` without ever
// reading the previous one back — two consecutive Paint windows produced two
// unrelated keys. The autosave was write-only: one orphaned PNG data URL per
// Paint window, accumulating against the localStorage quota forever.
//
// So nothing in the original is worth keeping except the one symbol
// functions.js calls unguarded. Writing the stub is still a REMOVAL under spec
// D-C2 (amended at gate 4 to permit removals whose symbols are still
// referenced): everything goes except `window.new_local_session`.
//
// The stub is a real file rather than a template literal here because its own
// comments are full of backticks.
const sessions_stub = readFileSync(
    join(import.meta.dirname, 'jspaint-sessions-stub.js'),
    'utf8',
);
if (read('src/sessions.js') !== sessions_stub) {
    write('src/sessions.js', sessions_stub);
    changes.push(
        'sessions.js: replaced with a no-op stub (Firebase + API key, #load:<url>, and the write-only localStorage autosave)',
    );
} else {
    skipped.push('sessions.js stub (already applied)');
}

// ── D. menus.js: remove the two menu entries that reach the internet ────────
let menus = read('src/menus.js');

/** Remove the menu-entry object containing `needle`, braces balanced. */
function cutMenuEntry(src, needle, label) {
    const at = src.indexOf(needle);
    if (at < 0) {
        skipped.push(`${label} (already removed)`);
        return src;
    }
    let start = src.lastIndexOf('\t\t\t{\n', at);
    if (start < 0) die(`${label}: could not find the entry's opening brace`);
    let depth = 0;
    let i = start;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) break;
        }
    }
    if (depth !== 0) die(`${label}: unbalanced braces`);
    let end = i + 1;
    if (src.slice(end, end + 2) === ',\n') end += 2;
    changes.push(label);
    return src.slice(0, start) + src.slice(end);
}

menus = cutMenuEntry(
    menus,
    'localize("&Load From URL")',
    'menus.js: File > Load From URL (fetches an arbitrary URL)',
);
menus = cutMenuEntry(
    menus,
    'localize("&Upload To Imgur")',
    'menus.js: File > Upload To Imgur',
);
write('src/menus.js', menus);

// ── E2. functions.js: the About-Paint update check ─────────────────────────
// The LARGEST third-party path the first prune missed. Help > About Paint
// AUTOMATICALLY fetches https://jspaint.app, DOMParses the response, and the
// "What's New?" button APPENDS that remote subtree into the live jspaint
// document with jQuery — whose .append() extracts and globalEvals any <script>
// it contains. jspaint runs on our REAL origin (allow-same-origin is required
// for the Save As bridge), so a compromise of jspaint.app would mean script
// execution against the VFS, /api/browse and /api/email. It also re-imported
// the exact i.postimg.cc images the first prune deleted, from the remote copy.
//
// The guide previously called this "a Help-menu action, not an automatic
// fetch". Both halves of that were wrong.
let functions_pre = read('src/functions.js');
if (functions_pre.includes('"https://jspaint.app"')) {
    functions_pre = functions_pre.replace(
        /const url =\n(?:\s*\/\/.*\n)*\s*"https:\/\/jspaint\.app";/,
        'const url = null; // update check removed by scripts/prune-jspaint.mjs',
    );
    // Guard the fetch so a null url is a no-op rather than a request to "null".
    functions_pre = functions_pre.replace(
        'const url = null; // update check removed by scripts/prune-jspaint.mjs\n\tfetch(url)',
        'const url = null; // update check removed by scripts/prune-jspaint.mjs\n\tif (!url) return;\n\tfetch(url)',
    );
    write('src/functions.js', functions_pre);
    changes.push(
        'functions.js: About-Paint update check (fetch of jspaint.app)',
    );
} else {
    skipped.push('About-Paint update check (already removed)');
}

// ── E3. functions.js: third-party CORS relays ──────────────────────────────
// `#load:` is gone, but load_image_from_uri still fanned out to two public
// proxies, and TWO other call sites still reach it: the paste handler
// (app.js — any text/plain or text/uri-list clipboard item) and edit_paste's
// fallback. So pasting a URL into Paint sent that URL and the visitor's IP to
// third parties and rendered the result — the same arbitrary-URL-render
// primitive on a different trigger. jspaint-cors-proxy.herokuapp.com is a free
// Heroku dyno, i.e. very likely dead and re-registrable.
let functions_cors = read('src/functions.js');
if (functions_cors.includes('cors.bridged.cc')) {
    functions_cors = functions_cors.replace(
        /const uris_to_try = \(is_download && !is_localhost\) \? \[[\s\S]*?\] : \[uri\];/,
        'const uris_to_try = [uri]; // third-party CORS relays removed by scripts/prune-jspaint.mjs',
    );
    write('src/functions.js', functions_cors);
    changes.push(
        'functions.js: cors.bridged.cc / herokuapp / web.archive.org relays',
    );
} else {
    skipped.push('CORS relays (already removed)');
}

// ── E. functions.js: the SECOND Imgur entry point ──────────────────────────
// A live "Upload to Imgur" button in the GIF-export window (Ctrl+Shift+G).
// Missed by the original audit; found at gate 4.
let functions = read('src/functions.js');
const imgurBtn = `			$win.$Button("Upload to Imgur", () => {
				$win.close();
				sanity_check_blob(blob, () => {
					show_imgur_uploader(blob);
				});
			}).focus();
`;
if (functions.includes(imgurBtn)) {
    functions = functions.replace(imgurBtn, '');
    changes.push('functions.js: GIF-export "Upload to Imgur" button');
} else if (functions.includes('show_imgur_uploader')) {
    die(
        'functions.js still references show_imgur_uploader in an unexpected shape',
    );
} else {
    skipped.push('functions.js imgur button (already removed)');
}
write('src/functions.js', functions);

// ── report ─────────────────────────────────────────────────────────────────
console.log('prune-jspaint:');
for (const c of changes) console.log(`  removed  ${c}`);
for (const s of skipped) console.log(`  skip     ${s}`);

// Nothing may still reference a capability we removed.
const finalHtml = read('index.html');
for (const banned of [
    'src/imgur.js',
    'src/speech-recognition.js',
    'src/test-news.js',
    'i.postimg.cc',
]) {
    if (finalHtml.includes(banned))
        die(`index.html still references ${banned}`);
}
const finalFunctions = read('src/functions.js');
// Only NETWORK paths are banned. `jspaint.app` still appears as an <a href>
// and in a `location.origin` comparison; an inert anchor is not a fetch, and
// the sandbox blocks target=_blank anyway.
if (finalFunctions.includes('show_imgur_uploader')) {
    die('functions.js still references show_imgur_uploader');
}
// Assert the CONSTRUCT, not the string: `cors.bridged.cc` also appears in an
// explanatory comment, and banning the bare substring made this script fail on
// its own output.
if (!finalFunctions.includes('const uris_to_try = [uri];')) {
    die('functions.js still builds a multi-proxy uris_to_try list');
}
for (const proxy of [
    '`https://cors.bridged.cc/',
    '`https://jspaint-cors-proxy',
]) {
    if (finalFunctions.includes(proxy)) {
        die(`functions.js still interpolates a proxy URL: ${proxy}`);
    }
}
if (
    /fetch\(\s*url\s*\)/.test(finalFunctions) &&
    finalFunctions.includes('checking-for-updates')
) {
    const at = finalFunctions.indexOf('checking-for-updates');
    if (!finalFunctions.slice(at, at + 400).includes('const url = null')) {
        die('functions.js still performs the About-Paint update fetch');
    }
}
const finalSessions = read('src/sessions.js');
for (const banned of [
    'firebaseio.com',
    'load_from_url_match',
    'MultiUserSession',
    // Added when step C became a stub: the API-key prefix that tripped
    // secret-scanning alert #1, and the two constructs that made the autosave
    // a write-only localStorage leak. Matched as CODE, so the stub's own
    // comments explaining what was removed do not trip them.
    'AIzaSy',
    'new LocalSession',
    'storage.set(',
]) {
    if (finalSessions.includes(banned))
        die(`sessions.js still references ${banned}`);
}
if (!finalSessions.includes('window.new_local_session'))
    die(
        'sessions.js lost new_local_session — File>New and image open would break',
    );
if (!existsSync(join(ROOT, 'styles/themes/classic.css')))
    die('styles/themes/classic.css was deleted — Paint would render unstyled');

console.log('\nprune-jspaint passed');
