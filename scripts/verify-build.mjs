#!/usr/bin/env node
/**
 * Post-build assertions that no other gate in this repo can make.
 *
 * WHY THIS EXISTS (docs/phase-3-redteam-plan.md, MEDIUM "three of T1's four
 * tests have no harness"): the Phase 3 plan claimed several build-output
 * checks, and none of them had anywhere to run. vitest only sees
 * `src/**\/*.test.ts` and executes BEFORE `npm run build`, so it cannot look at
 * `build/`. Rollup's "dynamically imported ... also statically imported"
 * warning goes to `vite build`'s stdout, which nothing captured.
 *
 * EVERY CHECK PROVES ITS TARGET EXISTS FIRST. A grep-shaped assertion that
 * silently passes because the file moved is exactly the "test that cannot
 * fail" this repo has shipped three times.
 *
 * Usage:
 *   node scripts/verify-build.mjs [path/to/build.log]
 *
 * The log argument is optional; when absent the Rollup-warning check is
 * reported as SKIPPED rather than passing vacuously.
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BUILD = 'build';
const failures = [];
const notes = [];

function fail(msg) {
    failures.push(msg);
}
function ok(msg) {
    notes.push(`  ok      ${msg}`);
}
function skip(msg) {
    notes.push(`  SKIPPED ${msg}`);
}

/** Every .css emitted into the client asset dir. */
function css_files() {
    const dir = join(BUILD, '_app', 'immutable', 'assets');
    if (!existsSync(dir)) return null;
    return readdirSync(dir)
        .filter((f) => f.endsWith('.css'))
        .map((f) => join(dir, f));
}

