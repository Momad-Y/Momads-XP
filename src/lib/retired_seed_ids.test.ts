import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import RETIRED_SEED_IDS from './generated/retired_seed_ids.json';
import { to_hard_drive } from './types';

/**
 * The retired-id ledger: every id the seed has ever shipped and no longer
 * ships.
 *
 * It exists because provenance used to be INFERRED from what a visitor
 * happened to have stored. `merge_on_reseed` reaps a dropped seed item only
 * when `hard_drive_seed_fields` proves the id came from a seed — and that
 * snapshot only shipped on 2026-08-23, so for a drive older than that nothing
 * was ever reaped. Dropped items were carried forever: stale music tracks
 * pointing at 404 URLs after the library rewrite, and a ghost `C:\Awards`
 * folder after the Certificates & Awards merge whose `.txt` files rendered
 * "This file cannot be displayed." — permanently, because the snapshot
 * written after that boot describes the NEW seed, which does not contain them.
 *
 * The ledger turns that into a fact declared at build time. These tests guard
 * the two properties everything else rests on: it means "not shipped any
 * more", and it is not empty.
 */

const seed = to_hard_drive(
    JSON.parse(readFileSync('static/json/hard_drive.json', 'utf-8')),
);

const git = (args: string[]): string =>
    execFileSync('git', args, {
        encoding: 'utf8',
        maxBuffer: 256 * 1024 * 1024,
    });

/*
 * CI checks out with `fetch-depth: 0`, so the remote branches are there — but
 * a shallow clone or a fork without them would make the history audit below
 * fail for a reason that has nothing to do with the ledger. It is an audit,
 * not the guard: the four tests above are the guard, and `generate-vfs.ts`
 * maintains the file incrementally without needing git at all. So the audit
 * runs where history exists and skips, loudly, where it does not.
 */
const history_refs = ['origin/main', 'origin/dev'].filter((ref) => {
    try {
        git(['rev-parse', '--verify', '--quiet', ref]);
        return true;
    } catch {
        return false;
    }
});

describe('the retired-id ledger', () => {
    it('shares nothing with the seed that ships today', () => {
        /*
         * THE invariant. An id in both would be reaped out of the drive by
         * `is_dropped_seed_item` and immediately restored by `{ ...seed }` —
         * or worse, reaped while the visitor's edits to it were carried.
         */
        const overlap = RETIRED_SEED_IDS.filter((id) => seed[id] != null);
        expect(overlap, 'these ids are both retired and shipped').toEqual([]);
    });

    it('is not empty, and is not a placeholder', () => {
        // A backfill that silently produced `[]` would leave every ghost in
        // place and every test below vacuously green.
        expect(RETIRED_SEED_IDS.length).toBeGreaterThan(100);
        for (const id of RETIRED_SEED_IDS) {
            expect(typeof id).toBe('string');
            expect(id.length).toBeGreaterThan(0);
        }
    });

    it('has no duplicates and is sorted', () => {
        // sorted so that a content change produces a readable diff rather
        // than a reshuffle
        expect(RETIRED_SEED_IDS).toHaveLength(new Set(RETIRED_SEED_IDS).size);
        expect([...RETIRED_SEED_IDS]).toEqual([...RETIRED_SEED_IDS].sort());
    });

    it('holds the ids the two known ghosts came from', () => {
        /*
         * Named explicitly because these are the reported bugs: the folder and
         * entries from the Certifications+Awards merge, and a track from the
         * music library rewrite. If a future backfill loses history, this is
         * what notices.
         */
        for (const id of [
            'p2FolderAwards',
            'p2Award1stPlaceRoboCupHomeEducationCompetitionEgypt0',
            'picAwards',
            'p3MusicAscentTrack00001',
        ]) {
            expect(RETIRED_SEED_IDS, `${id} fell out of the ledger`).toContain(
                id,
            );
        }
    });

    it.skipIf(history_refs.length === 0)(
        'accounts for every id the seed has ever shipped',
        () => {
            /*
             * The ledger is maintained incrementally by `generate-vfs.ts`, which
             * only ever sees the PREVIOUS seed. This checks it against the whole
             * record instead: every id in any version of `hard_drive.json` on
             * `main` or `dev` must be either shipped now or retired.
             *
             * Reads git rather than trusting the artefact — that is the point. If
             * someone regenerates the ledger from an empty state, or drops the
             * file, this fails where the incremental rule cannot.
             */
            const shas = git([
                'log',
                '--format=%H',
                ...history_refs,
                '--',
                'static/json/hard_drive.json',
            ])
                .split('\n')
                .filter((line) => line !== '');
            expect(shas.length).toBeGreaterThan(5);

            const known = new Set([...RETIRED_SEED_IDS, ...Object.keys(seed)]);
            const unaccounted = new Set<string>();
            for (const sha of shas) {
                let raw: string;
                try {
                    raw = git(['show', `${sha}:static/json/hard_drive.json`]);
                } catch {
                    continue; // the file did not exist at that commit
                }
                const parsed: unknown = JSON.parse(raw);
                if (typeof parsed !== 'object' || parsed === null) continue;
                for (const id of Object.keys(parsed)) {
                    if (!known.has(id)) unaccounted.add(id);
                }
            }
            expect(
                [...unaccounted],
                'shipped once, now neither in the seed nor in the ledger',
            ).toEqual([]);
        },
    );
});
