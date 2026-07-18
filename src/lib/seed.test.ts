import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SEED_VERSION, merge_on_reseed, shouldReseed } from './seed';
import type { HardDrive, VfsItem } from './types';

describe('seed versioning', () => {
    it('exposes a non-empty content-hash version', () => {
        expect(SEED_VERSION).toMatch(/^[a-f0-9]{16,64}$/);
    });

    it('reseeds when nothing is stored', () => {
        expect(shouldReseed(undefined)).toBe(true);
        expect(shouldReseed(null)).toBe(true);
    });

    it('reseeds on version mismatch', () => {
        expect(shouldReseed('0000000000000000')).toBe(true);
    });

    it('does not reseed when versions match', () => {
        expect(shouldReseed(SEED_VERSION)).toBe(false);
    });

    it('SEED_VERSION matches the current hard_drive.json content hash', () => {
        const digest = createHash('sha256')
            .update(readFileSync('static/json/hard_drive.json'))
            .digest('hex')
            .slice(0, 32);
        expect(SEED_VERSION).toBe(digest);
    });
});

const item = (over: Partial<VfsItem> & { id: string }): VfsItem => ({
    type: 'file',
    name: over.id,
    basename: over.id,
    ext: '',
    children: [],
    date_created: 0,
    date_modified: 0,
    sort_option: 0,
    sort_order: 0,
    ...over,
});

const drive = (...items: VfsItem[]): HardDrive =>
    Object.fromEntries(items.map((i) => [i.id, i]));

describe('merge_on_reseed', () => {
    const seed = drive(
        item({ id: 'desktop', type: 'folder', children: ['seeded_exe'] }),
        item({ id: 'seeded_exe', parent: 'desktop', storage_type: 'fake' }),
    );

    it('carries a local desktop file and relinks it into children', () => {
        const cached = drive(
            item({
                id: 'desktop',
                type: 'folder',
                children: ['seeded_exe', 'draw'],
            }),
            item({ id: 'seeded_exe', parent: 'desktop', storage_type: 'fake' }),
            item({ id: 'draw', parent: 'desktop', storage_type: 'local' }),
        );
        const merged = merge_on_reseed(cached, seed);
        expect(merged['draw']).toBeDefined();
        expect(merged['desktop']?.children).toEqual(['seeded_exe', 'draw']);
    });

    it('carries a nested user-folder tree whole (transitive parents)', () => {
        const cached = drive(
            item({ id: 'desktop', type: 'folder', children: ['dir'] }),
            item({
                id: 'dir',
                type: 'folder',
                parent: 'desktop',
                storage_type: 'local',
                children: ['inner'],
            }),
            item({ id: 'inner', parent: 'dir', storage_type: 'local' }),
        );
        const merged = merge_on_reseed(cached, seed);
        expect(merged['dir']?.children).toEqual(['inner']);
        expect(merged['inner']).toBeDefined();
        expect(merged['desktop']?.children).toContain('dir');
    });

    it('drops orphaned locals (parent chain broken everywhere)', () => {
        const cached = drive(
            item({ id: 'lost', parent: 'gone', storage_type: 'local' }),
        );
        expect(merge_on_reseed(cached, seed)['lost']).toBeUndefined();
    });

    it('does NOT carry stale fake/remote items (retires old placeholders)', () => {
        const cached = drive(
            item({ id: 'desktop', type: 'folder', children: ['old_exe'] }),
            item({ id: 'old_exe', parent: 'desktop', storage_type: 'fake' }),
        );
        const merged = merge_on_reseed(cached, seed);
        expect(merged['old_exe']).toBeUndefined();
        expect(merged['desktop']?.children).toEqual(['seeded_exe']);
    });

    it('seed always wins for ids it contains', () => {
        const cached = drive(
            item({ id: 'desktop', type: 'folder', children: [] }),
            item({
                id: 'seeded_exe',
                parent: 'desktop',
                storage_type: 'local',
            }),
        );
        const merged = merge_on_reseed(cached, seed);
        expect(merged['seeded_exe']?.storage_type).toBe('fake');
        expect(merged['desktop']?.children).toEqual(['seeded_exe']);
    });

    it('a carried folder only keeps carried children', () => {
        const cached = drive(
            item({ id: 'desktop', type: 'folder', children: ['dir'] }),
            item({
                id: 'dir',
                type: 'folder',
                parent: 'desktop',
                storage_type: 'local',
                children: ['copy'],
            }),
            item({ id: 'copy', parent: 'dir', storage_type: 'remote' }),
        );
        expect(merge_on_reseed(cached, seed)['dir']?.children).toEqual([]);
    });
});
