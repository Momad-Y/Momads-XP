import { describe, expect, it } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
    ALL_PROGRAMS,
    NOT_PROGRAMS,
    launchable_paths,
} from './start_menu_programs';

/**
 * "All Programs should mean all programs."
 *
 * Media Player Classic was missing from the menu for as long as it has
 * existed. Nothing could have caught that: the list lived inside
 * `start_menu.svelte`, where no test could reach it, and there was no
 * statement anywhere of what the list was supposed to contain.
 *
 * So the folder is the source of truth. Every component under
 * `src/routes/xp/programs/` must either be IN the menu or be named in
 * `NOT_PROGRAMS` with a reason — a new program that is neither fails here
 * rather than going unnoticed for months.
 */

const PROGRAMS_DIR = 'src/routes/xp/programs';

function program_components(): string[] {
    return readdirSync(join(process.cwd(), PROGRAMS_DIR), {
        withFileTypes: true,
    })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.svelte'))
        .map((entry) => entry.name)
        .sort();
}

const listed = new Set(
    launchable_paths().map((path) => path.replace('./programs/', '')),
);

describe('All Programs covers every program', () => {
    it('accounts for every component in the programs folder', () => {
        const unaccounted = program_components().filter(
            (file) => !listed.has(file) && !(file in NOT_PROGRAMS),
        );
        expect(
            unaccounted,
            'these are neither in All Programs nor explained in NOT_PROGRAMS',
        ).toEqual([]);
    });

    /* The video player — the omission that prompted all of this. */
    it('includes Media Player Classic', () => {
        expect(listed.has('media_player_classic.svelte')).toBe(true);
    });

    it('includes every program that was already there', () => {
        for (const file of [
            'my_computer.svelte',
            'about_me.svelte',
            'pdf_viewer.svelte',
            'internet_explorer.svelte',
            'contact_me.svelte',
            'cmd.svelte',
            'python.svelte',
            'paint.svelte',
            'music_player.svelte',
        ]) {
            expect(listed.has(file), `${file} fell out of All Programs`).toBe(
                true,
            );
        }
    });
});

describe('the exclusion list stays honest', () => {
    it('names only components that exist', () => {
        const files = new Set(program_components());
        const stale = Object.keys(NOT_PROGRAMS).filter(
            (name) => !files.has(name),
        );
        expect(stale, 'NOT_PROGRAMS mentions components that are gone').toEqual(
            [],
        );
    });

    it('never excludes something the menu also launches', () => {
        const both = Object.keys(NOT_PROGRAMS).filter((name) =>
            listed.has(name),
        );
        expect(both).toEqual([]);
    });

    it('gives a reason for every exclusion', () => {
        for (const [name, reason] of Object.entries(NOT_PROGRAMS)) {
            expect(reason.length, `${name} has no reason`).toBeGreaterThan(10);
        }
    });
});

describe('the entries themselves', () => {
    it('gives every entry a name and an icon', () => {
        for (const entry of ALL_PROGRAMS) {
            expect(entry.name.length).toBeGreaterThan(0);
            expect(entry.icon.startsWith('/')).toBe(true);
        }
    });

    it('gives every entry either a launch path or a submenu', () => {
        for (const entry of ALL_PROGRAMS) {
            expect(
                entry.path != null || entry.items != null,
                `${entry.name} does nothing`,
            ).toBe(true);
        }
    });

    it('lists no program twice', () => {
        const paths = launchable_paths().filter(
            // the Games placeholders all share one component by design
            (path) => path !== './programs/placeholder.svelte',
        );
        expect(paths).toHaveLength(new Set(paths).size);
    });
});