// ── 0. the build exists at all ───────────────────────────────────────────────
if (!existsSync(BUILD)) {
    fail(`no ${BUILD}/ directory — run \`npm run build\` first`);
} else if (!existsSync(join(BUILD, 'index.html'))) {
    fail(`${BUILD}/index.html missing — the build did not complete`);
} else {
    ok('build output present');

    // ── 1. xterm's CSS must not land in the entry bundle ─────────────────────
    // The terminal apps are lazily imported, so xterm's stylesheet should emit
    // as its own asset and be absent from whatever CSS index.html links.
    // The real trap (gate 4) is NOT a stray top-level import: it is that a
    // module both statically AND dynamically imported does not get split at
    // all, and Rollup only WARNS. That silently drags ~89 KB into first paint.
    const entry_html = readFileSync(join(BUILD, 'index.html'), 'utf8');
    const linked = [...entry_html.matchAll(/href="([^"]+\.css)"/g)].map(
        (m) => m[1],
    );
    if (linked.length === 0) {
        // Not a pass: if index.html links no CSS at all, the check below would
        // be vacuous, so say so loudly instead.
        skip('no CSS linked from index.html — entry-CSS check is vacuous here');
    } else {
        // Only same-origin hrefs are files on disk. `src/app.html` links
        // jQuery UI's stylesheet from code.jquery.com, which is not ours to
        // inspect — treating it as a local path made this check fail on a
        // perfectly good build.
        const local = linked.filter((h) => !/^https?:\/\//.test(h));
        let leaked = false;
        for (const href of local) {
            const p = join(BUILD, href.replace(/^\//, ''));
            if (!existsSync(p)) {
                fail(`index.html links ${href} but the file is missing`);
                continue;
            }
            if (readFileSync(p, 'utf8').includes('.xterm')) {
                fail(`xterm CSS leaked into entry stylesheet ${href}`);
                leaked = true;
            }
        }
        if (!leaked)
            ok(`no .xterm rules in ${local.length} local entry stylesheet(s)`);
    }

    // ── 2. if xterm shipped at all, it must be in a NON-entry chunk ──────────
    const all_css = css_files();
    if (all_css === null) {
        fail(
            'build/_app/immutable/assets missing — cannot inspect emitted CSS',
        );
    } else {
        const with_xterm = all_css.filter((f) =>
            readFileSync(f, 'utf8').includes('.xterm'),
        );
        if (with_xterm.length === 0) {
            skip('xterm CSS not emitted yet (terminal apps not built)');
        } else {
            ok(`xterm CSS isolated in ${with_xterm.length} split chunk(s)`);
        }
    }

    // ── 3. pruned jspaint paths must not be deployed (T2) ───────────────────
    // Verified live on production BEFORE the prune: these all returned 200.
    const must_not_ship = [
        'html/jspaint/package.json',
        'html/jspaint/CNAME',
        'html/jspaint/CHANGELOG.md',
        'html/jspaint/src/imgur.js',
    ];
    const jspaint_root = join(BUILD, 'html', 'jspaint');
    if (!existsSync(jspaint_root)) {
        skip('jspaint not in build output — prune check not applicable');
    } else {
        const still_there = must_not_ship.filter((p) =>
            existsSync(join(BUILD, p)),
        );
        if (still_there.length > 0) {
            fail(
                `pruned jspaint paths still deployed: ${still_there.join(', ')}`,
            );
        } else {
            ok('pruned jspaint paths absent from build output');
        }
        // And the inverse: the theme jspaint loads by RUNTIME string
        // construction (theme.js builds `styles/themes/${theme}`) must survive.
        // index.html references it ZERO times, so a naive "prune to what
        // index.html loads" deletes the only stylesheet Paint has.
        const theme = join(jspaint_root, 'styles', 'themes', 'classic.css');
        if (!existsSync(theme)) {
            fail(
                'jspaint styles/themes/classic.css is MISSING — paint.svelte ' +
                    'calls set_theme("classic.css") by name; Paint will render unstyled',
            );
        } else {
            ok('jspaint classic.css survived the prune');
        }
    }
}

// ── 4. Rollup code-splitting warning ────────────────────────────────────────
const log_path = process.argv[2];
if (!log_path) {
    skip('no build log passed — cannot check the Rollup splitting warning');
} else if (!existsSync(log_path)) {
    fail(`build log ${log_path} does not exist`);
} else {
    const log = readFileSync(log_path, 'utf8');
    if (log.trim().length === 0) {
        fail(`build log ${log_path} is empty — nothing was captured`);
    } else {
        // A module imported BOTH statically and dynamically is not split at
        // all — Rollup only warns. That is the real trap for the lazily loaded
        // terminal apps: one stray static import drags xterm (~89 KB) into
        // first paint, with no error anywhere.
        //
        // BASELINED, not zero-tolerance. Dialog.svelte already trips this on
        // `dev` (statically imported by no_association.ts, about_me,
        // contact_me, my_computer and zip; dynamically by four others). It
        // predates Phase 3, and untangling a shipped, red-teamed component is
        // not this phase's work. Same convention as the svelte-check warning
        // baseline: the rule is do not GROW it.
        const BASELINE = ['src/lib/components/xp/Dialog.svelte'];
        const offenders = [
            ...log.matchAll(
                /(\S+) is dynamically imported by .*? but also statically imported/g,
            ),
        ].map((m) => m[1].replace(/^.*?(src\/.*)$/, '$1'));
        const fresh = offenders.filter((f) => !BASELINE.includes(f));
        if (fresh.length > 0) {
            fail(
                `Rollup: ${fresh.join(', ')} is both statically and dynamically ` +
                    'imported and was NOT split — a lazily loaded app has been ' +
                    'pulled into the entry bundle',
            );
        } else if (offenders.length > 0) {
            ok(
                `no NEW static+dynamic import warnings (${String(offenders.length)} baselined)`,
            );
        } else {
            ok('no Rollup static+dynamic import warning');
        }
    }
}

console.log('verify-build:');
for (const n of notes) console.log(n);
if (failures.length > 0) {
    console.error('\nverify-build FAILED:');
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
}
console.log('\nverify-build passed');
