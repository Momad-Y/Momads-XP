/**
 * ONE-TIME: seed `src/lib/generated/retired_seed_ids.json` from git history.
 *
 * WHY THIS IS NOT PART OF `generate-vfs.ts`:
 *  - CI clones can be shallow, and a generator that walks history would emit a
 *    different file there than it does here — which the freshness gate would
 *    then fail, mysteriously.
 *  - Generation must be deterministic from the working tree. Reading git makes
 *    the output depend on which branches happen to exist locally.
 *
 * So the walk runs once, by hand, and `generate-vfs.ts` maintains the file
 * from then on: every run unions the previous seed's ids into it and removes
 * whatever the new seed still ships (see `retired_ids` there).
 *
 * Re-running this is safe and non-destructive: it unions with whatever the
 * file already holds. Useful as an audit — if it produces a diff, an id was
 * shipped at some point that the ledger had lost.
 *
 * Scope: `origin/main` and `origin/dev` only. A feature branch's seed reached
 * no visitor, and widening the set widens the (already negligible) chance of
 * colliding with a `short.generate()` id a visitor's own item was born with.
 *
 * Usage: npx tsx scripts/backfill-retired-ids.ts [--write]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const LEDGER = 'src/lib/generated/retired_seed_ids.json';
const SEED = 'static/json/hard_drive.json';
const BRANCHES = ['origin/main', 'origin/dev'];

const git = (args: string[]): string =>
    execFileSync('git', args, {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
    });

function ids_at(sha: string): string[] {
    try {
        const raw = git(['show', `${sha}:${SEED}`]);
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null) return [];
        return Object.keys(parsed);
    } catch {
        // the file did not exist at that commit
        return [];
    }
}

const shas = git(['log', '--format=%H', ...BRANCHES, '--', SEED])
    .split('\n')
    .filter((line) => line !== '');

const historical = new Set<string>();
for (const sha of shas) for (const id of ids_at(sha)) historical.add(id);

const parsed_current: unknown = JSON.parse(readFileSync(SEED, 'utf8'));
const current = new Set(
    typeof parsed_current === 'object' && parsed_current !== null
        ? Object.keys(parsed_current)
        : [],
);

const existing: string[] = existsSync(LEDGER)
    ? (JSON.parse(readFileSync(LEDGER, 'utf8')) as string[])
    : [];

const retired = [...new Set([...existing, ...historical])]
    .filter((id) => !current.has(id))
    .sort();

console.log(
    `${String(shas.length)} commits of ${SEED} across ${BRANCHES.join(' + ')}`,
);
console.log(
    `${String(historical.size)} ids ever shipped, ${String(current.size)} shipped now, ` +
        `${String(retired.length)} retired (${String(existing.length)} already in the ledger)`,
);

if (process.argv.includes('--write')) {
    writeFileSync(LEDGER, `${JSON.stringify(retired, null, 4)}\n`);
    console.log(`wrote ${LEDGER}`);
} else {
    console.log(`dry run — pass --write to update ${LEDGER}`);
}
